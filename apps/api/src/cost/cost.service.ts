import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'

export interface CostEntry {
  id: string
  userId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  conversationId: string
  runId?: string
  createdAt: string
}

export interface CostBucket { costUsd: number; runs: number; tokens: number }

export interface CostDailyPoint { date: string; costUsd: number; tokens: number; runs: number }

export interface CostSummary {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalRuns: number
  byProvider: Record<string, CostBucket>
  byModel: Record<string, CostBucket & { provider: string }>
  daily: CostDailyPoint[]
  monthToDateUsd: number
  todayUsd: number
  budget: BudgetStatus
  period: { from: string; to: string }
}

export type RouterMode = 'manual' | 'auto-cheapest' | 'balanced' | 'best'
export type RouterTier = 'simple' | 'standard' | 'complex'

export interface RouterSettings {
  mode: RouterMode
  tiers: Record<RouterTier, { provider: string; model: string }>
  monthlyBudgetUsd: number
  alertThresholdPct: number
  updatedAt?: string
}

export interface BudgetStatus {
  capUsd: number
  alertThresholdPct: number
  spentUsd: number
  pct: number
  alert: boolean
  exceeded: boolean
}

// Approximate pricing per 1M tokens (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'default': { input: 1.0, output: 3.0 },
}

export const DEFAULT_ROUTER_SETTINGS: RouterSettings = {
  mode: 'manual',
  tiers: {
    simple: { provider: 'google', model: 'gemini-2.0-flash' },
    standard: { provider: 'openai', model: 'gpt-4o-mini' },
    complex: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  },
  monthlyBudgetUsd: 0,
  alertThresholdPct: 80,
}

const MODES: RouterMode[] = ['manual', 'auto-cheapest', 'balanced', 'best']
const DAY = 24 * 60 * 60 * 1000

@Injectable()
export class CostService {
  private readonly logger = new Logger(CostService.name)
  private entries: CostEntry[] = []
  private readonly settingsDir = path.join(process.cwd(), 'data', 'cost-router')

  constructor(private prisma: PrismaService) {}

  static estimate(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = PRICING[model] ?? PRICING['default']
    const usd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
    return Math.round(usd * 1_000_000) / 1_000_000
  }

  record(input: {
    userId: string
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    conversationId: string
    runId?: string
  }): CostEntry {
    const entry: CostEntry = {
      id: `cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostUsd: CostService.estimate(input.model, input.inputTokens, input.outputTokens),
      conversationId: input.conversationId,
      runId: input.runId,
      createdAt: new Date().toISOString(),
    }
    this.entries.push(entry)
    if (this.entries.length > 5000) this.entries.splice(0, this.entries.length - 5000)
    // Persist to MetricLog so data survives restarts.
    this.prisma.metricLog
      .create({
        data: {
          userId: entry.userId,
          metricType: 'llm_cost',
          action: 'completed',
          provider: entry.provider,
          model: entry.model,
          tokensUsed: entry.inputTokens + entry.outputTokens,
          costUsd: entry.estimatedCostUsd,
          conversationId: entry.conversationId || null,
          metadata: JSON.stringify({ inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, runId: entry.runId }),
        },
      })
      .catch((err: unknown) => this.logger.warn(`Failed to persist cost entry: ${String(err)}`))
    return entry
  }

  /** Loads per-user usage from MetricLog (agent runs + llm_cost rows). */
  private async loadEntries(userId: string, since: Date, limit?: number): Promise<CostEntry[]> {
    let rows: Array<{
      id: string; userId: string; metricType: string; provider: string | null; model: string | null
      tokensUsed: number | null; costUsd: number | null; conversationId: string | null; metadata: string | null; createdAt: Date
    }> = []
    try {
      rows = await this.prisma.metricLog.findMany({
        where: {
          userId,
          createdAt: { gte: since },
          OR: [{ costUsd: { not: null } }, { tokensUsed: { gt: 0 } }],
        },
        orderBy: { createdAt: 'desc' },
        take: limit ?? 20_000,
      })
    } catch (err) {
      this.logger.warn(`MetricLog query failed, using in-memory costs: ${String(err)}`)
      return this.entries
        .filter((e) => e.userId === userId && new Date(e.createdAt) >= since)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    }

    return rows.map((r) => {
      let meta: Record<string, unknown> = {}
      try { meta = r.metadata ? JSON.parse(r.metadata) : {} } catch { meta = {} }
      const total = r.tokensUsed ?? 0
      const inputTokens = typeof meta.inputTokens === 'number' ? meta.inputTokens : Math.round(total * 0.75)
      const outputTokens = typeof meta.outputTokens === 'number' ? meta.outputTokens : total - inputTokens
      const model = r.model ?? 'unknown'
      return {
        id: r.id,
        userId: r.userId,
        provider: r.provider ?? 'unknown',
        model,
        inputTokens,
        outputTokens,
        estimatedCostUsd: r.costUsd ?? CostService.estimate(model, inputTokens, outputTokens),
        conversationId: r.conversationId ?? '',
        runId: typeof meta.runId === 'string' ? meta.runId : undefined,
        createdAt: r.createdAt.toISOString(),
      }
    })
  }

  async getSummary(userId: string, days = 30): Promise<CostSummary> {
    days = Math.max(1, Math.min(365, days || 30))
    const now = new Date()
    const cutoff = new Date(now.getTime() - (days - 1) * DAY)
    cutoff.setUTCHours(0, 0, 0, 0)
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const since = monthStart < cutoff ? monthStart : cutoff
    const all = await this.loadEntries(userId, since)
    const relevant = all.filter((e) => new Date(e.createdAt) >= cutoff)

    const byProvider: CostSummary['byProvider'] = {}
    const byModel: CostSummary['byModel'] = {}
    const dailyMap = new Map<string, CostDailyPoint>()
    for (let i = 0; i < days; i++) {
      const d = new Date(cutoff.getTime() + i * DAY).toISOString().slice(0, 10)
      dailyMap.set(d, { date: d, costUsd: 0, tokens: 0, runs: 0 })
    }

    for (const e of relevant) {
      const tokens = e.inputTokens + e.outputTokens
      const p = (byProvider[e.provider] ??= { costUsd: 0, runs: 0, tokens: 0 })
      p.costUsd += e.estimatedCostUsd; p.runs += 1; p.tokens += tokens
      const m = (byModel[e.model] ??= { costUsd: 0, runs: 0, tokens: 0, provider: e.provider })
      m.costUsd += e.estimatedCostUsd; m.runs += 1; m.tokens += tokens
      const day = dailyMap.get(e.createdAt.slice(0, 10))
      if (day) { day.costUsd += e.estimatedCostUsd; day.tokens += tokens; day.runs += 1 }
    }

    const today = now.toISOString().slice(0, 10)
    const monthToDateUsd = all.filter((e) => new Date(e.createdAt) >= monthStart).reduce((s, e) => s + e.estimatedCostUsd, 0)
    const settings = await this.getRouterSettings(userId)
    const totalInputTokens = relevant.reduce((s, e) => s + e.inputTokens, 0)
    const totalOutputTokens = relevant.reduce((s, e) => s + e.outputTokens, 0)

    return {
      totalCostUsd: relevant.reduce((s, e) => s + e.estimatedCostUsd, 0),
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalRuns: relevant.length,
      byProvider,
      byModel,
      daily: [...dailyMap.values()],
      monthToDateUsd,
      todayUsd: dailyMap.get(today)?.costUsd ?? 0,
      budget: this.buildBudget(settings, monthToDateUsd),
      period: { from: cutoff.toISOString(), to: now.toISOString() },
    }
  }

  async getHistory(userId: string, limit = 100): Promise<CostEntry[]> {
    limit = Math.max(1, Math.min(1000, limit || 100))
    return this.loadEntries(userId, new Date(0), limit)
  }

  private buildBudget(settings: RouterSettings, spentUsd: number): BudgetStatus {
    const capUsd = settings.monthlyBudgetUsd
    const pct = capUsd > 0 ? (spentUsd / capUsd) * 100 : 0
    return {
      capUsd,
      alertThresholdPct: settings.alertThresholdPct,
      spentUsd,
      pct,
      alert: capUsd > 0 && pct >= settings.alertThresholdPct,
      exceeded: capUsd > 0 && spentUsd >= capUsd,
    }
  }

  async getBudgetStatus(userId: string): Promise<BudgetStatus> {
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const entries = await this.loadEntries(userId, monthStart)
    const spent = entries.reduce((s, e) => s + e.estimatedCostUsd, 0)
    return this.buildBudget(await this.getRouterSettings(userId), spent)
  }

  // ── Router settings (per-user JSON file, no migrations) ──────────────────

  private settingsFile(userId: string) {
    return path.join(this.settingsDir, `${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
  }

  async getRouterSettings(userId: string): Promise<RouterSettings> {
    try {
      const raw = await fs.readFile(this.settingsFile(userId), 'utf8')
      return this.normalize(JSON.parse(raw))
    } catch {
      return structuredClone(DEFAULT_ROUTER_SETTINGS)
    }
  }

  async updateRouterSettings(userId: string, patch: Partial<RouterSettings>): Promise<RouterSettings> {
    const current = await this.getRouterSettings(userId)
    const next = this.normalize({
      ...current,
      ...patch,
      tiers: { ...current.tiers, ...(patch?.tiers ?? {}) } as RouterSettings['tiers'],
    })
    next.updatedAt = new Date().toISOString()
    await fs.mkdir(this.settingsDir, { recursive: true })
    await fs.writeFile(this.settingsFile(userId), JSON.stringify(next, null, 2), 'utf8')
    // Mirror the cap into BudgetLimit when possible (best effort).
    try {
      const now = new Date()
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      const alertAtUsd = next.monthlyBudgetUsd * (next.alertThresholdPct / 100)
      await this.prisma.budgetLimit.upsert({
        where: { userId_budgetType: { userId, budgetType: 'monthly' } },
        create: { userId, budgetType: 'monthly', limitUsd: next.monthlyBudgetUsd, alertAtUsd, periodStart, periodEnd, enabled: next.monthlyBudgetUsd > 0 },
        update: { limitUsd: next.monthlyBudgetUsd, alertAtUsd, enabled: next.monthlyBudgetUsd > 0 },
      })
    } catch (err) {
      this.logger.debug?.(`BudgetLimit mirror skipped: ${String(err)}`)
    }
    return next
  }

  private normalize(input: any): RouterSettings {
    const d = DEFAULT_ROUTER_SETTINGS
    const tier = (t: RouterTier) => {
      const v = input?.tiers?.[t]
      return {
        provider: typeof v?.provider === 'string' && v.provider.trim() ? v.provider.trim().slice(0, 64) : d.tiers[t].provider,
        model: typeof v?.model === 'string' && v.model.trim() ? v.model.trim().slice(0, 128) : d.tiers[t].model,
      }
    }
    const budget = Number(input?.monthlyBudgetUsd)
    const alert = Number(input?.alertThresholdPct)
    return {
      mode: MODES.includes(input?.mode) ? input.mode : d.mode,
      tiers: { simple: tier('simple'), standard: tier('standard'), complex: tier('complex') },
      monthlyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : d.monthlyBudgetUsd,
      alertThresholdPct: Number.isFinite(alert) && alert > 0 && alert <= 100 ? alert : d.alertThresholdPct,
      updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : undefined,
    }
  }
}
