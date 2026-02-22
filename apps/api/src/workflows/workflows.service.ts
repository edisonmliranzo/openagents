import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AgentService } from '../agent/agent.service'
import { ToolsService } from '../tools/tools.service'
import { PrismaService } from '../prisma/prisma.service'
import { MissionControlService } from '../mission-control/mission-control.service'
import type {
  CreateWorkflowInput,
  RunWorkflowInput,
  UpdateWorkflowInput,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStep,
  WorkflowStepRunResult,
  WorkflowTrigger,
  WorkflowTriggerKind,
} from '@openagents/shared'

const WORKFLOWS_FILE = 'WORKFLOWS.json'
const STORE_VERSION = 1
const MAX_WORKFLOWS_PER_USER = 150
const MAX_RUNS_PER_USER = 400
const SCHEDULER_INTERVAL_MS = 30_000

interface WorkflowStoreFile {
  version: number
  workflows: WorkflowDefinition[]
  runs: WorkflowRun[]
}

@Injectable()
export class WorkflowsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowsService.name)
  private readonly loadedUsers = new Set<string>()
  private readonly workflowsByUser = new Map<string, WorkflowDefinition[]>()
  private readonly runsByUser = new Map<string, WorkflowRun[]>()
  private readonly runningWorkflowIds = new Set<string>()
  private schedulerTimer?: NodeJS.Timeout
  private schedulerInFlight = false

  constructor(
    private agent: AgentService,
    private tools: ToolsService,
    private prisma: PrismaService,
    private mission: MissionControlService,
  ) {}

  onModuleInit() {
    this.schedulerTimer = setInterval(() => {
      void this.tickScheduledWorkflows()
    }, SCHEDULER_INTERVAL_MS)
    this.schedulerTimer.unref()
  }

  onModuleDestroy() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer)
      this.schedulerTimer = undefined
    }
  }

  async list(userId: string) {
    await this.ensureLoaded(userId)
    return [...(this.workflowsByUser.get(userId) ?? [])]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(userId: string, workflowId: string) {
    const workflow = await this.getWorkflow(userId, workflowId)
    return { ...workflow }
  }

  async create(userId: string, input: CreateWorkflowInput) {
    await this.ensureLoaded(userId)
    const workflows = [...(this.workflowsByUser.get(userId) ?? [])]
    if (workflows.length >= MAX_WORKFLOWS_PER_USER) {
      throw new BadRequestException(`Workflow limit reached (${MAX_WORKFLOWS_PER_USER}).`)
    }

    const now = new Date().toISOString()
    const trigger = this.sanitizeTrigger(input.trigger, true)
    const workflow: WorkflowDefinition = {
      id: randomUUID(),
      userId,
      name: this.requireName(input.name),
      description: this.optionalText(input.description),
      enabled: input.enabled ?? true,
      trigger,
      steps: this.sanitizeSteps(input.steps, true),
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt: (input.enabled ?? true) ? this.computeNextRunAt(trigger, new Date()) : null,
    }

    workflows.push(workflow)
    this.workflowsByUser.set(userId, workflows)
    await this.persist(userId)
    return workflow
  }

  async update(userId: string, workflowId: string, input: UpdateWorkflowInput) {
    await this.ensureLoaded(userId)
    const workflows = [...(this.workflowsByUser.get(userId) ?? [])]
    const index = workflows.findIndex((workflow) => workflow.id === workflowId)
    if (index === -1) throw new NotFoundException(`Workflow "${workflowId}" not found.`)

    const current = workflows[index]
    const nextTrigger = input.trigger
      ? this.sanitizeTrigger(input.trigger, false, current.trigger)
      : current.trigger
    const nextEnabled = input.enabled ?? current.enabled
    const updatedAt = new Date().toISOString()

    const next: WorkflowDefinition = {
      ...current,
      ...(input.name !== undefined ? { name: this.requireName(input.name) } : {}),
      ...(input.description !== undefined ? { description: this.optionalText(input.description) } : {}),
      enabled: nextEnabled,
      trigger: nextTrigger,
      ...(input.steps !== undefined ? { steps: this.sanitizeSteps(input.steps, false) } : {}),
      updatedAt,
      nextRunAt: nextEnabled
        ? (nextTrigger.kind === 'schedule'
            ? (current.nextRunAt && input.trigger === undefined
                ? current.nextRunAt
                : this.computeNextRunAt(nextTrigger, new Date()))
            : null)
        : null,
    }

    workflows[index] = next
    this.workflowsByUser.set(userId, workflows)
    await this.persist(userId)
    return next
  }

  async remove(userId: string, workflowId: string) {
    await this.ensureLoaded(userId)
    const workflows = [...(this.workflowsByUser.get(userId) ?? [])]
    const next = workflows.filter((workflow) => workflow.id !== workflowId)
    if (next.length === workflows.length) {
      throw new NotFoundException(`Workflow "${workflowId}" not found.`)
    }
    this.workflowsByUser.set(userId, next)
    await this.persist(userId)
    return { ok: true as const }
  }

  async listRuns(userId: string, workflowId: string, limit = 25) {
    await this.getWorkflow(userId, workflowId)
    await this.ensureLoaded(userId)
    const safeLimit = Math.max(1, Math.min(limit, 100))
    return [...(this.runsByUser.get(userId) ?? [])]
      .filter((run) => run.workflowId === workflowId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, safeLimit)
  }

  async run(userId: string, workflowId: string, input: RunWorkflowInput = {}) {
    const triggerKind = this.sanitizeTriggerKind(input.triggerKind ?? 'manual')
    const workflow = await this.getWorkflow(userId, workflowId)

    if (!workflow.enabled && triggerKind !== 'manual') {
      throw new BadRequestException('Workflow is disabled.')
    }

    if (triggerKind === 'webhook') {
      const provided = (input.webhookSecret ?? '').trim()
      const expected = workflow.trigger.webhookSecret?.trim() ?? ''
      if (!expected) {
        throw new BadRequestException('Workflow has no webhook secret configured.')
      }
      if (!provided || provided !== expected) {
        throw new BadRequestException('Invalid webhook secret.')
      }
    }

    if (this.runningWorkflowIds.has(workflow.id)) {
      throw new BadRequestException('Workflow is already running.')
    }

    this.runningWorkflowIds.add(workflow.id)
    try {
      return await this.executeWorkflow(userId, workflow, triggerKind, {
        persistRun: true,
        source: 'workflow',
      })
    } finally {
      this.runningWorkflowIds.delete(workflow.id)
    }
  }

  async runAdHoc(
    userId: string,
    input: {
      name: string
      steps: WorkflowStep[]
      triggerKind?: WorkflowTriggerKind
      source?: string
    },
  ) {
    const now = new Date().toISOString()
    const workflow: WorkflowDefinition = {
      id: `adhoc-${randomUUID()}`,
      userId,
      name: this.requireName(input.name),
      description: null,
      enabled: true,
      trigger: { kind: 'manual' },
      steps: this.sanitizeSteps(input.steps, true),
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt: null,
    }

    return this.executeWorkflow(
      userId,
      workflow,
      this.sanitizeTriggerKind(input.triggerKind ?? 'manual'),
      {
        persistRun: false,
        source: input.source ?? 'workflow.adhoc',
      },
    )
  }

  private async executeWorkflow(
    userId: string,
    workflow: WorkflowDefinition,
    triggerKind: WorkflowTriggerKind,
    options: {
      persistRun: boolean
      source: string
    },
  ): Promise<WorkflowRun> {
    const startedAt = new Date().toISOString()
    const run: WorkflowRun = {
      id: randomUUID(),
      workflowId: workflow.id,
      userId,
      triggerKind,
      status: 'running',
      startedAt,
      finishedAt: null,
      error: null,
      stepResults: [],
    }

    if (options.persistRun) {
      await this.ensureLoaded(userId)
      this.appendRun(userId, run)
      this.updateWorkflowForRun(userId, workflow.id, workflow.trigger, startedAt)
      await this.persist(userId)
    }

    void this.mission.publish({
      userId,
      type: 'workflow_run',
      status: 'started',
      source: options.source,
      runId: run.id,
      payload: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        triggerKind,
      },
    })

    let activeConversationId: string | null = null
    let runError: string | null = null

    for (const step of workflow.steps) {
      const stepStartedAt = new Date().toISOString()
      const stepResult: WorkflowStepRunResult = {
        stepId: step.id,
        type: step.type,
        status: 'running',
        startedAt: stepStartedAt,
        finishedAt: stepStartedAt,
        output: null,
        error: null,
      }

      try {
        if (step.type === 'delay') {
          const delayMs = Math.max(100, Math.min(step.delayMs ?? 1000, 5 * 60_000))
          await this.sleep(delayMs)
          stepResult.output = `Delayed for ${delayMs} ms.`
        } else if (step.type === 'tool_call') {
          const result = await this.tools.execute(step.toolName ?? '', step.input ?? {}, userId)
          if (!result.success) {
            throw new Error(result.error ?? `Tool call failed for ${step.toolName}`)
          }
          stepResult.output = this.renderOutput(result.output)
        } else if (step.type === 'agent_prompt') {
          if (!activeConversationId) {
            activeConversationId = step.conversationId?.trim() || await this.createRunConversation(userId, workflow.name)
          }
          await this.agent.run({
            conversationId: activeConversationId,
            userId,
            userMessage: step.prompt ?? '',
            emit: () => {},
          })
          stepResult.output = `Agent run completed in conversation ${activeConversationId}.`
        } else {
          throw new Error(`Unsupported workflow step type: ${step.type}`)
        }

        stepResult.status = 'done'
      } catch (error: any) {
        runError = this.safeError(error)
        stepResult.status = 'error'
        stepResult.error = runError
        stepResult.finishedAt = new Date().toISOString()
        run.stepResults.push(stepResult)
        break
      }

      stepResult.finishedAt = new Date().toISOString()
      run.stepResults.push(stepResult)
    }

    run.finishedAt = new Date().toISOString()
    run.error = runError
    run.status = runError ? 'error' : 'done'

    if (options.persistRun) {
      this.replaceRun(userId, run)
      this.updateWorkflowForRun(userId, workflow.id, workflow.trigger, run.finishedAt)
      await this.persist(userId)
    }

    void this.mission.publish({
      userId,
      type: run.status === 'error' ? 'failure' : 'workflow_run',
      status: run.status === 'error' ? 'failed' : 'success',
      source: options.source,
      runId: run.id,
      payload: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        triggerKind,
        stepCount: run.stepResults.length,
        error: run.error,
      },
    })
    return run
  }

  private async tickScheduledWorkflows() {
    if (this.schedulerInFlight) return
    this.schedulerInFlight = true

    try {
      const userIds = await this.listKnownUsers()
      for (const userId of userIds) {
        await this.ensureLoaded(userId, true)
        const workflows = [...(this.workflowsByUser.get(userId) ?? [])]

        for (const workflow of workflows) {
          if (!workflow.enabled || workflow.trigger.kind !== 'schedule') continue
          const nextRunTs = workflow.nextRunAt ? new Date(workflow.nextRunAt).getTime() : 0
          if (!Number.isFinite(nextRunTs)) continue
          if (nextRunTs > Date.now()) continue
          if (this.runningWorkflowIds.has(workflow.id)) continue

          try {
            await this.run(userId, workflow.id, { triggerKind: 'schedule' })
          } catch (error: any) {
            this.logger.warn(`Scheduled workflow ${workflow.id} failed: ${this.safeError(error)}`)
          }
        }
      }
    } catch (error: any) {
      this.logger.warn(`Scheduler tick failed: ${this.safeError(error)}`)
    } finally {
      this.schedulerInFlight = false
    }
  }

  private async getWorkflow(userId: string, workflowId: string) {
    await this.ensureLoaded(userId)
    const workflow = (this.workflowsByUser.get(userId) ?? []).find((item) => item.id === workflowId)
    if (!workflow) throw new NotFoundException(`Workflow "${workflowId}" not found.`)
    if (workflow.userId !== userId) throw new BadRequestException('Workflow ownership mismatch.')
    return workflow
  }

  private updateWorkflowForRun(
    userId: string,
    workflowId: string,
    trigger: WorkflowTrigger,
    finishedAtIso: string,
  ) {
    const workflows = [...(this.workflowsByUser.get(userId) ?? [])]
    const index = workflows.findIndex((workflow) => workflow.id === workflowId)
    if (index === -1) return

    const current = workflows[index]
    const updated: WorkflowDefinition = {
      ...current,
      lastRunAt: finishedAtIso,
      updatedAt: finishedAtIso,
      nextRunAt: current.enabled ? this.computeNextRunAt(trigger, new Date(finishedAtIso)) : null,
    }
    workflows[index] = updated
    this.workflowsByUser.set(userId, workflows)
  }

  private appendRun(userId: string, run: WorkflowRun) {
    const runs = [...(this.runsByUser.get(userId) ?? []), run]
    this.runsByUser.set(userId, runs.slice(-MAX_RUNS_PER_USER))
  }

  private replaceRun(userId: string, run: WorkflowRun) {
    const runs = [...(this.runsByUser.get(userId) ?? [])]
    const index = runs.findIndex((entry) => entry.id === run.id)
    if (index === -1) {
      runs.push(run)
    } else {
      runs[index] = run
    }
    this.runsByUser.set(userId, runs.slice(-MAX_RUNS_PER_USER))
  }

  private sanitizeSteps(raw: WorkflowStep[] | undefined, requireSteps: boolean) {
    const out: WorkflowStep[] = []
    for (const [index, step] of (raw ?? []).entries()) {
      const normalized = this.sanitizeStep(step, index)
      if (normalized) out.push(normalized)
    }
    if (requireSteps && out.length === 0) {
      throw new BadRequestException('Workflow must include at least one valid step.')
    }
    return out
  }

  private sanitizeStep(step: WorkflowStep, index: number): WorkflowStep | null {
    if (!step || typeof step !== 'object') return null
    const type = this.sanitizeStepType(step.type)
    if (!type) return null

    const id = this.optionalText(step.id)?.slice(0, 80) ?? randomUUID()
    const label = this.optionalText(step.label)?.slice(0, 120) || `Step ${index + 1}`
    const conversationId = this.optionalText(step.conversationId)?.slice(0, 128) ?? undefined

    if (type === 'agent_prompt') {
      const prompt = this.optionalText(step.prompt)
      if (!prompt) throw new BadRequestException(`Step ${index + 1}: agent prompt is required.`)
      return { id, type, label, prompt: prompt.slice(0, 10_000), ...(conversationId ? { conversationId } : {}) }
    }

    if (type === 'tool_call') {
      const toolName = this.optionalText(step.toolName)
      if (!toolName) throw new BadRequestException(`Step ${index + 1}: tool name is required.`)
      const input = this.asRecord(step.input) ?? {}
      return { id, type, label, toolName: toolName.slice(0, 120), input }
    }

    const delayRaw = Number.parseInt(`${step.delayMs ?? 0}`, 10)
    const delayMs = Number.isFinite(delayRaw) ? Math.max(100, Math.min(delayRaw, 5 * 60_000)) : 1000
    return { id, type, label, delayMs }
  }

  private sanitizeTrigger(
    trigger: WorkflowTrigger | undefined,
    creating: boolean,
    fallback?: WorkflowTrigger,
  ): WorkflowTrigger {
    const kind = this.sanitizeTriggerKind(trigger?.kind ?? fallback?.kind ?? 'manual')

    if (kind === 'manual') {
      return { kind: 'manual' }
    }

    if (kind === 'schedule') {
      const everyRaw = Number.parseInt(`${trigger?.everyMinutes ?? fallback?.everyMinutes ?? 60}`, 10)
      const everyMinutes = Number.isFinite(everyRaw) ? Math.max(1, Math.min(everyRaw, 7 * 24 * 60)) : 60
      return { kind: 'schedule', everyMinutes }
    }

    const providedSecret = this.optionalText(trigger?.webhookSecret) ?? this.optionalText(fallback?.webhookSecret)
    const webhookSecret = providedSecret
      ? providedSecret.slice(0, 200)
      : (creating ? this.buildWebhookSecret() : undefined)
    return { kind: 'webhook', ...(webhookSecret ? { webhookSecret } : {}) }
  }

  private sanitizeTriggerKind(kind: WorkflowTriggerKind | string) {
    if (kind === 'manual' || kind === 'schedule' || kind === 'webhook') return kind
    throw new BadRequestException(`Unsupported trigger kind: ${kind}`)
  }

  private sanitizeStepType(type: string | undefined) {
    if (type === 'agent_prompt' || type === 'tool_call' || type === 'delay') return type
    return null
  }

  private requireName(name: string) {
    const trimmed = (name ?? '').trim()
    if (!trimmed) throw new BadRequestException('Workflow name is required.')
    return trimmed.slice(0, 120)
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  }

  private buildWebhookSecret() {
    return randomUUID().replaceAll('-', '')
  }

  private computeNextRunAt(trigger: WorkflowTrigger, baseDate: Date) {
    if (trigger.kind !== 'schedule') return null
    const everyMinutes = Math.max(1, Math.min(trigger.everyMinutes ?? 60, 7 * 24 * 60))
    return new Date(baseDate.getTime() + everyMinutes * 60_000).toISOString()
  }

  private renderOutput(data: unknown) {
    if (data == null) return null
    if (typeof data === 'string') return data.slice(0, 6000)
    try {
      const serialized = JSON.stringify(data, null, 2)
      return serialized.length > 6000 ? `${serialized.slice(0, 6000)}...` : serialized
    } catch {
      return String(data).slice(0, 6000)
    }
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown workflow error'
  }

  private sleep(delayMs: number) {
    return new Promise<void>((resolve) => {
      setTimeout(() => resolve(), delayMs)
    })
  }

  private async createRunConversation(userId: string, workflowName: string) {
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
        title: `Workflow: ${workflowName}`.slice(0, 80),
      },
      select: { id: true },
    })
    return conversation.id
  }

  private async ensureLoaded(userId: string, forceReload = false) {
    if (!forceReload && this.loadedUsers.has(userId)) return

    const filePath = this.storeFilePath(userId)
    const store = await this.readStore(filePath)
    const workflows = (store.workflows ?? [])
      .filter((workflow) => workflow.userId === userId)
      .map((workflow) => this.sanitizeStoredWorkflow(workflow, userId))
      .filter((workflow): workflow is WorkflowDefinition => Boolean(workflow))
    const runs = (store.runs ?? [])
      .filter((run) => run.userId === userId)
      .map((run) => this.sanitizeStoredRun(run, userId))
      .filter((run): run is WorkflowRun => Boolean(run))
      .slice(-MAX_RUNS_PER_USER)

    this.workflowsByUser.set(userId, workflows)
    this.runsByUser.set(userId, runs)
    this.loadedUsers.add(userId)
  }

  private sanitizeStoredWorkflow(workflow: WorkflowDefinition, userId: string): WorkflowDefinition | null {
    try {
      const name = this.requireName(workflow.name)
      const trigger = this.sanitizeTrigger(workflow.trigger, false)
      const steps = this.sanitizeSteps(workflow.steps, true)
      const createdAt = this.normalizeIso(workflow.createdAt) ?? new Date().toISOString()
      const updatedAt = this.normalizeIso(workflow.updatedAt) ?? createdAt
      const lastRunAt = this.normalizeIso(workflow.lastRunAt)
      const nextRunAt = this.normalizeIso(workflow.nextRunAt)

      return {
        id: this.optionalText(workflow.id)?.slice(0, 120) ?? randomUUID(),
        userId,
        name,
        description: this.optionalText(workflow.description),
        enabled: Boolean(workflow.enabled),
        trigger,
        steps,
        createdAt,
        updatedAt,
        lastRunAt,
        nextRunAt,
      }
    } catch {
      return null
    }
  }

  private sanitizeStoredRun(run: WorkflowRun, userId: string): WorkflowRun | null {
    const workflowId = this.optionalText(run.workflowId)
    const startedAt = this.normalizeIso(run.startedAt)
    if (!workflowId || !startedAt) return null

    const triggerKind = this.sanitizeStoredTriggerKind(run.triggerKind)
    const status = this.sanitizeRunStatus(run.status)
    if (!triggerKind || !status) return null

    const stepResults = Array.isArray(run.stepResults)
      ? run.stepResults
        .map((step) => this.sanitizeStoredStepResult(step))
        .filter((step): step is WorkflowStepRunResult => Boolean(step))
      : []

    return {
      id: this.optionalText(run.id)?.slice(0, 120) ?? randomUUID(),
      workflowId,
      userId,
      triggerKind,
      status,
      startedAt,
      finishedAt: this.normalizeIso(run.finishedAt),
      error: this.optionalText(run.error),
      stepResults,
    }
  }

  private sanitizeStoredStepResult(step: WorkflowStepRunResult): WorkflowStepRunResult | null {
    const stepId = this.optionalText(step.stepId)
    const type = this.sanitizeStepType(step.type)
    const status = this.sanitizeRunStatus(step.status)
    const startedAt = this.normalizeIso(step.startedAt)
    const finishedAt = this.normalizeIso(step.finishedAt)
    if (!stepId || !type || !status || !startedAt || !finishedAt) return null

    return {
      stepId,
      type,
      status,
      startedAt,
      finishedAt,
      output: step.output == null ? null : String(step.output).slice(0, 6000),
      error: step.error == null ? null : String(step.error).slice(0, 6000),
    }
  }

  private sanitizeStoredTriggerKind(kind: string | undefined): WorkflowTriggerKind | null {
    if (kind === 'manual' || kind === 'schedule' || kind === 'webhook') return kind
    return null
  }

  private sanitizeRunStatus(status: string | undefined): WorkflowRunStatus | null {
    if (status === 'running' || status === 'done' || status === 'error') return status
    return null
  }

  private normalizeIso(value: string | null | undefined) {
    if (!value) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }

  private async persist(userId: string) {
    const filePath = this.storeFilePath(userId)
    const payload: WorkflowStoreFile = {
      version: STORE_VERSION,
      workflows: this.workflowsByUser.get(userId) ?? [],
      runs: this.runsByUser.get(userId) ?? [],
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private async readStore(filePath: string): Promise<WorkflowStoreFile> {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<WorkflowStoreFile>
      return {
        version: Number.isFinite(parsed.version) ? Number(parsed.version) : STORE_VERSION,
        workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      }
    } catch {
      return { version: STORE_VERSION, workflows: [], runs: [] }
    }
  }

  private async listKnownUsers() {
    const root = this.memoryRoot()
    await fs.mkdir(root, { recursive: true })
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  }

  private storeFilePath(userId: string) {
    return path.join(this.memoryRoot(), userId, WORKFLOWS_FILE)
  }

  private memoryRoot() {
    return (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
  }
}
