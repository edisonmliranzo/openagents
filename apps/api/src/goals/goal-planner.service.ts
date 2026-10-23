import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import { DocumentStore } from '../prisma/document-store.service'
import { GoalService } from './goal.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AgentService } from '../agent/agent.service'
import { LessonsStore } from '../reflection/lessons.store'

export type PlanStepStatus = 'pending' | 'awaiting_approval' | 'done' | 'skipped'

export interface PlanStep {
  /** Same id as the goal milestone it maps to. */
  id: string
  title: string
  detail: string
  /** What must exist for this step to count as done (the output contract). */
  expectedOutput?: string
  risky: boolean
  status: PlanStepStatus
  output?: string
  updatedAt?: string
  /** How many times the step has been executed and failed its contract. */
  attempts?: number
  /**
   * Why the step is waiting:
   *  - `plan` — the planner flagged it as risky; the user approves the *step*
   *  - `tool` — the agent hit a tool that needs approval mid-run
   */
  approvalKind?: 'plan' | 'tool'
}

export interface GoalPlan {
  goalId: string
  createdAt: string
  steps: PlanStep[]
  autoAdvance: boolean
  lastAdvancedDay?: string
  lastWeeklySummaryAt?: string
  /** Isolated conversation the worker runs this goal in. */
  conversationId?: string
}

export interface ProgressLogEntry {
  id: string
  goalId: string
  at: string
  kind: 'plan' | 'advance' | 'approval_requested' | 'approved' | 'rejected' | 'weekly_summary' | 'error'
  message: string
}

interface UserPlansFile {
  plans: Record<string, GoalPlan>
  log: ProgressLogEntry[]
}

const TICK_MS = 60 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_LOG = 400
const RISKY_PATTERN = /\b(send|email|post|publish|pay|purchase|buy|transfer|delete|deploy|sign|submit|book|cancel|tweet|message|invite|contract)\b/i

/**
 * Long-horizon goals: LLM milestone plan -> daily worker advances the next step.
 *
 * The worker runs the *agent* (not a bare LLM call), so a step can use tools and
 * actually complete its task instead of only drafting something. Risky steps
 * are never executed automatically — they wait for explicit user approval at the
 * step level, and the agent's own tool-level approvals still apply on top.
 */
@Injectable()
export class GoalPlannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoalPlannerService.name)
  private timer?: NodeJS.Timeout
  private ticking = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalService,
    private readonly moduleRef: ModuleRef,
    private readonly documents: DocumentStore,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  // ── lazy cross-module deps (avoid circular module imports with AgentModule) ──
  private lazy<T>(token: new (...args: any[]) => T): T | null {
    try {
      return this.moduleRef.get(token, { strict: false })
    } catch {
      return null
    }
  }
  private get llm() { return this.lazy(LLMService) }
  private get users() { return this.lazy(UsersService) }
  private get notifications() { return this.lazy(NotificationsService) }
  /** The agent service is resolved lazily: AgentModule imports GoalsModule. */
  private get agent() { return this.lazy(AgentService) }
  private get lessons() { return this.lazy(LessonsStore) }

  private async read(userId: string): Promise<UserPlansFile> {
    const raw = await this.documents.read<Partial<UserPlansFile>>(userId, 'goal_plans', () => ({}))
    return { plans: raw.plans ?? {}, log: Array.isArray(raw.log) ? raw.log : [] }
  }

  private async write(userId: string, data: UserPlansFile) {
    data.log = data.log.slice(0, MAX_LOG)
    await this.documents.write(userId, 'goal_plans', data)
  }

  private addLog(data: UserPlansFile, goalId: string, kind: ProgressLogEntry['kind'], message: string) {
    data.log.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      goalId,
      at: new Date().toISOString(),
      kind,
      message: message.slice(0, 2000),
    })
  }

  private async complete(userId: string, prompt: string, system: string): Promise<string> {
    const llm = this.llm
    if (!llm) throw new Error('LLM unavailable')
    const settings = await this.users?.getSettings(userId).catch(() => null)
    const provider = (settings?.preferredProvider ?? undefined) as any

    // The user's key is stored (encrypted) per user — without it every call
    // falls back to the default provider and fails.
    const stored = provider
      ? await this.users?.getRawLlmKey(userId, provider).catch(() => null)
      : null
    const apiKey = stored?.isActive
      ? (stored.apiKey ?? stored.loginPassword ?? undefined)
      : undefined
    const baseUrl = stored?.isActive ? (stored.baseUrl ?? undefined) : undefined

    const res = await llm.complete(
      [{ role: 'user', content: prompt }],
      [],
      system,
      provider,
      apiKey,
      baseUrl,
      settings?.preferredModel ?? undefined,
    )
    return String(res?.content ?? '').trim()
  }

  private async notify(userId: string, title: string, body: string, type: 'info' | 'warning' | 'success' = 'info') {
    await this.notifications?.create(userId, title, body.slice(0, 1000), type).catch(() => undefined)
  }

  // ── public API ──

  async getPlan(userId: string, goalId: string) {
    const data = await this.read(userId)
    return {
      plan: data.plans[goalId] ?? null,
      log: data.log.filter((l) => l.goalId === goalId).slice(0, 60),
    }
  }

  async getLog(userId: string, limit = 100) {
    const data = await this.read(userId)
    return data.log.slice(0, Math.max(1, Math.min(limit, MAX_LOG)))
  }

  async createPlan(userId: string, goalId: string) {
    const goal = await this.goals.get(userId, goalId)
    if (!goal) return null
    const raw = await this.complete(
      userId,
      `Goal: ${goal.title}\nDescription: ${goal.description || '(none)'}\nDue: ${goal.dueDate ?? 'unspecified'}\n\n` +
        'Break this goal into 4-8 sequential milestones, each achievable in roughly one focused day. ' +
        'For each step also define expected_output: the concrete, checkable result that proves the step is done ' +
        '(a saved note, a list of at least N items, a draft document, a created record — never "research completed"). ' +
        'Mark "risky": true for any step that would take an external action (sending messages, spending money, publishing, deleting, signing up). ' +
        'Reply JSON only: {"steps":[{"title":"<=80 chars","detail":"<=200 chars","expected_output":"<=160 chars","risky":false}]}',
      'You are a pragmatic planning assistant for OpenAgents. Return only valid JSON.',
    )
    let steps: Array<{ title: string; detail: string; expectedOutput: string; risky: boolean }> = []
    try {
      const m = raw.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) : null
      if (Array.isArray(parsed?.steps)) {
        steps = parsed.steps
          .filter((s: any) => typeof s?.title === 'string' && s.title.trim())
          .slice(0, 8)
          .map((s: any) => ({
            title: String(s.title).trim().slice(0, 120),
            detail: String(s.detail ?? '').trim().slice(0, 300),
            expectedOutput: String(s.expected_output ?? s.expectedOutput ?? '').trim().slice(0, 300),
            risky: Boolean(s.risky) || RISKY_PATTERN.test(`${s.title} ${s.detail ?? ''}`),
          }))
      }
    } catch {
      // fall through
    }
    if (!steps.length) throw new Error('Planner did not return a usable plan')

    const updated = await this.goals.replaceMilestones(userId, goalId, steps.map((s) => s.title))
    if (!updated) return null
    const data = await this.read(userId)
    data.plans[goalId] = {
      goalId,
      createdAt: new Date().toISOString(),
      autoAdvance: true,
      steps: updated.milestones.map((m, i) => ({
        id: m.id,
        title: m.title,
        detail: steps[i]?.detail ?? '',
        expectedOutput: steps[i]?.expectedOutput || undefined,
        risky: steps[i]?.risky ?? false,
        status: 'pending' as const,
      })),
    }
    this.addLog(data, goalId, 'plan', `Created a ${steps.length}-step plan.`)
    await this.write(userId, data)
    return this.getPlan(userId, goalId)
  }

  async setAutoAdvance(userId: string, goalId: string, autoAdvance: boolean) {
    const data = await this.read(userId)
    const plan = data.plans[goalId]
    if (!plan) return null
    plan.autoAdvance = autoAdvance
    await this.write(userId, data)
    return plan
  }

  /** Advance the next pending step of a goal. */
  async advance(userId: string, goalId: string, trigger: 'manual' | 'daily' = 'manual') {
    const goal = await this.goals.get(userId, goalId)
    if (!goal || goal.status !== 'active') return null
    const data = await this.read(userId)
    const plan = data.plans[goalId]
    if (!plan) return null

    // A step that paused on a tool approval can finish once the approvals
    // queue has resolved it and the agent has posted the result.
    const toolPaused = plan.steps.find((s) => s.status === 'awaiting_approval' && s.approvalKind === 'tool')
    if (toolPaused) {
      const finished = await this.finishToolPausedStep(userId, goal, plan, toolPaused, data)
      if (finished) {
        await this.write(userId, data)
        return { plan, message: `Completed "${toolPaused.title}" after approval.` }
      }
      return { plan, message: 'Waiting for approval on a risky step.' }
    }

    if (plan.steps.some((s) => s.status === 'awaiting_approval')) {
      return { plan, message: 'Waiting for approval on a risky step.' }
    }
    const step = plan.steps.find((s) => s.status === 'pending')
    plan.lastAdvancedDay = new Date().toISOString().slice(0, 10)
    if (!step) {
      await this.write(userId, data)
      return { plan, message: 'All steps complete.' }
    }

    if (step.risky) {
      step.status = 'awaiting_approval'
      step.approvalKind = 'plan'
      step.updatedAt = new Date().toISOString()
      this.addLog(data, goalId, 'approval_requested', `Step "${step.title}" needs your approval before it runs.`)
      await this.write(userId, data)
      await this.notify(userId, `Approval needed: ${goal.title}`, `Next step "${step.title}" may take an external action. Review it on the Goals page.`, 'warning')
      return { plan, message: 'Approval requested.' }
    }

    await this.executeStep(userId, goal.title, plan, step, data, trigger)
    await this.write(userId, data)
    return { plan, message: `Advanced "${step.title}".` }
  }

  /**
   * Runs a step by handing it to the agent, so the worker can use tools and
   * genuinely complete the task rather than only drafting an answer.
   */
  private async executeStep(userId: string, goalTitle: string, plan: GoalPlan, step: PlanStep, data: UserPlansFile, trigger: string) {
    const prior = plan.steps
      .filter((s) => s.status === 'done' && s.output)
      .slice(-3)
      .map((s) => `- ${s.title}: ${String(s.output).slice(0, 300)}`)
      .join('\n')

    const agent = this.agent
    if (!agent) {
      // The agent module is not available (unit-test / partial boot) — fall back
      // to a pure draft so the step is never silently skipped.
      await this.executeStepAsDraft(userId, goalTitle, plan, step, data, prior, trigger)
      return
    }

    try {
      const conversationId = await this.ensureGoalConversation(userId, goalTitle, plan)

      const instruction = [
        `Goal: ${goalTitle}`,
        `Current step: ${step.title}`,
        step.detail ? `Details: ${step.detail}` : 'Details: (none)',
        step.expectedOutput ? `This step is DONE only when: ${step.expectedOutput}` : '',
        prior ? `Previous progress:\n${prior}` : '',
        '',
        'Complete this step now. Use the available tools to actually do the work — gather, look things up, create and update things as needed.',
        'When you are done, reply with a short summary of what you actually did, and end with one line starting with "EVIDENCE:" that names the concrete result you produced (the note saved, the list built, the record created).',
        'Do not ask the user questions — you are running unattended; make reasonable assumptions and report them.',
      ].filter(Boolean).join('\n')

      const emitted: Array<[string, unknown]> = []
      await agent.run({
        conversationId,
        userId,
        userMessage: instruction,
        emit: (event: string, data: unknown) => { emitted.push([event, data]) },
      })

      const paused = emitted.some(([event]) => event === 'approval_required')
      const output = await this.latestAgentMessage(conversationId)

      if (paused) {
        // A tool in the step needs approval. The step stays open; the
        // approvals queue owns the decision and the agent resumes from there.
        step.status = 'awaiting_approval'
        step.approvalKind = 'tool'
        step.updatedAt = new Date().toISOString()
        this.addLog(data, plan.goalId, 'approval_requested', `(${trigger}) "${step.title}" needs approval for a tool before it can finish.`)
        await this.notify(userId, `Approval needed: ${goalTitle}`, `"${step.title}" is waiting on a tool approval. Review it in Approvals.`, 'warning')
        return
      }

      // Output contract: judge the result against what the step promised before
      // claiming it done. A step that keeps failing is skipped, not retried forever.
      const verdict = await this.judgeStepOutput(userId, step, output)
      if (verdict && !verdict.met) {
        step.attempts = (step.attempts ?? 0) + 1
        step.updatedAt = new Date().toISOString()
        if (step.attempts >= 2) {
          step.status = 'skipped'
          step.output = (output || '(no output)').slice(0, 4000)
          this.addLog(data, plan.goalId, 'error', `"${step.title}" failed its contract twice and was skipped. ${verdict.reason}`)
          await this.notify(userId, `Goal step skipped: ${goalTitle}`, `"${step.title}" did not produce: ${step.expectedOutput ?? 'the expected result'}. ${verdict.reason}`, 'warning')
          void this.lessons
            ?.addLesson(userId, {
              text: `Goal step "${step.title}" failed twice. Expected: ${String(step.expectedOutput ?? '').slice(0, 80)}. ${verdict.reason.slice(0, 80)}`,
              kind: 'avoid',
            })
            .catch(() => undefined)
        } else {
          this.addLog(data, plan.goalId, 'error', `(${trigger}) "${step.title}" did not meet its contract — it will be retried. ${verdict.reason}`)
        }
        return
      }

      step.status = 'done'
      step.output = (output || '(no output)').slice(0, 4000)
      step.updatedAt = new Date().toISOString()
      await this.goals.completeMilestone(userId, plan.goalId, step.id).catch(() => null)
      this.addLog(data, plan.goalId, 'advance', `(${trigger}) Completed "${step.title}". ${String(output).slice(0, 300)}`)
    } catch (e: any) {
      this.addLog(data, plan.goalId, 'error', `Failed to advance "${step.title}": ${e?.message ?? e}`)
    }
  }

  /** LLM-only fallback used when the agent is unavailable. */
  private async executeStepAsDraft(
    userId: string,
    goalTitle: string,
    plan: GoalPlan,
    step: PlanStep,
    data: UserPlansFile,
    prior: string,
    trigger: string,
  ) {
    try {
      const output = await this.complete(
        userId,
        `Goal: ${goalTitle}\nCurrent step: ${step.title}\nDetails: ${step.detail || '(none)'}\nPrevious progress:\n${prior || '(none)'}\n\n` +
          'Do the thinking/drafting work for this step now: produce the concrete deliverable (outline, draft, checklist, research notes). ' +
          'Do NOT claim to have taken external actions. End with one line "Next:" suggesting what the user should do. <=300 words.',
        'You are the OpenAgents long-horizon goal worker. You draft and plan; you never take external actions.',
      )
      step.status = 'done'
      step.output = output.slice(0, 4000)
      step.updatedAt = new Date().toISOString()
      await this.goals.completeMilestone(userId, plan.goalId, step.id).catch(() => null)
      this.addLog(data, plan.goalId, 'advance', `(${trigger}) Completed "${step.title}". ${output.slice(0, 300)}`)
    } catch (e: any) {
      this.addLog(data, plan.goalId, 'error', `Failed to advance "${step.title}": ${e?.message ?? e}`)
    }
  }

  /**
   * Completes a step that paused waiting for a tool approval, once the
   * approvals queue has resolved it and the agent has posted the outcome into
   * the goal conversation.
   */
  private async finishToolPausedStep(
    userId: string,
    goal: { id: string; title: string },
    plan: GoalPlan,
    step: PlanStep,
    data: UserPlansFile,
  ): Promise<boolean> {
    if (!plan.conversationId) return false

    // Still waiting on a decision?
    const pending = await this.prisma.approval.findFirst({
      where: { conversationId: plan.conversationId, status: 'pending' },
      select: { id: true },
    })
    if (pending) return false

    const output = await this.latestAgentMessage(plan.conversationId)
    if (!output) return false

    step.status = 'done'
    step.output = output.slice(0, 4000)
    step.updatedAt = new Date().toISOString()
    await this.goals.completeMilestone(userId, plan.goalId, step.id).catch(() => null)
    this.addLog(data, plan.goalId, 'advance', `Completed "${step.title}" after approval. ${output.slice(0, 300)}`)
    return true
  }

  /** Finds (or creates) the isolated conversation a goal's steps run in. */
  private async ensureGoalConversation(userId: string, goalTitle: string, plan: GoalPlan): Promise<string> {
    if (plan.conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: plan.conversationId, userId },
        select: { id: true },
      })
      if (existing) return existing.id
    }

    const title = `Goal: ${goalTitle}`.slice(0, 120)
    const created = await this.prisma.conversation.create({
      data: { userId, title },
    })
    plan.conversationId = created.id
    return created.id
  }

  /**
   * Judges a step's actual output against its expected-output contract.
   * Returns null when there is no contract to check, or when the judge itself
   * fails — a broken judge must never block a step, so we then trust the run.
   */
  private async judgeStepOutput(
    userId: string,
    step: PlanStep,
    output: string,
  ): Promise<{ met: boolean; reason: string } | null> {
    const contract = step.expectedOutput?.trim()
    if (!contract) return null
    if (!output || !output.trim()) {
      return { met: false, reason: 'The step produced no output.' }
    }

    try {
      const raw = await this.complete(
        userId,
        `Step: ${step.title}\nContract — this step is done only when: ${contract}\n\nActual output:\n${output.slice(0, 3000)}\n\n` +
          'Did the actual output satisfy the contract? Judge strictly: the output must contain or concretely describe the expected deliverable, not merely claim it is done. ' +
          'Reply JSON only: {"met": true|false, "reason": "<=40 words"}',
        'You are a strict task-output validator. Return only valid JSON.',
      )
      const m = raw.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) : null
      if (parsed && typeof parsed.met === 'boolean') {
        return { met: parsed.met, reason: String(parsed.reason ?? '').slice(0, 200) }
      }
    } catch {
      // fall through: trust the run when the judge is unavailable
    }
    return null
  }

  /** The most recent agent reply in the goal conversation. */
  private async latestAgentMessage(conversationId: string): Promise<string> {
    const message = await this.prisma.message.findFirst({
      where: { conversationId, role: 'agent', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    })
    return (message?.content ?? '').trim()
  }

  async decide(userId: string, goalId: string, stepId: string, approve: boolean) {
    const goal = await this.goals.get(userId, goalId)
    if (!goal) return null
    const data = await this.read(userId)
    const plan = data.plans[goalId]
    const step = plan?.steps.find((s) => s.id === stepId)
    if (!plan || !step || step.status !== 'awaiting_approval') return null
    if (approve) {
      this.addLog(data, goalId, 'approved', `You approved "${step.title}".`)
      await this.executeStep(userId, goal.title, plan, step, data, 'approved')
    } else {
      step.status = 'skipped'
      step.updatedAt = new Date().toISOString()
      this.addLog(data, goalId, 'rejected', `You skipped "${step.title}".`)
    }
    await this.write(userId, data)
    return { plan }
  }

  async weeklySummary(userId: string, force = false) {
    const data = await this.read(userId)
    const since = Date.now() - WEEK_MS
    const ids = Object.keys(data.plans).filter(
      (id) => force || !data.plans[id].lastWeeklySummaryAt || Date.parse(data.plans[id].lastWeeklySummaryAt!) < since,
    )
    if (!ids.length) return null
    const lines: string[] = []
    for (const id of ids) {
      const goal = await this.goals.get(userId, id)
      if (!goal) continue
      const recent = data.log.filter((l) => l.goalId === id && Date.parse(l.at) >= since && l.kind !== 'weekly_summary')
      const done = recent.filter((l) => l.kind === 'advance' || l.kind === 'approved').length
      const waiting = data.plans[id].steps.filter((s) => s.status === 'awaiting_approval').length
      lines.push(`• ${goal.title}: ${goal.progress}% (${done} step(s) this week${waiting ? `, ${waiting} awaiting approval` : ''})`)
      data.plans[id].lastWeeklySummaryAt = new Date().toISOString()
    }
    if (!lines.length) return null
    const summary = lines.join('\n')
    for (const id of ids) this.addLog(data, id, 'weekly_summary', summary)
    await this.write(userId, data)
    await this.notify(userId, 'Weekly goals summary', summary, 'info')
    return { summary }
  }

  /** Hourly tick: once per day per goal, advance the next step; weekly summaries. */
  async tick() {
    if (this.ticking) return
    if (['0', 'false', 'off', 'no'].includes(String(process.env.GOAL_WORKER_ENABLED ?? 'true').toLowerCase())) return
    this.ticking = true
    try {
      const today = new Date().toISOString().slice(0, 10)
      const rows = await this.prisma.goal.findMany({ where: { status: 'active' }, select: { id: true, userId: true }, take: 500 })
      const byUser = new Map<string, string[]>()
      for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.id])
      for (const [userId, goalIds] of byUser) {
        const data = await this.read(userId)
        for (const goalId of goalIds) {
          const plan = data.plans[goalId]
          if (!plan?.autoAdvance || plan.lastAdvancedDay === today) continue
          await this.advance(userId, goalId, 'daily').catch((e: any) => this.logger.warn(`Goal advance failed: ${e?.message ?? e}`))
        }
        if (Object.keys(data.plans).length) await this.weeklySummary(userId).catch(() => null)
      }
    } finally {
      this.ticking = false
    }
  }
}
