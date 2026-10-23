import { Injectable, Logger } from '@nestjs/common'
import { AnomalyType, AnomalyDetection, AnomalyConfig, AnomalyMetrics } from '@openagents/shared'
import { MetricsService } from '../metrics/metrics.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'
import { PrismaService } from '../prisma/prisma.service'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_METRIC_ROWS = 50_000

interface MeasureSpec {
  where?: Record<string, unknown>
  count?: boolean
  sum?: 'costUsd' | 'tokensUsed'
  avg?: 'durationMs'
  max?: 'durationMs'
  /** Smallest absolute difference that is meaningful for this measure. */
  minDelta: number
}

/**
 * How each anomaly type is measured from the real MetricLog history.
 * Every measure is a per-day aggregate so days can be compared with days.
 */
const MEASURES: Record<AnomalyType, MeasureSpec> = {
  excessive_tool_calls: { where: { metricType: 'tool_call' }, count: true, minDelta: 1 },
  cost_spike: { sum: 'costUsd', minDelta: 0.01 },
  repeated_failures: { where: { action: 'failed' }, count: true, minDelta: 1 },
  unusual_token_usage: { sum: 'tokensUsed', minDelta: 100 },
  approval_rate_drop: { where: { metricType: 'approval', action: 'denied' }, count: true, minDelta: 1 },
  response_time_degradation: { where: { metricType: 'agent_run' }, avg: 'durationMs', minDelta: 100 },
  auth_anomaly: { where: { metricType: 'auth' }, count: true, minDelta: 1 },
  resource_exhaustion: { where: { metricType: 'agent_run' }, max: 'durationMs', minDelta: 100 },
}

function startOfUtcDay(date: Date, dayOffset = 0) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  return new Date(start.getTime() + dayOffset * DAY_MS)
}

@Injectable()
export class AnomalyService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  async detect(userId: string, type: AnomalyType, value?: number): Promise<AnomalyDetection | null> {
    const config = await this.getConfig(userId)
    if (!config.enabled) return null

    const series = await this.getDailySeries(userId, type, config.baselineWindowDays)
    // We need at least one historical day plus the day being compared.
    if (series.length < 2) return null

    const historicalValues = series.slice(0, -1)
    const baseline = await this.getBaseline(userId, type, historicalValues)
    if (!baseline) return null

    const actualValue =
      typeof value === 'number' && Number.isFinite(value) ? value : series[series.length - 1]

    const deviation = Math.abs(actualValue - baseline.average) / baseline.average
    const threshold = this.getThreshold(config.sensitivity)

    if (deviation < threshold) return null

    // A relative spike on a near-zero baseline is noise, not an anomaly.
    if (Math.abs(actualValue - baseline.average) < this.getMinDelta(type)) return null

    const metrics: AnomalyMetrics = {
      actualValue,
      expectedRange: {
        min: Math.min(...historicalValues),
        max: Math.max(...historicalValues),
      },
      deviation,
      percentile: this.calculatePercentile(actualValue, historicalValues),
      historicalAverage: baseline.average,
    }

    const anomaly: AnomalyDetection = {
      id: crypto.randomUUID(),
      userId,
      type,
      severity: this.calculateSeverity(deviation),
      status: 'detected',
      description: `Detected ${type.replace(/_/g, ' ')} anomaly: ${this.formatNumber(actualValue)} against a historical average of ${this.formatNumber(baseline.average)} (${Math.round(deviation * 100)}% deviation)`,
      metrics,
      recommendations: this.getRecommendations(type),
      detectedAt: new Date().toISOString(),
    }

    await this.prisma.anomaly.create({
      data: {
        id: anomaly.id,
        userId: anomaly.userId,
        type: anomaly.type,
        severity: anomaly.severity,
        status: anomaly.status,
        description: anomaly.description,
        metrics: JSON.parse(JSON.stringify(anomaly.metrics)),
        recommendations: JSON.parse(JSON.stringify(anomaly.recommendations)),
        detectedAt: anomaly.detectedAt,
      },
    })

    await this.triggerAlerts(anomaly, config)

    return anomaly
  }

  /**
   * Aggregates the user's real MetricLog history into one value per completed
   * calendar day. Today is excluded because it is only partially elapsed and
   * would produce false positives.
   */
  private async getDailySeries(userId: string, type: AnomalyType, days: number): Promise<number[]> {
    const window = Math.max(2, Math.min(Number(days) || 7, 30))
    const now = new Date()
    const since = startOfUtcDay(now, -window)
    const until = startOfUtcDay(now)

    const spec = MEASURES[type] ?? ({ count: true, minDelta: 1 } satisfies MeasureSpec)

    const rows = await this.prisma.metricLog
      .findMany({
        where: {
          userId,
          ...(spec.where ?? {}),
          createdAt: { gte: since, lt: until },
        },
        select: { createdAt: true, costUsd: true, tokensUsed: true, durationMs: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_METRIC_ROWS,
      })
      .catch(() => [] as Array<{ createdAt: Date; costUsd: number | null; tokensUsed: number | null; durationMs: number | null }>)

    const buckets = new Array<number>(window).fill(0)
    const counts = new Array<number>(window).fill(0)
    const sums = new Array<number>(window).fill(0)
    const maxima = new Array<number>(window).fill(0)

    for (const row of rows) {
      const index = Math.floor((row.createdAt.getTime() - since.getTime()) / DAY_MS)
      if (index < 0 || index >= window) continue

      if (spec.count) {
        buckets[index] += 1
      }
      if (spec.sum) {
        sums[index] += Number(row[spec.sum] ?? 0)
      }
      if (spec.avg) {
        const value = Number(row[spec.avg] ?? 0)
        if (value > 0) {
          sums[index] += value
          counts[index] += 1
        }
      }
      if (spec.max) {
        const value = Number(row[spec.max] ?? 0)
        if (value > maxima[index]) maxima[index] = value
      }
    }

    for (let i = 0; i < window; i += 1) {
      if (spec.sum) buckets[i] = sums[i]
      else if (spec.avg) buckets[i] = counts[i] > 0 ? sums[i] / counts[i] : 0
      else if (spec.max) buckets[i] = maxima[i]
    }

    return buckets
  }

  private async getBaseline(
    userId: string,
    type: AnomalyType,
    historicalValues: number[],
  ): Promise<{ average: number } | null> {
    if (historicalValues.length === 0) return null

    const total = historicalValues.reduce((a: number, b: number) => a + b, 0)
    const average = total / historicalValues.length

    // Without a real historical signal there is nothing to compare against.
    if (!Number.isFinite(average) || average <= 0) return null

    return { average }
  }

  private getMinDelta(type: AnomalyType): number {
    return MEASURES[type]?.minDelta ?? 1
  }

  private getThreshold(sensitivity: string): number {
    switch (sensitivity) {
      case 'low': return 1.5
      case 'medium': return 1.0
      case 'high': return 0.5
      default: return 1.0
    }
  }

  private calculateSeverity(deviation: number): AnomalyDetection['severity'] {
    if (deviation > 3.0) return 'critical'
    if (deviation > 2.0) return 'high'
    if (deviation > 1.0) return 'medium'
    return 'low'
  }

  private calculatePercentile(value: number, history: number[]): number {
    if (history.length === 0) return 50
    const above = history.filter(v => v < value).length
    return Math.round((above / history.length) * 100)
  }

  private formatNumber(value: number): string {
    if (!Number.isFinite(value)) return 'n/a'
    if (value >= 1000) return value.toFixed(0)
    if (value >= 1) return value.toFixed(2)
    return value.toFixed(4)
  }

  private getRecommendations(type: AnomalyType): string[] {
    const recommendations: Record<AnomalyType, string[]> = {
      excessive_tool_calls: ['Review agent configuration', 'Check for infinite loops', 'Enable rate limiting'],
      cost_spike: ['Review budget limits', 'Check for expensive model usage', 'Enable cost alerts'],
      repeated_failures: ['Check tool availability', 'Review error logs', 'Add fallback logic'],
      unusual_token_usage: ['Review prompt changes', 'Check for context leaks', 'Optimize prompt size'],
      approval_rate_drop: ['Review policy changes', 'Check for unauthorized actions', 'Audit recent activity'],
      response_time_degradation: ['Check system load', 'Review recent deployments', 'Scale resources'],
      auth_anomaly: ['Revoke suspicious sessions', 'Enable 2FA', 'Review access logs'],
      resource_exhaustion: ['Scale up resources', 'Optimize memory usage', 'Add rate limits'],
    }
    return recommendations[type] || ['Investigate further']
  }

  private async triggerAlerts(anomaly: AnomalyDetection, config: AnomalyConfig) {
    const alerts = await this.prisma.anomalyAlert.findMany({
      where: { userId: anomaly.userId, enabled: true },
    })

    const allowedChannels = Array.isArray(config.alertChannels) ? config.alertChannels : []

    for (const alert of alerts) {
      if (anomaly.metrics.deviation < alert.threshold) continue
      if (allowedChannels.length > 0 && !allowedChannels.includes(alert.channel)) continue

      const title = `Anomaly: ${anomaly.type.replace(/_/g, ' ')}`
      const body = anomaly.description

      try {
        if (alert.channel === 'push') {
          await this.push.sendToUser(anomaly.userId, {
            title,
            body,
            url: '/control/usage',
          })
        } else {
          await this.notifications.create(
            anomaly.userId,
            title,
            body,
            anomaly.severity === 'critical' ? 'error' : 'warning',
          )
        }

        await this.prisma.anomalyAlert.update({
          where: { id: alert.id },
          data: { anomalyId: anomaly.id },
        })
      } catch (error: any) {
        console.error(
          `[ANOMALY ALERT] failed to deliver ${alert.channel} alert for user ${anomaly.userId}:`,
          error?.message ?? error,
        )
      }
    }
  }

  async getConfig(userId: string): Promise<AnomalyConfig> {
    const config = await this.prisma.anomalyConfig.findUnique({ where: { userId } })
    return config as unknown as AnomalyConfig || {
      userId,
      enabled: true,
      sensitivity: 'medium',
      alertChannels: ['in_app'],
      ignoredPatterns: [],
      baselineWindowDays: 7,
    }
  }

  async updateConfig(userId: string, config: Partial<AnomalyConfig>): Promise<AnomalyConfig> {
    return this.prisma.anomalyConfig.upsert({
      where: { userId },
      update: config,
      create: { userId, ...config } as any,
    }) as unknown as AnomalyConfig
  }

  async getAnomalies(userId: string, limit?: number): Promise<AnomalyDetection[]> {
    const parsed = Number(limit)
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 200) : 50
    return this.prisma.anomaly.findMany({
      where: { userId },
      orderBy: { detectedAt: 'desc' },
      take,
    }) as unknown as AnomalyDetection[]
  }

  async updateStatus(id: string, status: AnomalyDetection['status']): Promise<AnomalyDetection> {
    return this.prisma.anomaly.update({
      where: { id },
      data: {
        status,
        resolvedAt: status === 'resolved' ? new Date().toISOString() : null,
      },
    }) as unknown as AnomalyDetection
  }
}
