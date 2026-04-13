export interface ScalerConfig {
  minReplicas: number
  maxReplicas: number
  targetUtilization: number
  scaleUpThreshold: number
  scaleDownThreshold: number
  scaleUpCooldown: number
  scaleDownCooldown: number
}

export interface MetricData {
  timestamp: number
  cpu: number
  memory: number
  requests: number
  latency: number
}

export interface ScaleDecision {
  action: 'scale_up' | 'scale_down' | 'maintain'
  replicas: number
  reason: string
  confidence: number
}

export class PredictiveScaler {
  private config: ScalerConfig
  private history: MetricData[] = []
  private lastScaleUp: number = 0
  private lastScaleDown: number = 0

  constructor(config: Partial<ScalerConfig> = {}) {
    this.config = {
      minReplicas: config.minReplicas ?? 1,
      maxReplicas: config.maxReplicas ?? 10,
      targetUtilization: config.targetUtilization ?? 70,
      scaleUpThreshold: config.scaleUpThreshold ?? 80,
      scaleDownThreshold: config.scaleDownThreshold ?? 30,
      scaleUpCooldown: config.scaleUpCooldown ?? 60,
      scaleDownCooldown: config.scaleDownCooldown ?? 300,
    }
  }

  addMetric(metric: MetricData): void {
    this.history.push(metric)
    if (this.history.length > 1000) {
      this.history.shift()
    }
  }

  async decide(currentReplicas: number): Promise<ScaleDecision> {
    const now = Date.now()
    const recentMetrics = this.history.slice(-30)

    if (recentMetrics.length < 5) {
      return {
        action: 'maintain',
        replicas: currentReplicas,
        reason: 'Insufficient metrics',
        confidence: 0.5,
      }
    }

    const avgCpu = this.average(recentMetrics.map((m) => m.cpu))
    const avgMemory = this.average(recentMetrics.map((m) => m.memory))
    const avgRequests = this.average(recentMetrics.map((m) => m.requests))
    const avgLatency = this.average(recentMetrics.map((m) => m.latency))

    const utilization = Math.max(avgCpu, avgMemory)
    const timeSinceScaleUp = (now - this.lastScaleUp) / 1000
    const timeSinceScaleDown = (now - this.lastScaleDown) / 1000

    if (
      utilization > this.config.scaleUpThreshold &&
      timeSinceScaleUp > this.config.scaleUpCooldown
    ) {
      const newReplicas = Math.min(currentReplicas + 1, this.config.maxReplicas)
      return {
        action: 'scale_up',
        replicas: newReplicas,
        reason: `High utilization: ${utilization.toFixed(1)}% (CPU: ${avgCpu.toFixed(1)}%, Memory: ${avgMemory.toFixed(1)}%)`,
        confidence: 0.9,
      }
    }

    if (
      utilization < this.config.scaleDownThreshold &&
      timeSinceScaleDown > this.config.scaleDownCooldown &&
      currentReplicas > this.config.minReplicas
    ) {
      const newReplicas = Math.max(currentReplicas - 1, this.config.minReplicas)
      return {
        action: 'scale_down',
        replicas: newReplicas,
        reason: `Low utilization: ${utilization.toFixed(1)}%`,
        confidence: 0.8,
      }
    }

    const trend = this.calculateTrend(recentMetrics)
    if (trend > 0.5 && utilization > 60 && timeSinceScaleUp > this.config.scaleUpCooldown) {
      const newReplicas = Math.min(currentReplicas + 1, this.config.maxReplicas)
      return {
        action: 'scale_up',
        replicas: newReplicas,
        reason: `Increasing load trend detected (slope: ${trend.toFixed(2)})`,
        confidence: 0.7,
      }
    }

    return {
      action: 'maintain',
      replicas: currentReplicas,
      reason: `Utilization stable at ${utilization.toFixed(1)}%`,
      confidence: 0.9,
    }
  }

  async predictLoad(minutesAhead: number = 10): Promise<number> {
    const recentMetrics = this.history.slice(-60)
    if (recentMetrics.length < 10) {
      return 0
    }

    const trend = this.linearRegression(recentMetrics)
    const projected = trend.slope * minutesAhead * 60 + trend.intercept

    return Math.max(0, projected)
  }

  private average(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  private calculateTrend(metrics: MetricData[]): number {
    const x = metrics.map((_, i) => i)
    const y = metrics.map((m) => m.requests)

    const avgX = this.average(x)
    const avgY = this.average(y)

    let numerator = 0
    let denominator = 0

    for (let i = 0; i < x.length; i++) {
      numerator += (x[i] - avgX) * (y[i] - avgY)
      denominator += Math.pow(x[i] - avgX, 2)
    }

    return denominator > 0 ? numerator / denominator : 0
  }

  private linearRegression(metrics: MetricData[]): { slope: number; intercept: number } {
    const x = metrics.map((_, i) => i)
    const y = metrics.map((m) => m.requests)

    const n = x.length
    const avgX = this.average(x)
    const avgY = this.average(y)

    let numerator = 0
    let denominator = 0

    for (let i = 0; i < n; i++) {
      numerator += (x[i] - avgX) * (y[i] - avgY)
      denominator += Math.pow(x[i] - avgX, 2)
    }

    const slope = denominator > 0 ? numerator / denominator : 0
    const intercept = avgY - slope * avgX

    return { slope, intercept }
  }
}

export function createScaler(config?: Partial<ScalerConfig>): PredictiveScaler {
  return new PredictiveScaler(config)
}
