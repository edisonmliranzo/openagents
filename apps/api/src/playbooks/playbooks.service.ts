import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AgentService } from '../agent/agent.service'
import { WorkflowsService } from '../workflows/workflows.service'
import { PrismaService } from '../prisma/prisma.service'
import { MissionControlService } from '../mission-control/mission-control.service'
import type {
  CreatePlaybookInput,
  PlaybookDefinition,
  PlaybookParameter,
  PlaybookRun,
  PlaybookRunStatus,
  PlaybookTargetKind,
  RunPlaybookInput,
  UpdatePlaybookInput,
  WorkflowStep,
} from '@openagents/shared'

const PLAYBOOKS_FILE = 'PLAYBOOKS.json'
const STORE_VERSION = 1
const MAX_PLAYBOOKS_PER_USER = 200
const MAX_RUNS_PER_USER = 500

interface PlaybookStoreFile {
  version: number
  playbooks: PlaybookDefinition[]
  runs: PlaybookRun[]
}

@Injectable()
export class PlaybooksService {
  private readonly loadedUsers = new Set<string>()
  private readonly playbooksByUser = new Map<string, PlaybookDefinition[]>()
  private readonly runsByUser = new Map<string, PlaybookRun[]>()

  constructor(
    private agent: AgentService,
    private workflows: WorkflowsService,
    private prisma: PrismaService,
    private mission: MissionControlService,
  ) {}

  async list(userId: string) {
    await this.ensureLoaded(userId)
    return [...(this.playbooksByUser.get(userId) ?? [])]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(userId: string, playbookId: string) {
    const playbook = await this.getPlaybook(userId, playbookId)
    return { ...playbook }
  }

  async create(userId: string, input: CreatePlaybookInput) {
    await this.ensureLoaded(userId)
    const existing = [...(this.playbooksByUser.get(userId) ?? [])]
    if (existing.length >= MAX_PLAYBOOKS_PER_USER) {
      throw new BadRequestException(`Playbook limit reached (${MAX_PLAYBOOKS_PER_USER}).`)
    }

    const now = new Date().toISOString()
    const playbook: PlaybookDefinition = {
      id: randomUUID(),
      userId,
      name: this.requireName(input.name),
      description: this.optionalText(input.description),
      targetKind: this.sanitizeTargetKind(input.targetKind),
      parameterSchema: this.sanitizeParameterSchema(input.parameterSchema ?? []),
      promptTemplate: this.optionalText(input.promptTemplate),
      workflowTemplate: input.workflowTemplate ? this.sanitizeWorkflowTemplate(input.workflowTemplate) : null,
      createdAt: now,
      updatedAt: now,
    }
    this.validatePlaybookTemplate(playbook)
    existing.push(playbook)
    this.playbooksByUser.set(userId, existing)
    await this.persist(userId)
    return playbook
  }

  async update(userId: string, playbookId: string, input: UpdatePlaybookInput) {
    await this.ensureLoaded(userId)
    const playbooks = [...(this.playbooksByUser.get(userId) ?? [])]
    const index = playbooks.findIndex((playbook) => playbook.id === playbookId)
    if (index === -1) throw new NotFoundException(`Playbook "${playbookId}" not found.`)

    const current = playbooks[index]
    const next: PlaybookDefinition = {
      ...current,
      ...(input.name !== undefined ? { name: this.requireName(input.name) } : {}),
      ...(input.description !== undefined ? { description: this.optionalText(input.description) } : {}),
      ...(input.targetKind !== undefined ? { targetKind: this.sanitizeTargetKind(input.targetKind) } : {}),
      ...(input.parameterSchema !== undefined
        ? { parameterSchema: this.sanitizeParameterSchema(input.parameterSchema) }
        : {}),
      ...(input.promptTemplate !== undefined ? { promptTemplate: this.optionalText(input.promptTemplate) } : {}),
      ...(input.workflowTemplate !== undefined
        ? { workflowTemplate: input.workflowTemplate ? this.sanitizeWorkflowTemplate(input.workflowTemplate) : null }
        : {}),
      updatedAt: new Date().toISOString(),
    }
    this.validatePlaybookTemplate(next)
    playbooks[index] = next
    this.playbooksByUser.set(userId, playbooks)
    await this.persist(userId)
    return next
  }

  async remove(userId: string, playbookId: string) {
    await this.ensureLoaded(userId)
    const playbooks = [...(this.playbooksByUser.get(userId) ?? [])]
    const filtered = playbooks.filter((playbook) => playbook.id !== playbookId)
    if (filtered.length === playbooks.length) {
      throw new NotFoundException(`Playbook "${playbookId}" not found.`)
    }
    this.playbooksByUser.set(userId, filtered)
    await this.persist(userId)
    return { ok: true as const }
  }

  async listRuns(userId: string, playbookId: string, limit = 25) {
    await this.getPlaybook(userId, playbookId)
    await this.ensureLoaded(userId)
    const safeLimit = Math.max(1, Math.min(limit, 100))
    return [...(this.runsByUser.get(userId) ?? [])]
      .filter((run) => run.playbookId === playbookId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, safeLimit)
  }

  async run(userId: string, playbookId: string, input: RunPlaybookInput = {}) {
    const playbook = await this.getPlaybook(userId, playbookId)
    const params = this.validateAndCoerceParams(playbook.parameterSchema, input.params ?? {})

    const startedAt = new Date().toISOString()
    const run: PlaybookRun = {
      id: randomUUID(),
      playbookId: playbook.id,
      userId,
      status: 'running',
      startedAt,
      finishedAt: null,
      input: params,
      outputSummary: null,
      error: null,
    }
    await this.ensureLoaded(userId)
    this.appendRun(userId, run)
    await this.persist(userId)

    void this.mission.publish({
      userId,
      type: 'playbook_run',
      status: 'started',
      source: 'playbook',
      runId: run.id,
      payload: {
        playbookId: playbook.id,
        playbookName: playbook.name,
        targetKind: playbook.targetKind,
      },
    })

    try {
      if (playbook.targetKind === 'agent_prompt') {
        const prompt = this.resolveTemplate(playbook.promptTemplate ?? '', params)
        const conversationId = await this.createConversation(userId, playbook.name)
        await this.agent.run({
          conversationId,
          userId,
          userMessage: prompt,
          emit: () => {},
        })
        const latestAgent = await this.prisma.message.findFirst({
          where: { conversationId, role: 'agent' },
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        })
        run.conversationId = conversationId
        run.outputSummary = latestAgent?.content?.slice(0, 800) ?? 'Agent run completed.'
      } else {
        const template = playbook.workflowTemplate
        if (!template) throw new BadRequestException('Workflow template is required for workflow playbooks.')
        const resolvedName = this.resolveTemplate(template.name ?? playbook.name, params)
        const resolvedSteps = this.resolveStepTemplates(template.steps, params)
        const workflowRun = await this.workflows.runAdHoc(userId, {
          name: resolvedName || playbook.name,
          steps: resolvedSteps,
          source: 'playbook.workflow',
        })
        run.workflowRunId = workflowRun.id
        run.outputSummary = workflowRun.status === 'done'
          ? `Workflow steps completed: ${workflowRun.stepResults.length}.`
          : `Workflow run ended with status ${workflowRun.status}.`
        if (workflowRun.status === 'error') {
          run.error = workflowRun.error ?? 'Workflow run failed.'
        }
      }

      run.status = run.error ? 'error' : 'done'
    } catch (error: any) {
      run.status = 'error'
      run.error = this.safeError(error)
      run.outputSummary = null
    }

    run.finishedAt = new Date().toISOString()
    this.replaceRun(userId, run)
    await this.persist(userId)

    void this.mission.publish({
      userId,
      type: run.status === 'error' ? 'failure' : 'playbook_run',
      status: run.status === 'error' ? 'failed' : 'success',
      source: 'playbook',
      runId: run.id,
      payload: {
        playbookId: playbook.id,
        playbookName: playbook.name,
        targetKind: playbook.targetKind,
        error: run.error,
      },
    })

    return run
  }

  private validatePlaybookTemplate(playbook: PlaybookDefinition) {
    if (playbook.targetKind === 'agent_prompt') {
      if (!playbook.promptTemplate?.trim()) {
        throw new BadRequestException('Prompt template is required for agent_prompt playbooks.')
      }
      return
    }
    if (!playbook.workflowTemplate || playbook.workflowTemplate.steps.length === 0) {
      throw new BadRequestException('Workflow template with at least one step is required.')
    }
  }

  private sanitizeTargetKind(kind: PlaybookTargetKind | string): PlaybookTargetKind {
    if (kind === 'agent_prompt' || kind === 'workflow') return kind
    throw new BadRequestException(`Unsupported playbook target: ${kind}`)
  }

  private sanitizeWorkflowTemplate(raw: { name?: string; steps: WorkflowStep[] }) {
    const steps = this.sanitizeWorkflowSteps(raw.steps)
    if (steps.length === 0) throw new BadRequestException('Workflow template must include steps.')
    return {
      ...(this.optionalText(raw.name) ? { name: this.optionalText(raw.name)! } : {}),
      steps,
    }
  }

  private sanitizeWorkflowSteps(raw: WorkflowStep[]) {
    const out: WorkflowStep[] = []
    for (const [index, step] of (raw ?? []).entries()) {
      const normalized = this.sanitizeWorkflowStep(step, index)
      if (normalized) out.push(normalized)
    }
    return out
  }

  private sanitizeWorkflowStep(step: WorkflowStep, index: number): WorkflowStep | null {
    if (!step || typeof step !== 'object') return null
    const type = step.type
    if (type !== 'agent_prompt' && type !== 'tool_call' && type !== 'delay') return null
    const id = this.optionalText(step.id)?.slice(0, 80) ?? `step-${index + 1}`
    const label = this.optionalText(step.label)?.slice(0, 120) ?? `Step ${index + 1}`
    const conversationId = this.optionalText(step.conversationId)?.slice(0, 120) ?? undefined

    if (type === 'agent_prompt') {
      const prompt = this.optionalText(step.prompt)
      if (!prompt) throw new BadRequestException(`Workflow step ${index + 1} missing prompt.`)
      return { id, type, label, prompt, ...(conversationId ? { conversationId } : {}) }
    }

    if (type === 'tool_call') {
      const toolName = this.optionalText(step.toolName)
      if (!toolName) throw new BadRequestException(`Workflow step ${index + 1} missing toolName.`)
      const input = this.asRecord(step.input) ?? {}
      return { id, type, label, toolName, input }
    }

    const delayRaw = Number.parseInt(`${step.delayMs ?? 1000}`, 10)
    const delayMs = Number.isFinite(delayRaw) ? Math.max(100, Math.min(delayRaw, 300_000)) : 1000
    return { id, type, label, delayMs }
  }

  private sanitizeParameterSchema(raw: PlaybookParameter[]) {
    const schema: PlaybookParameter[] = []
    const usedKeys = new Set<string>()
    for (const [index, param] of (raw ?? []).entries()) {
      if (!param || typeof param !== 'object') continue
      const key = this.normalizeParamKey(param.key)
      if (!key || usedKeys.has(key)) continue
      usedKeys.add(key)
      const type = this.sanitizeParamType(param.type)
      const label = this.optionalText(param.label)?.slice(0, 120) ?? `Param ${index + 1}`
      const description = this.optionalText(param.description)?.slice(0, 300) ?? undefined
      const defaultValue = this.coerceParamType(type, param.defaultValue, false)

      schema.push({
        key,
        label,
        type,
        required: Boolean(param.required),
        ...(description ? { description } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {}),
      })
      if (schema.length >= 40) break
    }
    return schema
  }

  private validateAndCoerceParams(schema: PlaybookParameter[], raw: Record<string, unknown>) {
    const input = this.asRecord(raw) ?? {}
    const resolved: Record<string, unknown> = {}
    for (const param of schema) {
      const provided = Object.prototype.hasOwnProperty.call(input, param.key)
        ? input[param.key]
        : undefined
      const fallback = provided === undefined ? param.defaultValue : provided
      const coerced = this.coerceParamType(param.type, fallback, param.required)
      if (coerced === undefined) {
        if (param.required) {
          throw new BadRequestException(`Missing required parameter: ${param.key}`)
        }
        continue
      }
      resolved[param.key] = coerced
    }
    for (const [key, value] of Object.entries(input)) {
      if (!(key in resolved)) {
        resolved[key] = value
      }
    }
    return resolved
  }

  private sanitizeParamType(type: string) {
    if (type === 'text' || type === 'number' || type === 'boolean') return type
    return 'text'
  }

  private coerceParamType(
    type: PlaybookParameter['type'],
    value: unknown,
    required: boolean,
  ): string | number | boolean | undefined {
    if (value == null || value === '') {
      return required ? undefined : undefined
    }

    if (type === 'text') {
      return String(value)
    }

    if (type === 'number') {
      const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
      if (!Number.isFinite(parsed)) {
        if (required) throw new BadRequestException(`Invalid numeric parameter value: ${value}`)
        return undefined
      }
      return parsed
    }

    if (typeof value === 'boolean') return value
    const text = String(value).trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(text)) return true
    if (['false', '0', 'no', 'off'].includes(text)) return false
    if (required) throw new BadRequestException(`Invalid boolean parameter value: ${value}`)
    return undefined
  }

  private resolveStepTemplates(steps: WorkflowStep[], params: Record<string, unknown>) {
    return steps.map((step) => {
      const raw = this.deepResolve(step, params)
      return this.sanitizeWorkflowStep(raw as WorkflowStep, 0) as WorkflowStep
    })
  }

  private deepResolve(value: unknown, params: Record<string, unknown>): unknown {
    if (typeof value === 'string') return this.resolveTemplate(value, params)
    if (Array.isArray(value)) return value.map((entry) => this.deepResolve(entry, params))
    if (!value || typeof value !== 'object') return value
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = this.deepResolve(entry, params)
    }
    return out
  }

  private resolveTemplate(template: string, params: Record<string, unknown>) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
      const value = params[key]
      if (value == null) return ''
      return String(value)
    })
  }

  private appendRun(userId: string, run: PlaybookRun) {
    const runs = [...(this.runsByUser.get(userId) ?? []), run]
    this.runsByUser.set(userId, runs.slice(-MAX_RUNS_PER_USER))
  }

  private replaceRun(userId: string, run: PlaybookRun) {
    const runs = [...(this.runsByUser.get(userId) ?? [])]
    const index = runs.findIndex((entry) => entry.id === run.id)
    if (index === -1) runs.push(run)
    else runs[index] = run
    this.runsByUser.set(userId, runs.slice(-MAX_RUNS_PER_USER))
  }

  private async getPlaybook(userId: string, playbookId: string) {
    await this.ensureLoaded(userId)
    const playbook = (this.playbooksByUser.get(userId) ?? []).find((entry) => entry.id === playbookId)
    if (!playbook) throw new NotFoundException(`Playbook "${playbookId}" not found.`)
    return playbook
  }

  private async createConversation(userId: string, playbookName: string) {
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
        title: `Playbook: ${playbookName}`.slice(0, 80),
      },
      select: { id: true },
    })
    return conversation.id
  }

  private requireName(name: string) {
    const trimmed = (name ?? '').trim()
    if (!trimmed) throw new BadRequestException('Playbook name is required.')
    return trimmed.slice(0, 120)
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private normalizeParamKey(value: unknown) {
    const raw = typeof value === 'string' ? value : ''
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64)
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Playbook run failed'
  }

  private async ensureLoaded(userId: string) {
    if (this.loadedUsers.has(userId)) return
    const store = await this.readStore(this.storeFilePath(userId))
    const playbooks = (store.playbooks ?? [])
      .filter((playbook) => playbook.userId === userId)
      .map((playbook) => this.sanitizeStoredPlaybook(playbook, userId))
      .filter((playbook): playbook is PlaybookDefinition => Boolean(playbook))
    const runs = (store.runs ?? [])
      .filter((run) => run.userId === userId)
      .map((run) => this.sanitizeStoredRun(run, userId))
      .filter((run): run is PlaybookRun => Boolean(run))
      .slice(-MAX_RUNS_PER_USER)
    this.playbooksByUser.set(userId, playbooks)
    this.runsByUser.set(userId, runs)
    this.loadedUsers.add(userId)
  }

  private sanitizeStoredPlaybook(playbook: PlaybookDefinition, userId: string): PlaybookDefinition | null {
    try {
      const normalized: PlaybookDefinition = {
        id: this.optionalText(playbook.id) ?? randomUUID(),
        userId,
        name: this.requireName(playbook.name),
        description: this.optionalText(playbook.description),
        targetKind: this.sanitizeTargetKind(playbook.targetKind),
        parameterSchema: this.sanitizeParameterSchema(playbook.parameterSchema ?? []),
        promptTemplate: this.optionalText(playbook.promptTemplate),
        workflowTemplate: playbook.workflowTemplate
          ? this.sanitizeWorkflowTemplate(playbook.workflowTemplate)
          : null,
        createdAt: this.normalizeIso(playbook.createdAt) ?? new Date().toISOString(),
        updatedAt: this.normalizeIso(playbook.updatedAt) ?? new Date().toISOString(),
      }
      this.validatePlaybookTemplate(normalized)
      return normalized
    } catch {
      return null
    }
  }

  private sanitizeStoredRun(run: PlaybookRun, userId: string): PlaybookRun | null {
    if (!run || typeof run !== 'object') return null
    const startedAt = this.normalizeIso(run.startedAt)
    if (!startedAt) return null
    const status = this.normalizeRunStatus(run.status)
    if (!status) return null
    const playbookId = this.optionalText(run.playbookId)
    if (!playbookId) return null
    return {
      id: this.optionalText(run.id) ?? randomUUID(),
      playbookId,
      userId,
      status,
      startedAt,
      finishedAt: this.normalizeIso(run.finishedAt),
      input: this.asRecord(run.input) ?? {},
      outputSummary: this.optionalText(run.outputSummary),
      error: this.optionalText(run.error),
      ...(this.optionalText(run.conversationId) ? { conversationId: this.optionalText(run.conversationId)! } : {}),
      ...(this.optionalText(run.workflowRunId) ? { workflowRunId: this.optionalText(run.workflowRunId)! } : {}),
    }
  }

  private normalizeRunStatus(value: unknown): PlaybookRunStatus | null {
    if (value === 'running' || value === 'done' || value === 'error') return value
    return null
  }

  private normalizeIso(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }

  private async persist(userId: string) {
    const filePath = this.storeFilePath(userId)
    const payload: PlaybookStoreFile = {
      version: STORE_VERSION,
      playbooks: this.playbooksByUser.get(userId) ?? [],
      runs: this.runsByUser.get(userId) ?? [],
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private async readStore(filePath: string): Promise<PlaybookStoreFile> {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PlaybookStoreFile>
      return {
        version: Number.isFinite(parsed.version) ? Number(parsed.version) : STORE_VERSION,
        playbooks: Array.isArray(parsed.playbooks) ? parsed.playbooks : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      }
    } catch {
      return { version: STORE_VERSION, playbooks: [], runs: [] }
    }
  }

  private storeFilePath(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    return path.join(root, userId, PLAYBOOKS_FILE)
  }
}
