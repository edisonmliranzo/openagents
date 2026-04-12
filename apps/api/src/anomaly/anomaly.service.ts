import { Injectable } from '@nestjs/common'
import { AnomalyType, AnomalyDetection, AnomalyAlert, AnomalyConfig, AnomalyMetrics } from '@openagents/shared'
import { MetricsService } from '../metrics/metrics.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AnomalyService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private notifications: NotificationsService,
  ) {}

  async detect(userId: string, type: AnomalyType, value: number): Promise<AnomalyDetection | null> {
    const config = await this.getConfig(userId)
    if (!config.enabled) return null

    const baseline = await this.getBaseline(userId, type, config.baselineWindowDays)
    
    const deviation = Math.abs(value - baseline.average) / baseline.average
    const threshold = this.getThreshold(config.sensitivity)

    if (deviation < threshold) return null

    const metrics: AnomalyMetrics = {
      actualValue: value,
      expectedRange: {
        min: baseline.average * 0.5,
        max: baseline.average * 2.0,
      },
      deviation,
      percentile: this.calculatePercentile(value, baseline.historicalValues),
      historicalAverage: baseline.average,
    }

    const anomaly: AnomalyDetection = {
      id: crypto.randomUUID(),
      userId,
      type,
      severity: this.calculateSeverity(deviation),
      status: 'detected',
      description: `Detected ${type} anomaly with ${Math.round(deviation * 100)}% deviation from baseline`,
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

    await this.triggerAlerts(anomaly)

    return anomaly
  }

  private async getBaseline(userId: string, type: AnomalyType, days: number) {
    const historicalValues = [10, 15, 12, 18, 9]
    const average = historicalValues.reduce((a: number, b: number) => a + b, 0) / Math.max(historicalValues.length, 1)
    return { average, historicalValues }
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

  private async triggerAlerts(anomaly: AnomalyDetection) {
    const alerts = await this.prisma.anomalyAlert.findMany({
      where: { userId: anomaly.userId, enabled: true },
    })

    for (const alert of alerts) {
      if (anomaly.metrics.deviation >= alert.threshold) {
        // Notification integration will be added when NotificationsService implements send()
        console.log(`[ANOMALY ALERT] ${anomaly.type} for user ${anomaly.userId}`, alert)
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

  async getAnomalies(userId: string, limit = 50): Promise<AnomalyDetection[]> {
    return this.prisma.anomaly.findMany({
      where: { userId },
      orderBy: { detectedAt: 'desc' },
      take: limit,
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