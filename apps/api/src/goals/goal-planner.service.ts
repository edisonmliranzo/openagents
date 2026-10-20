import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { promises as fs } from 'fs'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'
import { GoalService } from './goal.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { NotificationsService } from '../notifications/notifications.service'

export type PlanStepStatus = 'pending' | 'awaiting_approval' | 'done' | 'skipped'

export interface PlanStep {
  /** Same id as the goal milestone it maps to. */
  id: string
  title: string
  detail: string
  risky: boolean
  status: PlanStepStatus
  output?: string
  updatedAt?: string
}

export interface GoalPlan {
  goalId: string
  createdAt: string
  steps: PlanStep[]
  autoAdvance: boolean
  lastAdvancedDay?: string
  lastWeeklySummaryAt?: string
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
 * Steps the planner (or keyword heuristics) flag as risky (external side effects)
 * are never executed automatically; they wait for explicit user approval.
 * The worker only drafts work with the LLM (no tools), so it cannot take actions.
 */
@Injectable()
export class GoalPlannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoalPlannerService.name)
  private readonly dir = path.resolve(process.env.GOAL_PLANS_DATA_DIR ?? path.join(process.cwd(), 'data', 'goal-plans'))
  private timer?: NodeJS.Timeout
  private ticking = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalService,
    private readonly moduleRef: ModuleRef,
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

  private fileFor(userId: string) {
    return path.join(this.dir, `${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
  }

  private async read(userId: string): Promise<UserPlansFile> {
    try {
      const raw = JSON.parse(await fs.readFile(this.fileFor(userId), 'utf8')) as Partial<UserPlansFile>
      return { plans: raw.plans ?? {}, log: Array.isArray(raw.log) ? raw.log : [] }
    } catch {
      return { plans: {}, log: [] }
    }
  }

  private async write(userId: string, data: UserPlansFile) {
    data.log = data.log.slice(0, MAX_LOG)
    await fs.mkdir(this.dir, { recursive: true })
    const target = this.fileFor(userId)
    await fs.writeFile(`${target}.tmp`, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(`${target}.tmp`, target)
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
    const res = await llm.complete(
      [{ role: 'user', content: prompt }],
      [],
      system,
      (settings?.preferredProvider ?? undefined) as any,
      undefined,
      undefined,
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
        'Mark "risky": true for any step that would take an external action (sending messages, spending money, publishing, deleting, signing up). ' +
        'Reply JSON only: {"steps":[{"title":"<=80 chars","detail":"<=200 chars","risky":false}]}',
      'You are a pragmatic planning assistant for OpenAgents. Return only valid JSON.',
    )
    let steps: Array<{ title: string; detail: string; risky: boolean }> = []
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
        risky: steps[i]?.risky ?? false,
        status: 'pending',
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

  private async executeStep(userId: string, goalTitle: string, plan: GoalPlan, step: PlanStep, data: UserPlansFile, trigger: string) {
    const prior = plan.steps
      .filter((s) => s.status === 'done' && s.output)
      .slice(-3)
      .map((s) => `- ${s.title}: ${String(s.output).slice(0, 300)}`)
      .join('\n')
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
