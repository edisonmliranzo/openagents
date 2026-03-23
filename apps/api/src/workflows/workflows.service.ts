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
import Bull, { type Queue } from 'bull'
import { AgentService } from '../agent/agent.service'
import { ToolsService } from '../tools/tools.service'
import { PrismaService } from '../prisma/prisma.service'
import { MissionControlService } from '../mission-control/mission-control.service'
import { QUEUE_NAMES, WORKFLOW_JOB_NAMES } from '@openagents/shared'
import type {
  CreateWorkflowInput,
  RunWorkflowInput,
  UpdateWorkflowInput,
  WorkflowBranchRunInput,
  WorkflowRunComparison,
  WorkflowRunComparisonMetric,
  WorkflowBranchSource,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStep,
  WorkflowStepRunResult,
  WorkflowTrigger,
  WorkflowTriggerKind,
  WorkflowRunJobData,
} from '@openagents/shared'

const WORKFLOWS_FILE = 'WORKFLOWS.json'
const STORE_VERSION = 2
const MAX_WORKFLOWS_PER_USER = 150
const MAX_RUNS_PER_USER = 400
const SCHEDULER_INTERVAL_MS = 30_000
const MAX_WORKFLOW_STEP_RETRIES = 5
const MAX_BRANCH_HOPS = 800
const TEMPLATE_TOKEN_REGEX = /{{\s*([^{}]+?)\s*}}/g

interface WorkflowStoreFile {
  version: number
  workflows: WorkflowDefinition[]
  runs: WorkflowRun[]
}

interface WorkflowTemplateContext {
  workflow: Pick<WorkflowDefinition, 'id' | 'name' | 'description'>
  triggerKind: WorkflowTriggerKind
  runInput: Record<string, unknown>
  state: Record<string, unknown>
  lastOutput: unknown
}

@Injectable()
export class WorkflowsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowsService.name)
  private readonly loadedUsers = new Set<string>()
  private readonly workflowsByUser = new Map<string, WorkflowDefinition[]>()
  private readonly runsByUser = new Map<string, WorkflowRun[]>()
  private readonly runningWorkflowIds = new Set<string>()
  private readonly workflowQueue?: Queue<WorkflowRunJobData>
  private processingMode: 'inline' | 'queue'
  private schedulerTimer?: NodeJS.Timeout
  private schedulerInFlight = false

  constructor(
    private agent: AgentService,
    private tools: ToolsService,
    private prisma: PrismaService,
    private mission: MissionControlService,
  ) {
    const configuredMode = (process.env.WORKFLOW_PROCESSING_MODE ?? 'inline').toLowerCase()
    this.processingMode = configuredMode === 'queue' ? 'queue' : 'inline'

    const redisUrl = process.env.REDIS_URL
    if (this.processingMode === 'queue' && !redisUrl) {
      this.logger.warn(
        'WORKFLOW_PROCESSING_MODE=queue but REDIS_URL is missing. Falling back to inline execution.',
      )
      this.processingMode = 'inline'
      return
    }

    if (this.processingMode === 'queue' && redisUrl) {
      this.workflowQueue = new Bull<WorkflowRunJobData>(QUEUE_NAMES.workflowRuns, redisUrl)
      this.workflowQueue.on('error', (error) => {
        this.logger.error('Workflow queue error', error?.stack ?? String(error))
      })
    }
  }

  onModuleInit() {
    this.schedulerTimer = setInterval(() => {
      void this.tickScheduledWorkflows()
    }, SCHEDULER_INTERVAL_MS)
    this.schedulerTimer.unref()
    void this.recoverInterruptedRuns()
  }

  onModuleDestroy() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer)
      this.schedulerTimer = undefined
    }
    if (this.workflowQueue) {
      void this.workflowQueue.close()
    }
  }

  async list(userId: string) {
    await this.ensureLoaded(userId)
    return [...(this.workflowsByUser.get(userId) ?? [])].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
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
      version: 1,
      trigger,
      steps: this.sanitizeSteps(input.steps, true),
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt: (input.enabled ?? true) ? this.computeNextRunAt(trigger, new Date()) : null,
      ...(input.budgetUsd != null ? { budgetUsd: Math.max(0, Number(input.budgetUsd)) } : {}),
      ...(input.webhookOutbox?.url ? { webhookOutbox: input.webhookOutbox } : {}),
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
      ...(input.description !== undefined
        ? { description: this.optionalText(input.description) }
        : {}),
      enabled: nextEnabled,
      version: Math.max(1, (current.version ?? 1) + 1),
      trigger: nextTrigger,
      ...(input.steps !== undefined ? { steps: this.sanitizeSteps(input.steps, false) } : {}),
      updatedAt,
      nextRunAt: nextEnabled
        ? nextTrigger.kind === 'schedule'
          ? current.nextRunAt && input.trigger === undefined
            ? current.nextRunAt
            : this.computeNextRunAt(nextTrigger, new Date())
          : null
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

  async rerun(userId: string, workflowId: string, runId: string, input: RunWorkflowInput = {}) {
    await this.getWorkflow(userId, workflowId)
    await this.ensureLoaded(userId)
    const previous = this.findRunById(userId, runId)
    if (!previous || previous.workflowId !== workflowId) {
      throw new NotFoundException(`Workflow run "${runId}" not found.`)
    }

    const nextInput = this.asRecord(input.input) ?? this.cloneRecord(previous.input ?? {})
    const rerun = await this.run(userId, workflowId, {
      triggerKind: input.triggerKind ?? 'manual',
      webhookSecret: input.webhookSecret,
      idempotencyKey: input.idempotencyKey,
      approvedKeys: input.approvedKeys,
      sourceEvent: input.sourceEvent ?? `rerun:${runId}`,
      input: nextInput,
    })

    const tagged: WorkflowRun = {
      ...rerun,
      rerunOfRunId: previous.id,
    }
    this.replaceRun(userId, tagged)
    await this.persist(userId)
    return tagged
  }

  async branchRun(userId: string, workflowId: string, input: WorkflowBranchRunInput) {
    await this.ensureLoaded(userId)
    const previous = this.findRunById(userId, input.sourceRunId)
    if (!previous || previous.workflowId !== workflowId) {
      throw new NotFoundException(`Workflow run "${input.sourceRunId}" not found.`)
    }

    return this.rerun(userId, workflowId, input.sourceRunId, {
      ...input,
      sourceEvent: input.sourceEvent ?? `branch:${input.sourceRunId}`,
      input: {
        ...this.cloneRecord(previous.input ?? {}),
        ...(this.asRecord(input.input) ?? {}),
      },
    })
  }

  /**
   * Fire all connector_event workflows for a user that match the given event.
   * Called by channel integrations when an external event arrives.
   */
  async fireConnectorEvent(
    userId: string,
    connectorId: string,
    eventName: string,
    payload: Record<string, unknown> = {},
  ) {
    await this.ensureLoaded(userId)
    const workflows = [...(this.workflowsByUser.get(userId) ?? [])]
    const matched = workflows.filter((workflow) => {
      if (!workflow.enabled) return false
      if (workflow.trigger.kind !== 'connector_event') return false
      if (workflow.trigger.connectorId !== connectorId) return false
      if (workflow.trigger.eventName && workflow.trigger.eventName !== eventName) return false
      const filter = workflow.trigger.eventFilter
      if (filter && Object.keys(filter).length > 0) {
        for (const [key, expected] of Object.entries(filter)) {
          const actual = String(payload[key] ?? '')
          if (!actual.includes(expected)) return false
        }
      }
      return true
    })

    const fired: string[] = []
    for (const workflow of matched) {
      if (this.runningWorkflowIds.has(workflow.id)) continue
      try {
        const idempotencyKey = `${connectorId}:${eventName}:${Date.now()}:${workflow.id}`
        await this.run(userId, workflow.id, {
          triggerKind: 'connector_event',
          idempotencyKey,
          sourceEvent: `${connectorId}:${eventName}`,
          input: payload,
        })
        fired.push(workflow.id)
      } catch (error: any) {
        this.logger.warn(
          `connector_event workflow ${workflow.id} failed: ${this.safeError(error)}`,
        )
      }
    }
    return { fired, matchedCount: matched.length }
  }

  async compareRuns(
    userId: string,
    workflowId: string,
    leftRunId: string,
    rightRunId: string,
  ): Promise<WorkflowRunComparison> {
    await this.getWorkflow(userId, workflowId)
    await this.ensureLoaded(userId)
    const left = this.findRunById(userId, leftRunId)
    const right = this.findRunById(userId, rightRunId)
    if (!left || left.workflowId !== workflowId) {
      throw new NotFoundException(`Workflow run "${leftRunId}" not found.`)
    }
    if (!right || right.workflowId !== workflowId) {
      throw new NotFoundException(`Workflow run "${rightRunId}" not found.`)
    }

    const metrics: WorkflowRunComparisonMetric[] = [
      { label: 'status', left: left.status, right: right.status },
      { label: 'duration_ms', left: String(this.durationMs(left)), right: String(this.durationMs(right)) },
      { label: 'step_count', left: String(left.stepResults.length), right: String(right.stepResults.length) },
      {
        label: 'failed_steps',
        left: String(left.stepResults.filter((step) => step.status === 'error').length),
        right: String(right.stepResults.filter((step) => step.status === 'error').length),
      },
    ]

    const allStepIds = new Set<string>([
      ...left.stepResults.map((step) => step.stepId),
      ...right.stepResults.map((step) => step.stepId),
    ])
    const changedStepIds = [...allStepIds].filter((stepId) => {
      const leftStep = left.stepResults.find((step) => step.stepId === stepId)
      const rightStep = right.stepResults.find((step) => step.stepId === stepId)
      if (!leftStep || !rightStep) return true
      return leftStep.status !== rightStep.status
        || (leftStep.output ?? '') !== (rightStep.output ?? '')
        || (leftStep.error ?? '') !== (rightStep.error ?? '')
    })

    return {
      workflowId,
      leftRunId,
      rightRunId,
      metrics,
      changedStepIds,
      leftStatus: left.status,
      rightStatus: right.status,
      generatedAt: new Date().toISOString(),
    }
  }

  async run(userId: string, workflowId: string, input: RunWorkflowInput = {}) {
    const triggerKind = this.sanitizeTriggerKind(input.triggerKind ?? 'manual')
    const workflow = await this.getWorkflow(userId, workflowId)
    const idempotencyKey = this.sanitizeIdempotencyKey(input.idempotencyKey)
    const sourceEvent = this.optionalText(input.sourceEvent)?.slice(0, 200) ?? null

    if (idempotencyKey) {
      await this.ensureLoaded(userId)
      const existing = this.findRunByIdempotency(userId, workflowId, idempotencyKey)
      if (existing) return existing
    }

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

    if (triggerKind === 'inbox_event' && workflow.trigger.kind !== 'inbox_event') {
      throw new BadRequestException('Workflow trigger kind does not allow inbox_event runs.')
    }

    if (triggerKind === 'connector_event' && workflow.trigger.kind !== 'connector_event') {
      throw new BadRequestException('Workflow trigger kind does not allow connector_event runs.')
    }

    if (this.workflowQueue && this.processingMode === 'queue') {
      return this.enqueueWorkflowRun(userId, workflow, triggerKind, {
        approvedKeys: input.approvedKeys,
        idempotencyKey,
        sourceEvent,
        input: this.asRecord(input.input) ?? {},
      })
    }

    if (this.runningWorkflowIds.has(workflow.id)) {
      throw new BadRequestException('Workflow is already running.')
    }

    this.runningWorkflowIds.add(workflow.id)
    try {
      return await this.executeWorkflow(userId, workflow, triggerKind, {
        persistRun: true,
        source: 'workflow',
        approvedKeys: input.approvedKeys,
        idempotencyKey,
        sourceEvent,
        input: this.asRecord(input.input) ?? {},
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
      version: 1,
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
        approvedKeys: [],
        idempotencyKey: null,
        sourceEvent: null,
        input: {},
      },
    )
  }

  async processQueuedRun(input: WorkflowRunJobData) {
    const workflow = await this.getWorkflow(input.userId, input.workflowId)
    await this.ensureLoaded(input.userId)
    const existing = this.findRunById(input.userId, input.runId)
    if (!existing) {
      throw new NotFoundException(`Workflow run "${input.runId}" not found.`)
    }

    if (
      existing.status === 'done' ||
      existing.status === 'error' ||
      existing.status === 'waiting_approval'
    ) {
      return existing
    }
    if (existing.status === 'running') {
      return existing
    }

    if (this.runningWorkflowIds.has(workflow.id)) {
      return existing
    }

    this.runningWorkflowIds.add(workflow.id)
    try {
      const running: WorkflowRun = {
        ...existing,
        status: 'running',
        error: null,
      }
      this.replaceRun(input.userId, running)
      await this.persist(input.userId)

      return await this.executeWorkflow(input.userId, workflow, input.triggerKind, {
        persistRun: true,
        source: 'workflow.queue',
        approvedKeys: input.approvedKeys,
        idempotencyKey: this.sanitizeIdempotencyKey(input.idempotencyKey),
        sourceEvent: this.optionalText(input.sourceEvent)?.slice(0, 200) ?? null,
        input: this.asRecord(input.input) ?? {},
        runId: existing.id,
        startedAt: existing.startedAt,
        replaceExistingRun: true,
        existingRun: existing,
      })
    } finally {
      this.runningWorkflowIds.delete(workflow.id)
    }
  }

  private async enqueueWorkflowRun(
    userId: string,
    workflow: WorkflowDefinition,
    triggerKind: WorkflowTriggerKind,
    input: {
      approvedKeys?: string[]
      idempotencyKey: string | null
      sourceEvent: string | null
      input: Record<string, unknown>
    },
  ) {
    if (!this.workflowQueue) {
      throw new BadRequestException('Workflow queue is not available.')
    }

    const nowIso = new Date().toISOString()
    const runInput = this.cloneRecord(input.input)
    const run: WorkflowRun = {
      id: randomUUID(),
      workflowId: workflow.id,
      userId,
      triggerKind,
      status: 'queued',
      startedAt: nowIso,
      finishedAt: null,
      error: null,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.sourceEvent ? { sourceEvent: input.sourceEvent } : {}),
      ...(Object.keys(runInput).length > 0 ? { input: runInput } : {}),
      state: {},
      resumeStepId: workflow.steps[0]?.id ?? null,
      lastOutput: null,
      stepResults: [],
    }

    await this.ensureLoaded(userId)
    this.appendRun(userId, run)
    this.updateWorkflowForRun(userId, workflow.id, workflow.trigger, nowIso)
    await this.persist(userId)

    await this.dispatchWorkflowRun({
      userId,
      workflowId: workflow.id,
      runId: run.id,
      triggerKind,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.sourceEvent ? { sourceEvent: input.sourceEvent } : {}),
      ...(input.approvedKeys && input.approvedKeys.length > 0
        ? { approvedKeys: input.approvedKeys }
        : {}),
      ...(Object.keys(input.input).length > 0 ? { input: input.input } : {}),
    })

    return run
  }

  private async executeWorkflow(
    userId: string,
    workflow: WorkflowDefinition,
    triggerKind: WorkflowTriggerKind,
    options: {
      persistRun: boolean
      source: string
      approvedKeys?: string[]
      idempotencyKey: string | null
      sourceEvent: string | null
      input: Record<string, unknown>
      runId?: string
      startedAt?: string
      replaceExistingRun?: boolean
      existingRun?: WorkflowRun
    },
  ): Promise<WorkflowRun> {
    const startedAt = options.startedAt ?? new Date().toISOString()
    const existingRun = options.existingRun
    const runInput = this.cloneRecord(existingRun?.input ?? options.input)
    const sharedState: Record<string, unknown> = this.cloneRecord(existingRun?.state ?? {})
    const run: WorkflowRun = existingRun
      ? {
          ...existingRun,
          workflowId: workflow.id,
          userId,
          triggerKind,
          status: 'running',
          startedAt,
          finishedAt: null,
          error: null,
          ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
          ...(options.sourceEvent ? { sourceEvent: options.sourceEvent } : {}),
          ...(Object.keys(runInput).length > 0 ? { input: runInput } : {}),
          state: this.cloneRecord(sharedState),
          resumeStepId: existingRun.resumeStepId ?? workflow.steps[0]?.id ?? null,
          lastOutput: this.cloneValue(existingRun.lastOutput ?? null),
          stepResults: [...existingRun.stepResults],
        }
      : {
          id: options.runId ?? randomUUID(),
          workflowId: workflow.id,
          userId,
          triggerKind,
          status: 'running',
          startedAt,
          finishedAt: null,
          error: null,
          ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
          ...(options.sourceEvent ? { sourceEvent: options.sourceEvent } : {}),
          ...(Object.keys(runInput).length > 0 ? { input: runInput } : {}),
          state: {},
          resumeStepId: workflow.steps[0]?.id ?? null,
          lastOutput: null,
          stepResults: [],
        }

    if (options.persistRun) {
      await this.ensureLoaded(userId)
      if (options.replaceExistingRun) {
        this.replaceRun(userId, run)
      } else {
        this.appendRun(userId, run)
      }
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
    let waitingApproval = false
    let lastStepOutput: unknown = this.cloneValue(existingRun?.lastOutput ?? null)
    const approvedKeys = new Set(
      (options.approvedKeys ?? [])
        .map((key) => this.normalizeApprovalKey(key))
        .filter((key): key is string => Boolean(key)),
    )
    const stepIndexById = new Map(workflow.steps.map((step, index) => [step.id, index]))

    let stepPointer = run.resumeStepId ? (stepIndexById.get(run.resumeStepId) ?? 0) : 0
    let branchHops = 0
    // Cost budget tracking (rough estimate: $0.003 per agent_prompt step)
    const COST_PER_AGENT_STEP_USD = 0.003
    let accumulatedCostUsd = existingRun?.accumulatedCostUsd ?? 0
    run.accumulatedCostUsd = accumulatedCostUsd

    while (stepPointer < workflow.steps.length) {
      if (branchHops > MAX_BRANCH_HOPS) {
        runError = 'Workflow exceeded branch hop limit.'
        break
      }

      // Cost budget hard-stop
      if (
        workflow.budgetUsd != null &&
        accumulatedCostUsd >= workflow.budgetUsd
      ) {
        runError = `Budget exhausted: $${accumulatedCostUsd.toFixed(4)} reached limit of $${workflow.budgetUsd}.`
        run.budgetExhausted = true
        break
      }
      branchHops += 1

      const step = workflow.steps[stepPointer]
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

      const maxAttempts = Math.max(
        1,
        Math.min((step.retryAttempts ?? 0) + 1, MAX_WORKFLOW_STEP_RETRIES + 1),
      )
      let stepError: string | null = null
      let nextPointer = stepPointer + 1
      let completedOutput: unknown = null
      const stateWrites = new Set<string>()

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const normalizedType = this.normalizeExecutionStepType(step.type)
          const templateContext = this.createTemplateContext(
            workflow,
            triggerKind,
            runInput,
            sharedState,
            lastStepOutput,
          )

          if (normalizedType === 'delay') {
            const delayMs = Math.max(100, Math.min(step.delayMs ?? 1000, 5 * 60_000))
            await this.sleep(delayMs)
            completedOutput = { delayMs }
            stepResult.output = `Delayed for ${delayMs} ms.`
          } else if (normalizedType === 'tool_call') {
            const toolName = this.toTemplateText(
              this.resolveTemplates(step.toolName ?? '', templateContext),
            ).trim()
            const toolInput =
              this.asRecord(this.resolveTemplates(step.input ?? {}, templateContext)) ?? {}
            const result = await this.tools.execute(toolName, toolInput, userId)
            if (!result.success) {
              throw new Error(result.error ?? `Tool call failed for ${toolName || step.toolName}`)
            }
            completedOutput = result.output
            stepResult.output = this.renderOutput(result.output)
          } else if (normalizedType === 'agent_prompt') {
            if (!activeConversationId) {
              activeConversationId =
                step.conversationId?.trim() ||
                (await this.createRunConversation(userId, workflow.name))
            }
            const prompt = this.toTemplateText(
              this.resolveTemplates(step.prompt ?? '', templateContext),
            )
            let latestAgentMessage = ''
            await this.agent.run({
              conversationId: activeConversationId,
              userId,
              userMessage: prompt,
              emit: (event, data) => {
                if (event !== 'message' || !data || typeof data !== 'object') return
                const role = 'role' in data ? data.role : undefined
                const content = 'content' in data ? data.content : undefined
                if (role === 'agent' && typeof content === 'string') {
                  latestAgentMessage = content.trim()
                }
              },
            })
            completedOutput = latestAgentMessage || { conversationId: activeConversationId }
            stepResult.output =
              latestAgentMessage || `Agent run completed in conversation ${activeConversationId}.`
          } else if (normalizedType === 'wait_approval') {
            const approvalKey =
              this.normalizeApprovalKey(
                this.toTemplateText(
                  this.resolveTemplates(step.approvalKey ?? step.id, templateContext),
                ),
              ) ?? step.id
            if (!approvedKeys.has(approvalKey)) {
              waitingApproval = true
              throw new Error(
                `Approval gate "${approvalKey}" is not satisfied. Re-run with approvedKeys including this key.`,
              )
            }
            completedOutput = { approvalKey, approved: true }
            stepResult.output = `Approval gate "${approvalKey}" satisfied.`
          } else if (normalizedType === 'branch_condition') {
            const matched = this.evaluateBranchCondition({
              source: step.conditionSource ?? 'last_output',
              path: step.conditionPath,
              operator: step.conditionOperator ?? 'contains',
              expected: this.toTemplateText(
                this.resolveTemplates(step.conditionValue ?? '', templateContext),
              ),
              lastOutput: lastStepOutput,
              workflowName: workflow.name,
              triggerKind,
              runInput,
              state: sharedState,
            })
            const nextStepId = matched ? step.ifTrueStepId : (step.ifFalseStepId ?? null)
            if (nextStepId) {
              const target = stepIndexById.get(nextStepId)
              if (target == null) {
                throw new Error(`Branch step "${step.id}" references unknown step "${nextStepId}".`)
              }
              nextPointer = target
            } else {
              nextPointer = stepPointer + 1
            }
            completedOutput = matched
            stepResult.output = `Branch condition ${matched ? 'matched' : 'did not match'}.`
          } else if (normalizedType === 'set_state') {
            const statePatch =
              this.asRecord(this.resolveTemplates(step.statePatch ?? {}, templateContext)) ?? {}
            if (Object.keys(statePatch).length === 0) {
              throw new Error(`State step "${step.id}" must define a non-empty statePatch.`)
            }
            this.mergeRecords(sharedState, statePatch)
            for (const key of Object.keys(statePatch)) {
              stateWrites.add(key)
            }
            completedOutput = this.cloneRecord(statePatch)
            stepResult.output = `Updated workflow state: ${Object.keys(statePatch).join(', ')}.`
          } else {
            throw new Error(`Unsupported workflow step type: ${step.type}`)
          }

          const outputKey = this.optionalText(step.outputKey)?.slice(0, 160)
          if (outputKey) {
            const capturedValue =
              completedOutput === undefined ? stepResult.output : completedOutput
            this.setValueAtPath(sharedState, outputKey, this.cloneValue(capturedValue))
            stateWrites.add(outputKey)
          }
          if (stateWrites.size > 0) {
            stepResult.stateWrites = [...stateWrites].slice(0, 20)
          }
          run.state = this.cloneRecord(sharedState)
          stepResult.status = 'done'
          stepResult.attemptCount = attempt
          stepError = null
          break
        } catch (error: any) {
          stepError = this.safeError(error)
          stepResult.attemptCount = attempt
          if (attempt >= maxAttempts) {
            stepResult.status = 'error'
            stepResult.error = stepError
            break
          }
        }
      }

      stepResult.finishedAt = new Date().toISOString()
      stepResult.nextStepId = workflow.steps[nextPointer]?.id ?? null
      run.stepResults.push(stepResult)

      // Accumulate cost estimate for agent steps
      const normalizedType = this.normalizeExecutionStepType(step.type)
      if (normalizedType === 'agent_prompt') {
        accumulatedCostUsd += COST_PER_AGENT_STEP_USD
        run.accumulatedCostUsd = accumulatedCostUsd
      }

      if (stepResult.status === 'error') {
        if (step.continueOnError) {
          lastStepOutput = stepResult.error ?? ''
          run.lastOutput = this.cloneValue(lastStepOutput)
          run.resumeStepId = workflow.steps[stepPointer + 1]?.id ?? null
          run.state = this.cloneRecord(sharedState)
          if (options.persistRun) {
            this.replaceRun(userId, run)
            await this.persist(userId)
          }
          stepPointer += 1
          continue
        }
        run.resumeStepId = step.id
        run.lastOutput = this.cloneValue(lastStepOutput)
        run.state = this.cloneRecord(sharedState)
        if (options.persistRun) {
          this.replaceRun(userId, run)
          await this.persist(userId)
        }
        runError = stepError ?? 'Workflow step failed.'
        break
      }

      lastStepOutput = completedOutput ?? stepResult.output
      run.lastOutput = this.cloneValue(lastStepOutput)
      run.resumeStepId = workflow.steps[nextPointer]?.id ?? null
      run.state = this.cloneRecord(sharedState)
      if (options.persistRun) {
        this.replaceRun(userId, run)
        await this.persist(userId)
      }
      stepPointer = nextPointer
    }

    run.finishedAt = new Date().toISOString()
    run.error = runError
    run.state = this.cloneRecord(sharedState)
    if (!waitingApproval && !runError) {
      run.resumeStepId = null
    }
    run.status = waitingApproval ? 'waiting_approval' : runError ? 'error' : 'done'

    if (options.persistRun) {
      this.replaceRun(userId, run)
      this.updateWorkflowForRun(userId, workflow.id, workflow.trigger, run.finishedAt)
      await this.persist(userId)
    }

    const missionType =
      run.status === 'error'
        ? 'failure'
        : run.status === 'waiting_approval'
          ? 'approval'
          : 'workflow_run'
    const missionStatus =
      run.status === 'error' ? 'failed' : run.status === 'waiting_approval' ? 'pending' : 'success'

    void this.mission.publish({
      userId,
      type: missionType,
      status: missionStatus,
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

    // Webhook outbox: fire-and-forget POST on terminal run status
    if (
      workflow.webhookOutbox?.url &&
      (run.status === 'done' || run.status === 'error')
    ) {
      void this.fireWebhookOutbox(workflow, run)
    }

    return run
  }

  private async fireWebhookOutbox(workflow: WorkflowDefinition, run: WorkflowRun) {
    const outbox = workflow.webhookOutbox!
    const payload = {
      event: 'workflow.run.completed',
      workflowId: workflow.id,
      workflowName: workflow.name,
      runId: run.id,
      status: run.status,
      triggerKind: run.triggerKind,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      error: run.error ?? null,
      stepCount: run.stepResults.length,
      ...(outbox.includeOutput ? { lastOutput: run.lastOutput ?? null } : {}),
    }

    const body = JSON.stringify(payload)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (outbox.secret) {
      const { createHmac } = await import('node:crypto')
      const sig = createHmac('sha256', outbox.secret).update(body).digest('hex')
      headers['X-OpenAgents-Signature'] = `sha256=${sig}`
    }

    try {
      await fetch(outbox.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) })
    } catch (err) {
      this.logger.warn(`Webhook outbox POST failed for workflow ${workflow.id}: ${String(err)}`)
    }
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

  private async recoverInterruptedRuns() {
    try {
      const userIds = await this.listKnownUsers()
      for (const userId of userIds) {
        await this.ensureLoaded(userId, true)
        const workflows = this.workflowsByUser.get(userId) ?? []
        const recoverableRuns = (this.runsByUser.get(userId) ?? []).filter((run) =>
          run.status === 'queued' || run.status === 'running',
        )

        for (const run of recoverableRuns) {
          const workflow = workflows.find((entry) => entry.id === run.workflowId)
          if (!workflow) continue

          if (this.workflowQueue && this.processingMode === 'queue') {
            const queuedRun: WorkflowRun = {
              ...run,
              status: 'queued',
              error: null,
              finishedAt: null,
            }
            this.replaceRun(userId, queuedRun)
            await this.persist(userId)
            await this.dispatchWorkflowRun({
              userId,
              workflowId: workflow.id,
              runId: queuedRun.id,
              triggerKind: queuedRun.triggerKind,
              ...(queuedRun.idempotencyKey ? { idempotencyKey: queuedRun.idempotencyKey } : {}),
              ...(queuedRun.sourceEvent ? { sourceEvent: queuedRun.sourceEvent } : {}),
              ...(queuedRun.input && Object.keys(queuedRun.input).length > 0
                ? { input: queuedRun.input }
                : {}),
            })
            continue
          }

          if (this.runningWorkflowIds.has(workflow.id)) continue
          const resumedRun: WorkflowRun = {
            ...run,
            status: 'running',
            error: null,
            finishedAt: null,
          }
          this.runningWorkflowIds.add(workflow.id)
          this.replaceRun(userId, resumedRun)
          await this.persist(userId)
          void this.executeWorkflow(userId, workflow, resumedRun.triggerKind, {
            persistRun: true,
            source: 'workflow.resume',
            approvedKeys: [],
            idempotencyKey: this.sanitizeIdempotencyKey(resumedRun.idempotencyKey),
            sourceEvent:
              this.optionalText(resumedRun.sourceEvent)?.slice(0, 200) ?? `resume:${resumedRun.id}`,
            input: this.asRecord(resumedRun.input) ?? {},
            runId: resumedRun.id,
            startedAt: resumedRun.startedAt,
            replaceExistingRun: true,
            existingRun: resumedRun,
          })
            .catch((error) => {
              this.logger.warn(
                `Failed to resume workflow run ${resumedRun.id}: ${this.safeError(error)}`,
              )
            })
            .finally(() => {
              this.runningWorkflowIds.delete(workflow.id)
            })
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to recover interrupted workflows: ${this.safeError(error)}`)
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

  private findRunById(userId: string, runId: string) {
    return (this.runsByUser.get(userId) ?? []).find((run) => run.id === runId) ?? null
  }

  private durationMs(run: WorkflowRun) {
    const started = new Date(run.startedAt).getTime()
    const finished = new Date(run.finishedAt ?? run.startedAt).getTime()
    if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0
    return Math.max(0, finished - started)
  }

  private async dispatchWorkflowRun(data: WorkflowRunJobData) {
    if (!this.workflowQueue) {
      throw new BadRequestException('Workflow queue is not available.')
    }

    await this.workflowQueue.add(WORKFLOW_JOB_NAMES.run, data, {
      jobId: `workflow:${data.runId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: true,
      removeOnFail: false,
    })
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
    const outputKey = this.optionalText(step.outputKey)?.slice(0, 160) ?? undefined
    const retryAttemptsRaw = Number.parseInt(`${step.retryAttempts ?? 0}`, 10)
    const retryAttempts = Number.isFinite(retryAttemptsRaw)
      ? Math.max(0, Math.min(retryAttemptsRaw, MAX_WORKFLOW_STEP_RETRIES))
      : 0
    const continueOnError = Boolean(step.continueOnError)
    const baseStep: {
      id: string
      type: WorkflowStep['type']
      label: string
      retryAttempts: number
      continueOnError: boolean
      outputKey?: string
    } = {
      id,
      type,
      label,
      retryAttempts,
      continueOnError,
      ...(outputKey ? { outputKey } : {}),
    }

    if (type === 'agent_prompt' || type === 'run_agent') {
      const prompt = this.optionalText(step.prompt)
      if (!prompt) throw new BadRequestException(`Step ${index + 1}: agent prompt is required.`)
      return {
        ...baseStep,
        prompt: prompt.slice(0, 10_000),
        ...(conversationId ? { conversationId } : {}),
      }
    }

    if (type === 'tool_call' || type === 'run_tool') {
      const toolName = this.optionalText(step.toolName)
      if (!toolName) throw new BadRequestException(`Step ${index + 1}: tool name is required.`)
      const input = this.asRecord(step.input) ?? {}
      return {
        ...baseStep,
        toolName: toolName.slice(0, 120),
        input,
      }
    }

    if (type === 'set_state') {
      const statePatch = this.asRecord(step.statePatch) ?? {}
      if (Object.keys(statePatch).length === 0) {
        throw new BadRequestException(
          `Step ${index + 1}: statePatch is required for set_state steps.`,
        )
      }
      return {
        ...baseStep,
        statePatch,
      }
    }

    if (type === 'wait_approval') {
      const approvalKey = this.normalizeApprovalKey(step.approvalKey) ?? id
      const approvalReason = this.optionalText(step.approvalReason)?.slice(0, 200) ?? undefined
      return {
        ...baseStep,
        approvalKey,
        ...(approvalReason ? { approvalReason } : {}),
      }
    }

    if (type === 'branch_condition') {
      const conditionSource =
        step.conditionSource === 'last_output' ||
        step.conditionSource === 'trigger_kind' ||
        step.conditionSource === 'workflow_name' ||
        step.conditionSource === 'run_input' ||
        step.conditionSource === 'state'
          ? step.conditionSource
          : 'last_output'
      const conditionOperator =
        step.conditionOperator === 'contains' ||
        step.conditionOperator === 'not_contains' ||
        step.conditionOperator === 'equals' ||
        step.conditionOperator === 'not_equals'
          ? step.conditionOperator
          : 'contains'
      const conditionValue = this.optionalText(step.conditionValue)?.slice(0, 500) ?? ''
      const conditionPath = this.optionalText(step.conditionPath)?.slice(0, 160) ?? undefined
      const ifTrueStepId = this.optionalText(step.ifTrueStepId)?.slice(0, 120) ?? undefined
      const ifFalseStepId = this.optionalText(step.ifFalseStepId)?.slice(0, 120) ?? undefined
      return {
        ...baseStep,
        conditionSource,
        conditionOperator,
        conditionValue,
        ...(conditionPath ? { conditionPath } : {}),
        ...(ifTrueStepId ? { ifTrueStepId } : {}),
        ...(ifFalseStepId ? { ifFalseStepId } : {}),
      }
    }

    const delayRaw = Number.parseInt(`${step.delayMs ?? 0}`, 10)
    const delayMs = Number.isFinite(delayRaw) ? Math.max(100, Math.min(delayRaw, 5 * 60_000)) : 1000
    return {
      ...baseStep,
      delayMs,
    }
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
      const everyRaw = Number.parseInt(
        `${trigger?.everyMinutes ?? fallback?.everyMinutes ?? 60}`,
        10,
      )
      const everyMinutes = Number.isFinite(everyRaw)
        ? Math.max(1, Math.min(everyRaw, 7 * 24 * 60))
        : 60
      return { kind: 'schedule', everyMinutes }
    }

    if (kind === 'inbox_event') {
      const eventName =
        this.optionalText(trigger?.eventName) ??
        this.optionalText(fallback?.eventName) ??
        'message.received'
      return { kind: 'inbox_event', eventName: eventName.slice(0, 120) }
    }

    const providedSecret =
      this.optionalText(trigger?.webhookSecret) ?? this.optionalText(fallback?.webhookSecret)
    const webhookSecret = providedSecret
      ? providedSecret.slice(0, 200)
      : creating
        ? this.buildWebhookSecret()
        : undefined
    return { kind: 'webhook', ...(webhookSecret ? { webhookSecret } : {}) }
  }

  private sanitizeTriggerKind(kind: WorkflowTriggerKind | string) {
    if (kind === 'manual' || kind === 'schedule' || kind === 'webhook' || kind === 'inbox_event')
      return kind
    throw new BadRequestException(`Unsupported trigger kind: ${kind}`)
  }

  private sanitizeStepType(type: string | undefined) {
    if (
      type === 'agent_prompt' ||
      type === 'tool_call' ||
      type === 'delay' ||
      type === 'run_agent' ||
      type === 'run_tool' ||
      type === 'wait_approval' ||
      type === 'branch_condition' ||
      type === 'set_state'
    )
      return type
    return null
  }

  private normalizeExecutionStepType(type: WorkflowStep['type']) {
    if (type === 'run_agent') return 'agent_prompt'
    if (type === 'run_tool') return 'tool_call'
    return type
  }

  private evaluateBranchCondition(input: {
    source: WorkflowBranchSource
    path?: string
    operator: 'contains' | 'not_contains' | 'equals' | 'not_equals'
    expected: string
    lastOutput: unknown
    workflowName: string
    triggerKind: WorkflowTriggerKind
    runInput: Record<string, unknown>
    state: Record<string, unknown>
  }) {
    const expected = (input.expected ?? '').toLowerCase().trim()
    const sourceValue = this.branchSourceValue(input)
    const haystack = sourceValue.toLowerCase().trim()

    if (input.operator === 'equals') return haystack === expected
    if (input.operator === 'not_equals') return haystack !== expected
    if (input.operator === 'not_contains') return expected ? !haystack.includes(expected) : true
    return expected ? haystack.includes(expected) : false
  }

  private branchSourceValue(input: {
    source: WorkflowBranchSource
    path?: string
    lastOutput: unknown
    workflowName: string
    triggerKind: WorkflowTriggerKind
    runInput: Record<string, unknown>
    state: Record<string, unknown>
  }) {
    if (input.source === 'trigger_kind') return input.triggerKind
    if (input.source === 'workflow_name') return input.workflowName

    if (input.source === 'run_input') {
      const fromInput = this.getValueAtPath(input.runInput, input.path)
      return this.toTemplateString(fromInput)
    }

    if (input.source === 'state') {
      const fromState = this.getValueAtPath(input.state, input.path)
      return this.toTemplateString(fromState)
    }

    const lastOutput = this.getValueAtPath(input.lastOutput, input.path)
    if (this.toTemplateString(lastOutput).trim()) {
      return this.toTemplateString(lastOutput)
    }
    return this.renderOutput(input.runInput) ?? ''
  }

  private createTemplateContext(
    workflow: WorkflowDefinition,
    triggerKind: WorkflowTriggerKind,
    runInput: Record<string, unknown>,
    state: Record<string, unknown>,
    lastOutput: unknown,
  ): WorkflowTemplateContext {
    return {
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
      },
      triggerKind,
      runInput,
      state,
      lastOutput,
    }
  }

  private resolveTemplates(value: unknown, context: WorkflowTemplateContext): unknown {
    if (typeof value === 'string') {
      return this.resolveTemplateString(value, context)
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.resolveTemplates(entry, context))
    }
    if (this.isPlainObject(value)) {
      const out: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(value)) {
        out[key] = this.resolveTemplates(raw, context)
      }
      return out
    }
    return value
  }

  private resolveTemplateString(template: string, context: WorkflowTemplateContext): unknown {
    const wholeTokenMatch = template.match(/^\s*{{\s*([^{}]+?)\s*}}\s*$/)
    if (wholeTokenMatch) {
      const rawValue = this.lookupTemplateValue(wholeTokenMatch[1] ?? '', context)
      return rawValue == null ? '' : this.cloneValue(rawValue)
    }
    return template.replace(TEMPLATE_TOKEN_REGEX, (_full, rawPath) =>
      this.toTemplateString(this.lookupTemplateValue(String(rawPath), context)),
    )
  }

  private lookupTemplateValue(rawPath: string, context: WorkflowTemplateContext): unknown {
    const normalized = rawPath.trim().replace(/\[(\d+)\]/g, '.$1')
    if (!normalized) return ''

    if (normalized === 'workflow_name') return context.workflow.name
    if (normalized === 'trigger_kind') return context.triggerKind

    const segments = normalized.split('.').filter(Boolean)
    const [root, ...rest] = segments
    if (!root) return ''

    if (root === 'input' || root === 'run_input') {
      return this.getValueAtPath(context.runInput, rest)
    }
    if (root === 'state') {
      return rest.length === 0 ? context.state : this.getValueAtPath(context.state, rest)
    }
    if (root === 'last_output') {
      return rest.length === 0 ? context.lastOutput : this.getValueAtPath(context.lastOutput, rest)
    }
    if (root === 'workflow') {
      const workflowData = {
        id: context.workflow.id,
        name: context.workflow.name,
        description: context.workflow.description,
        trigger: { kind: context.triggerKind },
      }
      return rest.length === 0 ? workflowData : this.getValueAtPath(workflowData, rest)
    }
    if (root === 'trigger') {
      const trigger = { kind: context.triggerKind }
      return rest.length === 0 ? trigger : this.getValueAtPath(trigger, rest)
    }

    return undefined
  }

  private toTemplateText(value: unknown) {
    return typeof value === 'string' ? value : this.toTemplateString(value)
  }

  private toTemplateString(value: unknown) {
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  private getValueAtPath(source: unknown, rawPath?: string | string[]) {
    const segments = Array.isArray(rawPath)
      ? rawPath.filter(Boolean)
      : (rawPath ?? '')
          .split('.')
          .map((segment) => segment.trim())
          .filter(Boolean)

    if (segments.length === 0) return source

    let current: unknown = source
    for (const segment of segments) {
      if (current == null) return undefined
      if (Array.isArray(current)) {
        const index = Number.parseInt(segment, 10)
        if (!Number.isFinite(index)) return undefined
        current = current[index]
        continue
      }
      if (!this.isPlainObject(current)) return undefined
      current = current[segment]
    }
    return current
  }

  private setValueAtPath(target: Record<string, unknown>, rawPath: string, value: unknown) {
    const segments = rawPath
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (segments.length === 0) return

    let current = target
    for (const segment of segments.slice(0, -1)) {
      const existing = current[segment]
      if (!this.isPlainObject(existing)) {
        current[segment] = {}
      }
      current = current[segment] as Record<string, unknown>
    }

    current[segments[segments.length - 1]] = this.cloneValue(value)
  }

  private mergeRecords(target: Record<string, unknown>, patch: Record<string, unknown>) {
    for (const [key, rawValue] of Object.entries(patch)) {
      if (this.isPlainObject(rawValue) && this.isPlainObject(target[key])) {
        this.mergeRecords(target[key] as Record<string, unknown>, rawValue)
        continue
      }
      target[key] = this.cloneValue(rawValue)
    }
  }

  private cloneRecord(value: Record<string, unknown>) {
    return this.cloneValue(value) as Record<string, unknown>
  }

  private cloneValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.cloneValue(entry))
    }
    if (this.isPlainObject(value)) {
      const out: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(value)) {
        out[key] = this.cloneValue(raw)
      }
      return out
    }
    return value
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  private sanitizeIdempotencyKey(raw: string | undefined) {
    const value = this.optionalText(raw)
    if (!value) return null
    return value.slice(0, 160).toLowerCase()
  }

  private findRunByIdempotency(userId: string, workflowId: string, idempotencyKey: string) {
    return (
      [...(this.runsByUser.get(userId) ?? [])]
        .filter((run) => run.workflowId === workflowId)
        .find((run) => this.optionalText(run.idempotencyKey)?.toLowerCase() === idempotencyKey) ??
      null
    )
  }

  private normalizeApprovalKey(raw: string | undefined) {
    const value = this.optionalText(raw)
    if (!value) return null
    return value
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, '-')
      .slice(0, 80)
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

  private sanitizeStoredWorkflow(
    workflow: WorkflowDefinition,
    userId: string,
  ): WorkflowDefinition | null {
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
        version: Number.isFinite(workflow.version) ? Math.max(1, Number(workflow.version)) : 1,
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
      ...(this.optionalText(run.idempotencyKey)
        ? { idempotencyKey: this.optionalText(run.idempotencyKey)!.slice(0, 160) }
        : {}),
      ...(this.optionalText(run.sourceEvent)
        ? { sourceEvent: this.optionalText(run.sourceEvent)!.slice(0, 200) }
        : {}),
      ...(this.asRecord(run.input)
        ? { input: this.cloneRecord(this.asRecord(run.input) ?? {}) }
        : {}),
      ...(this.asRecord(run.state)
        ? { state: this.cloneRecord(this.asRecord(run.state) ?? {}) }
        : {}),
      ...(this.optionalText(run.rerunOfRunId)
        ? { rerunOfRunId: this.optionalText(run.rerunOfRunId)!.slice(0, 120) }
        : {}),
      ...(this.optionalText(run.resumeStepId)
        ? { resumeStepId: this.optionalText(run.resumeStepId)!.slice(0, 120) }
        : {}),
      ...(run.lastOutput !== undefined ? { lastOutput: this.cloneValue(run.lastOutput) } : {}),
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
      ...(Number.isFinite(step.attemptCount)
        ? { attemptCount: Math.max(1, Number(step.attemptCount)) }
        : {}),
      ...(Array.isArray(step.stateWrites)
        ? {
            stateWrites: step.stateWrites
              .filter((entry): entry is string => typeof entry === 'string')
              .map((entry) => entry.slice(0, 160))
              .slice(0, 20),
          }
        : {}),
      ...(this.optionalText(step.nextStepId)
        ? { nextStepId: this.optionalText(step.nextStepId)!.slice(0, 120) }
        : {}),
    }
  }

  private sanitizeStoredTriggerKind(kind: string | undefined): WorkflowTriggerKind | null {
    if (kind === 'manual' || kind === 'schedule' || kind === 'webhook' || kind === 'inbox_event')
      return kind
    return null
  }

  private sanitizeRunStatus(status: string | undefined): WorkflowRunStatus | null {
    if (
      status === 'queued' ||
      status === 'running' ||
      status === 'waiting_approval' ||
      status === 'done' ||
      status === 'error'
    )
      return status
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
