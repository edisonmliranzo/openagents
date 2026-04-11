import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { DelegationEdge, SubagentRun } from '@prisma/client'
import { LLMService } from '../../agent/llm.service'
import { PrismaService } from '../../prisma/prisma.service'
import { UsersService } from '../../users/users.service'
import { NanobotBusService } from '../bus/nanobot-bus.service'
import type {
  CreateNanobotSpecialistRunInput,
  ExecuteNanobotSpecialistRunInput,
  NanobotDelegationEdge,
  NanobotDelegationStatus,
  NanobotRoleDecision,
  NanobotSpecialistRole,
  NanobotSpecialistRun,
  NanobotSpecialistRunExecutionResult,
  NanobotSpecialistRunStatus,
  NanobotSubagentRole,
  NanobotSubagentStatus,
  NanobotSubagentTask,
} from '../types'
import type { LLMProvider } from '@openagents/shared'

const DEFAULT_MAX_DELEGATES = 3
const MAX_DELEGATES = 4
const SPECIALIST_DELEGATE_ROLES: NanobotSpecialistRole[] = ['researcher', 'builder', 'operator', 'reviewer']

interface SpecialistLlmContext {
  provider: LLMProvider
  model?: string
  apiKey?: string
  baseUrl?: string
}

@Injectable()
export class NanobotSubagentService {
  private tasks = new Map<string, NanobotSubagentTask>()
  private readonly maxTasks = 500

  constructor(
    private bus: NanobotBusService,
    private prisma: PrismaService,
    private llm: LLMService,
    private users: UsersService,
  ) {}

  spawn(userId: string, label: string, role: NanobotSubagentRole = 'telemetry', runId?: string) {
    const now = new Date().toISOString()
    const task: NanobotSubagentTask = {
      id: randomUUID(),
      userId,
      role,
      label,
      status: 'running',
      ...(runId ? { runId } : {}),
      createdAt: now,
      updatedAt: now,
    }
    this.tasks.set(task.id, task)
    this.pruneOldTasks()
    this.bus.publish('subagent.spawned', { taskId: task.id, userId, label, role, runId })

    setTimeout(() => {
      this.completeTask(task.id, userId, role, runId)
    }, 50)

    return task
  }

  spawnRoleCrew(userId: string, runId: string, decision: NanobotRoleDecision) {
    const planner = this.spawn(
      userId,
      `Plan goal: ${decision.plannerGoal}`.slice(0, 140),
      'planner',
      runId,
    )
    const executor = this.spawn(
      userId,
      `Execute intent: ${decision.executorIntent}`.slice(0, 140),
      'executor',
      runId,
    )
    const critic = this.spawn(
      userId,
      `Critique risk: ${
        decision.criticConcerns.length > 0
          ? decision.criticConcerns.join(' | ')
          : 'No major blockers'
      }`.slice(0, 180),
      'critic',
      runId,
    )
    return [planner, executor, critic]
  }

  listForUser(userId: string) {
    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 50)
  }

  async listSpecialistRuns(userId: string, limit = 20) {
    const safeLimit = Math.max(1, Math.min(limit, 100))
    const rows = await this.prisma.subagentRun.findMany({
      where: { userId, role: 'planner' },
      orderBy: { updatedAt: 'desc' },
      take: safeLimit,
    })
    return rows.map((row) => this.toSpecialistRun(row))
  }

  async createSpecialistRun(userId: string, input: CreateNanobotSpecialistRunInput) {
    const objective = input.objective?.trim()
    if (!objective) {
      throw new BadRequestException('objective is required.')
    }

    const conversationId = input.conversationId?.trim() || null
    if (conversationId) {
      const belongsToUser = await this.prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      })
      if (!belongsToUser) {
        throw new BadRequestException('conversationId is not valid for this user.')
      }
    }

    const parentRunId = input.parentRunId?.trim() || null
    const context = input.context?.trim() || ''
    const maxDelegates = this.sanitizeMaxDelegates(input.maxDelegates)

    const row = await this.prisma.subagentRun.create({
      data: {
        userId,
        conversationId,
        parentRunId,
        role: 'planner',
        label: `Planner: ${objective.slice(0, 120)}`,
        objective: objective.slice(0, 2_000),
        input: this.stringifyJson({
          context: context.slice(0, 4_000),
          maxDelegates,
          createdBy: 'api',
        }),
        status: 'queued',
      },
    })

    this.bus.publish('subagent.spawned', {
      taskId: row.id,
      userId,
      label: row.label,
      role: 'planner',
      runId: row.id,
    })

    return this.toSpecialistRun(row)
  }

  async runSpecialist(
    userId: string,
    runId: string,
    input: ExecuteNanobotSpecialistRunInput = {},
  ): Promise<NanobotSpecialistRunExecutionResult> {
    const root = await this.prisma.subagentRun.findFirst({
      where: { id: runId, userId },
    })
    if (!root) {
      throw new NotFoundException(`Specialist run "${runId}" not found.`)
    }
    if (this.normalizeSpecialistRole(root.role) !== 'planner') {
      throw new BadRequestException('Only planner runs can be executed directly.')
    }

    if (root.status === 'running' && !input.force) {
      throw new BadRequestException('Run is already in progress. Use force=true to restart.')
    }
    if (root.status === 'done' && !input.force) {
      const current = await this.getSpecialistStatus(userId, runId)
      return {
        ...current,
        steps: ['Run already completed. Pass force=true to re-run.'],
        parallelized: current.delegatedRuns.length > 1,
        delegateCount: current.delegatedRuns.length,
      }
    }

    const steps: string[] = []

    try {
      if (input.force) {
        await this.clearDelegatedRuns(userId, runId)
        steps.push('Cleared previous delegated runs for forced execution.')
      }

      const normalizedInput = this.parseJsonRecord(root.input)
      const context = typeof normalizedInput.context === 'string'
        ? normalizedInput.context.trim().slice(0, 4_000)
        : ''
      const maxDelegates = this.sanitizeMaxDelegates(
        this.asNumber(normalizedInput.maxDelegates) ?? undefined,
      )

      await this.prisma.subagentRun.update({
        where: { id: root.id },
        data: {
          status: 'running',
          startedAt: new Date(),
          finishedAt: null,
          error: null,
          output: null,
        },
      })
      steps.push('Planner run marked running.')

      const plan = this.buildPlan(root.objective, context, maxDelegates)
      await this.prisma.subagentRun.update({
        where: { id: root.id },
        data: {
          input: this.stringifyJson({
            ...normalizedInput,
            context,
            maxDelegates,
            plan: plan.steps,
            plannedAt: new Date().toISOString(),
          }),
        },
      })
      steps.push(`Planner produced ${plan.steps.length} plan steps.`)

      const delegatedRuns: SubagentRun[] = []
      const delegationEdges: DelegationEdge[] = []

      for (const delegate of plan.delegates) {
        const child = await this.prisma.subagentRun.create({
          data: {
            userId,
            conversationId: root.conversationId,
            parentRunId: root.id,
            role: delegate.role,
            label: `${delegate.role} specialist`,
            objective: delegate.intent,
            input: this.stringifyJson({
              parentRunId: root.id,
              planStep: delegate.planStep,
              role: delegate.role,
              objective: root.objective,
              context,
            }),
            status: 'running',
            startedAt: new Date(),
          },
        })
        delegatedRuns.push(child)

        const edge = await this.prisma.delegationEdge.create({
          data: {
            userId,
            fromRunId: root.id,
            toRunId: child.id,
            intent: delegate.intent,
            status: 'delegated',
            metadata: this.stringifyJson({
              role: delegate.role,
              planStep: delegate.planStep,
            }),
          },
        })
        delegationEdges.push(edge)

        this.bus.publish('subagent.spawned', {
          taskId: child.id,
          userId,
          role: this.toLegacyRole(delegate.role),
          label: child.label,
          runId: root.id,
        })
        steps.push(`Delegated "${delegate.role}" specialist task.`)
      }

      const llmContext = await this.resolveSpecialistLlmContext(userId)
      const delegateResults = await Promise.allSettled(
        delegatedRuns.map((child, index) => this.executeDelegatedRun({
          userId,
          rootRunId: root.id,
          objective: root.objective,
          context,
          child,
          edge: delegationEdges[index],
          llmContext,
        })),
      )

      const collectedOutputs: Array<{ role: NanobotSpecialistRole; output: string }> = []
      for (let index = 0; index < delegateResults.length; index += 1) {
        const result = delegateResults[index]
        const role = this.normalizeSpecialistRole(delegatedRuns[index].role)
        if (result.status === 'fulfilled') {
          collectedOutputs.push(result.value)
          steps.push(`Collected "${role}" output in parallel.`)
          continue
        }

        steps.push(`"${role}" specialist failed: ${this.safeError(result.reason)}`)
      }

      if (collectedOutputs.length === 0) {
        throw new BadRequestException('All specialist delegates failed.')
      }

      const synthesis = this.synthesizeOutputs(root.objective, plan.steps, collectedOutputs)
      await this.prisma.subagentRun.update({
        where: { id: root.id },
        data: {
          status: 'done',
          output: synthesis,
          finishedAt: new Date(),
          error: null,
        },
      })
      steps.push('Synthesized delegated outputs into final response.')

      this.bus.publish('subagent.completed', {
        taskId: root.id,
        userId,
        role: 'planner',
        runId: root.id,
      })

      const status = await this.getSpecialistStatus(userId, runId)
      return {
        ...status,
        steps,
        parallelized: delegatedRuns.length > 1,
        delegateCount: delegatedRuns.length,
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string'
        ? error.message
        : 'Specialist run failed.'

      await this.prisma.subagentRun.updateMany({
        where: {
          userId,
          OR: [
            { id: runId },
            { parentRunId: runId },
          ],
          status: { in: ['queued', 'running'] },
        },
        data: {
          status: 'error',
          error: message.slice(0, 800),
          finishedAt: new Date(),
        },
      })

      await this.prisma.delegationEdge.updateMany({
        where: {
          userId,
          fromRunId: runId,
          status: { in: ['delegated', 'accepted'] },
        },
        data: {
          status: 'failed',
          metadata: this.stringifyJson({ error: message.slice(0, 400) }),
        },
      })

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error
      }
      throw new BadRequestException(message)
    }
  }

  async getSpecialistStatus(userId: string, runId: string): Promise<NanobotSpecialistRunStatus> {
    const run = await this.prisma.subagentRun.findFirst({
      where: { id: runId, userId },
      include: {
        outgoingEdges: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!run) {
      throw new NotFoundException(`Specialist run "${runId}" not found.`)
    }

    const childIds = run.outgoingEdges.map((edge) => edge.toRunId)
    const children = childIds.length > 0
      ? await this.prisma.subagentRun.findMany({
          where: {
            userId,
            id: { in: childIds },
          },
          orderBy: { createdAt: 'asc' },
        })
      : []
    const childById = new Map(children.map((row) => [row.id, row]))
    const orderedChildren = childIds
      .map((id) => childById.get(id))
      .filter((row): row is SubagentRun => Boolean(row))

    return {
      run: this.toSpecialistRun(run),
      delegations: run.outgoingEdges.map((edge) => this.toDelegationEdge(edge)),
      delegatedRuns: orderedChildren.map((row) => this.toSpecialistRun(row)),
      synthesizedOutput: run.output ?? null,
    }
  }

  private completeTask(taskId: string, userId: string, role: NanobotSubagentRole, runId?: string) {
    const current = this.tasks.get(taskId)
    if (!current) return
    const updated: NanobotSubagentTask = {
      ...current,
      status: 'done',
      updatedAt: new Date().toISOString(),
    }
    this.tasks.set(taskId, updated)
    this.bus.publish('subagent.completed', { taskId, userId, role, runId })
  }

  private pruneOldTasks() {
    if (this.tasks.size <= this.maxTasks) return
    const sorted = [...this.tasks.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    const overflow = sorted.length - this.maxTasks
    for (let index = 0; index < overflow; index += 1) {
      this.tasks.delete(sorted[index].id)
    }
  }

  private sanitizeMaxDelegates(value?: number | null) {
    const normalized = typeof value === 'number' && Number.isFinite(value)
      ? Math.floor(value)
      : DEFAULT_MAX_DELEGATES
    return Math.max(1, Math.min(normalized, MAX_DELEGATES))
  }

  private buildPlan(objective: string, context: string, maxDelegates: number) {
    const objectiveLine = objective.replace(/\s+/g, ' ').trim()
    const planSteps = [
      `Clarify objective and constraints: ${objectiveLine.slice(0, 200)}.`,
      context
        ? `Use provided context: ${context.replace(/\s+/g, ' ').slice(0, 200)}.`
        : 'Gather missing context and assumptions before execution.',
      'Execute the highest-impact implementation or operational actions.',
      'Review output for risk, correctness, and concrete next steps.',
    ]

    const delegates = SPECIALIST_DELEGATE_ROLES
      .slice(0, maxDelegates)
      .map((role, index) => {
        const planStep = planSteps[index % planSteps.length]
        return {
          role,
          planStep,
          intent: this.buildDelegateIntent(role, objectiveLine, planStep),
        }
      })

    return { steps: planSteps, delegates }
  }

  private async executeDelegatedRun(input: {
    userId: string
    rootRunId: string
    objective: string
    context: string
    child: SubagentRun
    edge: DelegationEdge
    llmContext: SpecialistLlmContext
  }) {
    const role = this.normalizeSpecialistRole(input.child.role)
    const payload = this.parseJsonRecord(input.child.input)
    const planStep = typeof payload.planStep === 'string' ? payload.planStep : ''

    try {
      await this.prisma.delegationEdge.update({
        where: { id: input.edge.id },
        data: { status: 'accepted' },
      })

      const output = await this.generateSpecialistOutput({
        userId: input.userId,
        role,
        objective: input.objective,
        context: input.context,
        planStep,
        llmContext: input.llmContext,
      })

      await this.prisma.subagentRun.update({
        where: { id: input.child.id },
        data: {
          status: 'done',
          output,
          finishedAt: new Date(),
          error: null,
        },
      })

      await this.prisma.delegationEdge.update({
        where: { id: input.edge.id },
        data: {
          status: 'completed',
          metadata: this.stringifyJson({
            role,
            outputPreview: output.slice(0, 220),
          }),
        },
      })

      this.bus.publish('subagent.completed', {
        taskId: input.child.id,
        userId: input.userId,
        role: this.toLegacyRole(role),
        runId: input.rootRunId,
      })

      return { role, output }
    } catch (error) {
      const message = this.safeError(error)

      await this.prisma.subagentRun.update({
        where: { id: input.child.id },
        data: {
          status: 'error',
          error: message.slice(0, 800),
          finishedAt: new Date(),
        },
      }).catch(() => {})

      await this.prisma.delegationEdge.update({
        where: { id: input.edge.id },
        data: {
          status: 'failed',
          metadata: this.stringifyJson({
            role,
            error: message.slice(0, 400),
          }),
        },
      }).catch(() => {})

      throw error
    }
  }

  private buildDelegateIntent(role: NanobotSpecialistRole, objective: string, planStep: string) {
    const headline = objective.slice(0, 180)
    if (role === 'researcher') {
      return `Research facts and dependencies for "${headline}". ${planStep}`
    }
    if (role === 'builder') {
      return `Build an implementation outline for "${headline}" with milestones and tradeoffs.`
    }
    if (role === 'operator') {
      return `Prepare execution and rollout checklist for "${headline}", including observability and rollback.`
    }
    return `Review final plan for risk and quality on "${headline}" and propose corrective actions.`
  }

  private async generateSpecialistOutput(input: {
    userId: string
    role: NanobotSpecialistRole
    objective: string
    context: string
    planStep: string
    llmContext: SpecialistLlmContext
  }) {
    const systemPrompt = this.buildSpecialistSystemPrompt(input.role)
    const userPrompt = this.buildSpecialistUserPrompt(input)

    try {
      const response = await this.completeSpecialistPrompt(
        input.userId,
        input.llmContext,
        systemPrompt,
        userPrompt,
      )
      const content = response.content.trim()
      if (content) return content.slice(0, 4_000)
    } catch {
      // Fall back to deterministic specialist scaffolding below.
    }

    return this.buildFallbackSpecialistOutput(input)
  }

  private buildFallbackSpecialistOutput(input: {
    role: NanobotSpecialistRole
    objective: string
    context: string
    planStep: string
  }) {
    const objective = input.objective.replace(/\s+/g, ' ').trim().slice(0, 220)
    const contextLine = input.context
      ? input.context.replace(/\s+/g, ' ').trim().slice(0, 220)
      : 'No extra context provided.'

    if (input.role === 'researcher') {
      return [
        `Research summary for: ${objective}`,
        `- Key context: ${contextLine}`,
        '- Dependencies identified and grouped by impact.',
        '- Unknowns flagged for follow-up before irreversible actions.',
      ].join('\n')
    }

    if (input.role === 'builder') {
      return [
        `Implementation plan for: ${objective}`,
        `- Guiding step: ${input.planStep}`,
        '- Deliverable broken into scoped phases with validation points.',
        '- Explicit tradeoff list included for speed vs safety.',
      ].join('\n')
    }

    if (input.role === 'operator') {
      return [
        `Operational execution for: ${objective}`,
        '- Pre-flight checks, rollout order, and monitoring signals prepared.',
        '- Failure handling and rollback steps documented.',
        '- Post-deploy verification checklist included.',
      ].join('\n')
    }

    return [
      `Review verdict for: ${objective}`,
      '- Risk controls validated against current plan.',
      '- Correctness checks listed for edge cases and regressions.',
      '- Final recommendations include go/no-go criteria.',
    ].join('\n')
  }

  private buildSpecialistSystemPrompt(role: NanobotSpecialistRole) {
    if (role === 'researcher') {
      return [
        'You are the Researcher specialist in a parallel execution crew.',
        'Produce concise, high-signal findings for the main agent.',
        'Return markdown with sections: Focus, Findings, Unknowns, Handoff.',
        'Be concrete and avoid filler.',
      ].join('\n')
    }
    if (role === 'builder') {
      return [
        'You are the Builder specialist in a parallel execution crew.',
        'Turn the objective into an implementation path with practical milestones.',
        'Return markdown with sections: Goal, Build Plan, Tradeoffs, Handoff.',
        'Optimize for execution clarity.',
      ].join('\n')
    }
    if (role === 'operator') {
      return [
        'You are the Operator specialist in a parallel execution crew.',
        'Focus on execution order, validation, rollout, monitoring, and rollback.',
        'Return markdown with sections: Preconditions, Execution, Verification, Rollback.',
        'Be operational and specific.',
      ].join('\n')
    }
    return [
      'You are the Reviewer specialist in a parallel execution crew.',
      'Stress-test the proposed work for correctness, safety, and regressions.',
      'Return markdown with sections: Risks, Checks, Gaps, Recommendation.',
      'Be direct and concrete.',
    ].join('\n')
  }

  private buildSpecialistUserPrompt(input: {
    role: NanobotSpecialistRole
    objective: string
    context: string
    planStep: string
  }) {
    return [
      `Role: ${input.role}`,
      `Objective: ${input.objective}`,
      `Assigned step: ${input.planStep || 'General support for the objective.'}`,
      `Context: ${input.context || 'No extra context provided.'}`,
      'Produce output that another agent can immediately use without re-explaining the task.',
    ].join('\n\n')
  }

  private async completeSpecialistPrompt(
    userId: string,
    llmContext: SpecialistLlmContext,
    systemPrompt: string,
    userPrompt: string,
  ) {
    try {
      return await this.llm.complete(
        [{ role: 'user', content: userPrompt }],
        [],
        systemPrompt,
        llmContext.provider,
        llmContext.apiKey,
        llmContext.baseUrl,
        llmContext.model,
      )
    } catch (error: any) {
      if (
        llmContext.provider !== 'ollama'
        && typeof error?.message === 'string'
        && error.message.toLowerCase().includes('api key is not configured')
      ) {
        const fallback = await this.resolveFallbackOllamaContext(userId)
        return this.llm.complete(
          [{ role: 'user', content: userPrompt }],
          [],
          systemPrompt,
          fallback.provider,
          fallback.apiKey,
          fallback.baseUrl,
          fallback.model,
        )
      }
      throw error
    }
  }

  private async resolveSpecialistLlmContext(userId: string): Promise<SpecialistLlmContext> {
    const settings = await this.users.getSettings(userId)
    const provider = this.normalizeProvider(settings.preferredProvider) ?? 'anthropic'
    const model = settings.preferredModel?.trim() || undefined
    const key = await this.users.getRawLlmKey(userId, provider)
    return {
      provider,
      model,
      apiKey: key?.isActive ? (key.apiKey ?? undefined) : undefined,
      baseUrl: key?.isActive ? (key.baseUrl ?? undefined) : undefined,
    }
  }

  private async resolveFallbackOllamaContext(userId: string): Promise<SpecialistLlmContext> {
    const ollama = await this.users.getRawLlmKey(userId, 'ollama')
    return {
      provider: 'ollama',
      apiKey: undefined,
      baseUrl: ollama?.isActive ? (ollama.baseUrl ?? undefined) : undefined,
      model: undefined,
    }
  }

  private synthesizeOutputs(
    objective: string,
    planSteps: string[],
    outputs: Array<{ role: NanobotSpecialistRole; output: string }>,
  ) {
    const sections = outputs.map((entry) => `### ${entry.role}\n${entry.output}`)
    const numberedPlan = planSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')
    return [
      `## Specialist Synthesis`,
      '',
      `Objective: ${objective}`,
      '',
      '### Plan',
      numberedPlan,
      '',
      ...sections,
      '',
      '### Final',
      'Combined specialist outputs into a single executable plan with validation and risk controls.',
    ].join('\n')
  }

  private toSpecialistRun(row: SubagentRun): NanobotSpecialistRun {
    return {
      id: row.id,
      userId: row.userId,
      conversationId: row.conversationId,
      parentRunId: row.parentRunId,
      role: this.normalizeSpecialistRole(row.role),
      label: row.label,
      objective: row.objective,
      input: this.parseJsonRecord(row.input),
      output: row.output ?? null,
      status: this.normalizeSubagentStatus(row.status),
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      error: row.error ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toDelegationEdge(row: DelegationEdge): NanobotDelegationEdge {
    return {
      id: row.id,
      userId: row.userId,
      fromRunId: row.fromRunId,
      toRunId: row.toRunId,
      intent: row.intent,
      status: this.normalizeDelegationStatus(row.status),
      metadata: this.parseJsonRecordOrNull(row.metadata),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private normalizeSpecialistRole(role: string): NanobotSpecialistRole {
    if (
      role === 'planner'
      || role === 'researcher'
      || role === 'builder'
      || role === 'operator'
      || role === 'reviewer'
    ) {
      return role
    }
    return 'planner'
  }

  private normalizeSubagentStatus(status: string): NanobotSubagentStatus {
    if (status === 'queued' || status === 'running' || status === 'done' || status === 'error') {
      return status
    }
    return 'queued'
  }

  private normalizeDelegationStatus(status: string): NanobotDelegationStatus {
    if (status === 'delegated' || status === 'accepted' || status === 'completed' || status === 'failed') {
      return status
    }
    return 'delegated'
  }

  private parseJsonRecord(raw: string | null | undefined): Record<string, unknown> {
    if (!raw || !raw.trim()) return {}
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {}
      }
      return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private parseJsonRecordOrNull(raw: string | null | undefined) {
    const parsed = this.parseJsonRecord(raw)
    return Object.keys(parsed).length > 0 ? parsed : null
  }

  private stringifyJson(input: Record<string, unknown>) {
    try {
      return JSON.stringify(input)
    } catch {
      return '{}'
    }
  }

  private asNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return null
  }

  private toLegacyRole(role: NanobotSpecialistRole): NanobotSubagentRole {
    if (role === 'researcher') return 'planner'
    if (role === 'builder' || role === 'operator') return 'executor'
    if (role === 'reviewer') return 'critic'
    return 'planner'
  }

  private normalizeProvider(value?: string | null): LLMProvider | null {
    const normalized = (value ?? '').trim().toLowerCase()
    if (
      normalized === 'anthropic'
      || normalized === 'openai'
      || normalized === 'google'
      || normalized === 'ollama'
      || normalized === 'minimax'
      || normalized === 'perplexity'
    ) {
      return normalized
    }
    return null
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
  }

  private async clearDelegatedRuns(userId: string, runId: string) {
    const edges = await this.prisma.delegationEdge.findMany({
      where: { userId, fromRunId: runId },
      select: { toRunId: true },
    })
    const runIds = [...new Set(edges.map((edge) => edge.toRunId))]
    if (runIds.length > 0) {
      await this.prisma.subagentRun.deleteMany({
        where: {
          userId,
          id: { in: runIds },
        },
      })
    }

    await this.prisma.delegationEdge.deleteMany({
      where: { userId, fromRunId: runId },
    })
  }
}
