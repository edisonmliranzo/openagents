import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { NotificationsService } from '../notifications/notifications.service'
import type { LLMProvider } from '@openagents/shared'

const EVAL_INTERVAL_MS = 6 * 60 * 60 * 1000
const MAX_TASKS_PER_RUN = 10
const MAX_USERS_PER_CYCLE = 5

const JUDGE_PROMPT = `You are a strict evaluator. Score how well the CANDIDATE ANSWER satisfies the REQUEST and its quality notes.
Reply with exactly one integer 0-10 on the first line (10 = would make the user say "perfect"), nothing else.`

@Injectable()
export class EvalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvalService.name)
  private timer?: NodeJS.Timeout
  private readonly ranByDay = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runScheduledCycle(), EVAL_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private get nightlyEnabled(): boolean {
    const raw = (this.config.get<string>('EVAL_NIGHTLY') ?? 'false').trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(raw)
  }

  async runScheduledCycle(): Promise<number> {
    if (!this.nightlyEnabled) return 0
    const dayKey = new Date().toISOString().slice(0, 10)
    const owners = await this.prisma.goldenTask.findMany({
      select: { userId: true },
      distinct: ['userId'],
      take: MAX_USERS_PER_CYCLE,
    })
    let ran = 0
    for (const owner of owners) {
      const key = `${owner.userId}:${dayKey}`
      if (this.ranByDay.has(key)) continue
      this.ranByDay.add(key)
      await this.runSuite(owner.userId).catch((error: any) => {
        this.logger.warn(`Nightly eval failed for ${owner.userId}: ${error?.message ?? error}`)
      })
      ran += 1
    }
    return ran
  }

  async addGoldenTask(userId: string, input: { prompt: string; notes?: string }) {
    const prompt = String(input.prompt ?? '').trim()
    if (!prompt) throw new BadRequestException('prompt is required.')
    return this.prisma.goldenTask.create({
      data: { userId, prompt: prompt.slice(0, 4000), notes: String(input.notes ?? '').trim().slice(0, 2000) },
    })
  }

  listGoldenTasks(userId: string) {
    return this.prisma.goldenTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }

  async deleteGoldenTask(userId: string, id: string) {
    const existing = await this.prisma.goldenTask.findFirst({ where: { id, userId } })
    if (!existing) throw new BadRequestException('Golden task not found.')
    await this.prisma.goldenTask.delete({ where: { id: existing.id } })
    return { ok: true }
  }

  /** Run the suite: answer each golden task, judge the answer, store the score. */
  async runSuite(userId: string) {
    const tasks = await this.prisma.goldenTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_TASKS_PER_RUN,
    })
    if (tasks.length === 0) return { ran: 0, averageScore: null }

    const settings = await this.users.getSettings(userId)
    const provider = (settings.preferredProvider ?? 'ollama') as LLMProvider
    const key = await this.users.getRawLlmKey(userId, provider).catch(() => null)
    const apiKey = key?.isActive ? (key.apiKey ?? key.loginPassword ?? undefined) : undefined
    const baseUrl = key?.isActive ? (key.baseUrl ?? undefined) : undefined

    const results: Array<{ taskId: string; score: number; durationMs: number }> = []
    for (const task of tasks) {
      const startedAt = Date.now()
      try {
        const answer = await this.llm.complete(
          [{ role: 'user', content: task.prompt }],
          [],
          'You are OpenAgents answering a benchmark request. Give your best complete answer.',
          provider,
          apiKey,
          baseUrl,
          settings.preferredModel ?? undefined,
        )
        const output = (answer.content ?? '').trim()
        const score = await this.judge(task.prompt, task.notes, output, provider, apiKey, baseUrl)
        await this.prisma.evalRun.create({
          data: {
            userId,
            goldenTaskId: task.id,
            score,
            output: output.slice(0, 4000),
            provider,
            model: settings.preferredModel ?? null,
            durationMs: Date.now() - startedAt,
          },
        })
        results.push({ taskId: task.id, score, durationMs: Date.now() - startedAt })
      } catch (error: any) {
        await this.prisma.evalRun.create({
          data: {
            userId,
            goldenTaskId: task.id,
            score: 0,
            provider,
            model: settings.preferredModel ?? null,
            durationMs: Date.now() - startedAt,
            error: String(error?.message ?? error).slice(0, 500),
          },
        })
        results.push({ taskId: task.id, score: 0, durationMs: Date.now() - startedAt })
      }
    }

    const averageScore = results.length
      ? Number((results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(1))
      : null
    this.logger.log(`Eval suite for ${userId}: ${results.length} tasks, avg ${averageScore}/10.`)
    await this.checkDrift(userId).catch(() => undefined)
    return { ran: results.length, averageScore, results }
  }

  /** Alert when recent scores drop meaningfully vs the prior window. */
  async checkDrift(userId: string): Promise<{ dropped: boolean; recentAvg: number; priorAvg: number }> {
    const runs = await this.prisma.evalRun.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { score: true },
    })
    if (runs.length < 6) return { dropped: false, recentAvg: 0, priorAvg: 0 }
    const recent = runs.slice(0, Math.max(3, Math.floor(runs.length / 2)))
    const prior = runs.slice(recent.length)
    if (prior.length === 0) return { dropped: false, recentAvg: 0, priorAvg: 0 }
    const avg = (rows: Array<{ score: number }>) => rows.reduce((sum, r) => sum + r.score, 0) / rows.length
    const recentAvg = Number(avg(recent).toFixed(1))
    const priorAvg = Number(avg(prior).toFixed(1))
    const dropped = priorAvg - recentAvg >= 1.5
    if (dropped) {
      await this.notifications
        .create(
          userId,
          'Quality drift detected',
          `Average eval score dropped from ${priorAvg} to ${recentAvg}/10. Check recent model/routing changes before trusting new answers.`,
          'warning',
        )
        .catch(() => undefined)
    }
    return { dropped, recentAvg, priorAvg }
  }

  async results(userId: string) {
    const runs = await this.prisma.evalRun.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, goldenTaskId: true, score: true, model: true, provider: true, durationMs: true, error: true, createdAt: true },
    })
    const byTask = new Map<string, typeof runs>()
    for (const run of runs) {
      const list = byTask.get(run.goldenTaskId) ?? []
      if (list.length < 10) list.push(run)
      byTask.set(run.goldenTaskId, list)
    }
    return {
      latest: runs.slice(0, 20),
      trend: [...byTask.entries()].map(([taskId, taskRuns]) => ({
        taskId,
        average: Number((taskRuns.reduce((s, r) => s + r.score, 0) / taskRuns.length).toFixed(1)),
        runs: taskRuns.length,
      })),
    }
  }

  private async judge(
    prompt: string,
    notes: string,
    output: string,
    provider: LLMProvider,
    apiKey?: string,
    baseUrl?: string,
  ): Promise<number> {
    if (!output) return 0
    try {
      const verdict = await this.llm.complete(
        [
          {
            role: 'user',
            content: `REQUEST:\n${prompt.slice(0, 1500)}\n\nQUALITY NOTES:\n${notes || '(none)'}\n\nCANDIDATE ANSWER:\n${output.slice(0, 3000)}`,
          },
        ],
        [],
        JUDGE_PROMPT,
        provider,
        apiKey,
        baseUrl,
      )
      const match = (verdict.content ?? '').match(/\d+/)
      const score = match ? Math.max(0, Math.min(10, parseInt(match[0], 10))) : 5
      return score
    } catch {
      return 5
    }
  }
}
