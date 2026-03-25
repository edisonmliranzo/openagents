import type {
  ApprovalMetrics,
  BudgetLimit,
  BudgetStatus,
  LogMetricInput,
  MetricLogEntry,
  MetricsQuery,
  MetricsSummary,
  SetBudgetLimitInput,
  UserMetrics,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

export interface MetricsSummaryQuery extends Pick<MetricsQuery, 'startDate' | 'endDate' | 'groupBy'> {}

export interface MetricsRangeQuery extends Pick<MetricsQuery, 'startDate' | 'endDate'> {}

interface RawBudgetLimit {
  id: string
  budgetType: string
  limitUsd: number
  alertAtUsd?: number | null
  currentSpentUsd: number
  remainingUsd?: number
  percentUsed?: number
  enabled?: boolean
  periodStart: string
  periodEnd: string
}

interface RawMetricLogEntry {
  id: string
  userId: string
  metricType: string
  action: string
  provider: string | null
  model: string | null
  durationMs: number | null
  tokensUsed: number | null
  costUsd: number | null
  conversationId: string | null
  toolName: string | null
  metadata: Record<string, unknown> | string | null | undefined
  createdAt: string
}

function buildQuery(query: Record<string, string | undefined>) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value?.trim()) {
      params.set(key, value.trim())
    }
  }

  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function parseMetadata(
  value: RawMetricLogEntry['metadata'],
): Record<string, unknown> | null {
  if (value == null) {
    return null
  }

  if (typeof value !== 'string') {
    return value
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function normalizeMetricLogEntry(entry: RawMetricLogEntry): MetricLogEntry {
  return {
    id: entry.id,
    userId: entry.userId,
    metricType: entry.metricType,
    action: entry.action,
    provider: entry.provider,
    model: entry.model,
    durationMs: entry.durationMs,
    tokensUsed: entry.tokensUsed,
    costUsd: entry.costUsd,
    conversationId: entry.conversationId,
    toolName: entry.toolName,
    metadata: parseMetadata(entry.metadata),
    createdAt: entry.createdAt,
  }
}

function normalizeBudgetLimit(entry: RawBudgetLimit): BudgetLimit {
  const limitUsd = Number(entry.limitUsd)
  const currentSpentUsd = Number(entry.currentSpentUsd)
  const remainingUsd = entry.remainingUsd ?? Math.max(0, limitUsd - currentSpentUsd)
  const percentUsed = entry.percentUsed ?? (limitUsd > 0
    ? Math.round((currentSpentUsd / limitUsd) * 100)
    : 0)

  return {
    id: entry.id,
    budgetType: entry.budgetType,
    limitUsd,
    alertAtUsd: entry.alertAtUsd ?? null,
    currentSpentUsd,
    remainingUsd,
    percentUsed,
    enabled: entry.enabled ?? true,
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
  }
}

function normalizeBudgetStatus(status: BudgetStatus): BudgetStatus {
  return {
    overBudget: status.overBudget,
    budgets: status.budgets.map((budget) => ({
      ...budget,
      alertAtUsd: budget.alertAtUsd ?? null,
    })),
  }
}

export function createMetricsApi(client: OpenAgentsClient) {
  return {
    summary: (query: MetricsSummaryQuery = {}) =>
      client.get<MetricsSummary>(`/api/v1/metrics/summary${buildQuery({
        startDate: query.startDate,
        endDate: query.endDate,
        groupBy: query.groupBy,
      })}`),

    user: (query: MetricsRangeQuery = {}) =>
      client.get<UserMetrics>(`/api/v1/metrics/user${buildQuery({
        startDate: query.startDate,
        endDate: query.endDate,
      })}`),

    approvals: (query: MetricsRangeQuery = {}) =>
      client.get<ApprovalMetrics>(`/api/v1/metrics/approvals${buildQuery({
        startDate: query.startDate,
        endDate: query.endDate,
      })}`),

    listBudgetLimits: () =>
      client.get<RawBudgetLimit[]>('/api/v1/metrics/budget').then((budgets) => budgets.map(normalizeBudgetLimit)),

    getBudgetStatus: () =>
      client.get<BudgetStatus>('/api/v1/metrics/budget/status').then(normalizeBudgetStatus),

    setBudgetLimit: (input: SetBudgetLimitInput) =>
      client.post<RawBudgetLimit>('/api/v1/metrics/budget', input).then(normalizeBudgetLimit),

    deleteBudgetLimit: (budgetType: string) =>
      client.delete<{ deleted: true }>(`/api/v1/metrics/budget/${encodeURIComponent(budgetType)}`),

    log: (input: LogMetricInput) =>
      client.post<RawMetricLogEntry>('/api/v1/metrics/log', input).then(normalizeMetricLogEntry),
  }
}
