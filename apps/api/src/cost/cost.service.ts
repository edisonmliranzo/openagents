import { Injectable, Logger } from '@nestjs/common'

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

export interface CostSummary {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  totalRuns: number
  byProvider: Record<string, { costUsd: number; runs: number }>
  byModel: Record<string, { costUsd: number; runs: number }>
  period: { from: string; to: string }
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

@Injectable()
export class CostService {
  private readonly logger = new Logger(CostService.name)
  private entries: CostEntry[] = []

  record(input: {
    userId: string
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    conversationId: string
    runId?: string
  }): CostEntry {
    const pricing = PRICING[input.model] ?? PRICING['default']
    const estimatedCostUsd =
      (input.inputTokens / 1_000_000) * pricing.input +
      (input.outputTokens / 1_000_000) * pricing.output

    const entry: CostEntry = {
      id: `cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      conversationId: input.conversationId,
      runId: input.runId,
      createdAt: new Date().toISOString(),
    }
    this.entries.push(entry)
    return entry
  }

  getSummary(userId: string, days = 30): CostSummary {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const relevant = this.entries.filter(
      (e) => e.userId === userId && new Date(e.createdAt) >= cutoff,
    )

    const byProvider: Record<string, { costUsd: number; runs: number }> = {}
    const byModel: Record<string, { costUsd: number; runs: number }> = {}

    for (const entry of relevant) {
      if (!byProvider[entry.provider]) byProvider[entry.provider] = { costUsd: 0, runs: 0 }
      byProvider[entry.provider].costUsd += entry.estimatedCostUsd
      byProvider[entry.provider].runs += 1

      if (!byModel[entry.model]) byModel[entry.model] = { costUsd: 0, runs: 0 }
      byModel[entry.model].costUsd += entry.estimatedCostUsd
      byModel[entry.model].runs += 1
    }

    return {
      totalCostUsd: relevant.reduce((sum, e) => sum + e.estimatedCostUsd, 0),
      totalInputTokens: relevant.reduce((sum, e) => sum + e.inputTokens, 0),
      totalOutputTokens: relevant.reduce((sum, e) => sum + e.outputTokens, 0),
      totalRuns: relevant.length,
      byProvider,
      byModel,
      period: {
        from: cutoff.toISOString(),
        to: new Date().toISOString(),
      },
    }
  }

  getHistory(userId: string, limit = 100): CostEntry[] {
    return this.entries
      .filter((e) => e.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  }
}
