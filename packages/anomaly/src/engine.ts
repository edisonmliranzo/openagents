export interface MetricPoint {
  timestamp: number
  value: number
}

export interface AnomalyConfig {
  sensitivity: number
  windowSize: number
  threshold: number
}

export interface AnomalyResult {
  isAnomaly: boolean
  score: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  messages: string[]
  expectedValue?: number
  deviation?: number
}

export interface AlertConfig {
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  value: number
  threshold: number
  timestamp: number
}

export class AnomalyDetector {
  private history: MetricPoint[] = []
  private config: AnomalyConfig

  constructor(config: Partial<AnomalyConfig> = {}) {
    this.config = {
      sensitivity: config.sensitivity ?? 2.0,
      windowSize: config.windowSize ?? 100,
      threshold: config.threshold ?? 0.95,
    }
  }

  addMetric(point: MetricPoint): void {
    this.history.push(point)
    if (this.history.length > this.config.windowSize * 2) {
      this.history.shift()
    }
  }

  async detect(currentValue: number): Promise<AnomalyResult> {
    if (this.history.length < 10) {
      return {
        isAnomaly: false,
        score: 0,
        severity: 'low',
        messages: [],
      }
    }

    const recentHistory = this.history.slice(-this.config.windowSize)
    const values = recentHistory.map((p) => p.value)

    const mean = this.calculateMean(values)
    const stdDev = this.calculateStdDev(values, mean)
    const zScore = stdDev > 0 ? (currentValue - mean) / stdDev : 0

    const score = Math.abs(zScore) / this.config.sensitivity
    const isAnomaly = score > this.config.threshold

    let severity: AnomalyResult['severity'] = 'low'
    const messages: string[] = []

    if (isAnomaly) {
      if (score > 0.95) {
        severity = 'critical'
        messages.push(
          `Critical anomaly detected: value ${currentValue} is ${zScore.toFixed(2)} standard deviations from mean`,
        )
      } else if (score > 0.85) {
        severity = 'high'
        messages.push(`High anomaly detected: value deviates significantly from normal pattern`)
      } else if (score > 0.75) {
        severity = 'medium'
        messages.push(`Moderate anomaly detected: value outside expected range`)
      } else {
        severity = 'low'
        messages.push(`Minor anomaly detected: value slightly elevated`)
      }

      messages.push(
        `Expected range: ${(mean - 2 * stdDev).toFixed(2)} - ${(mean + 2 * stdDev).toFixed(2)}`,
      )
      messages.push(`Current value: ${currentValue.toFixed(2)}, Mean: ${mean.toFixed(2)}`)
    }

    return {
      isAnomaly,
      score: Math.min(score, 1.0),
      severity,
      messages,
      expectedValue: mean,
      deviation: currentValue - mean,
    }
  }

  async detectMultiple(values: number[]): Promise<AnomalyResult[]> {
    return Promise.all(values.map((v) => this.detect(v)))
  }

  generateAlert(result: AnomalyResult, metricName: string): AlertConfig | null {
    if (!result.isAnomaly) {
      return null
    }

    return {
      severity: result.severity,
      message: `Anomaly in ${metricName}: ${result.messages.join('; ')}`,
      value: result.deviation || 0,
      threshold: this.config.threshold,
      timestamp: Date.now(),
    }
  }

  private calculateMean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  private calculateStdDev(values: number[], mean: number): number {
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2))
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length
    return Math.sqrt(variance)
  }

  reset(): void {
    this.history = []
  }

  getHistory(): MetricPoint[] {
    return [...this.history]
  }
}

export interface ZScoreConfig {
  threshold?: number
  windowSize?: number
}

export class ZScoreDetector {
  private config: ZScoreConfig
  private values: number[] = []

  constructor(config: ZScoreConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 3.0,
      windowSize: config.windowSize ?? 100,
    }
  }

  add(value: number): void {
    this.values.push(value)
    if (this.values.length > (this.config.windowSize || 100)) {
      this.values.shift()
    }
  }

  detect(value: number): { isAnomaly: boolean; zScore: number; pValue?: number } {
    if (this.values.length < 10) {
      return { isAnomaly: false, zScore: 0 }
    }

    const mean = this.calculateMean(this.values)
    const stdDev = this.calculateStdDev(this.values, mean)
    const zScore = stdDev > 0 ? (value - mean) / stdDev : 0
    const isAnomaly = Math.abs(zScore) > (this.config.threshold || 3.0)

    return {
      isAnomaly,
      zScore,
    }
  }

  private calculateMean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  private calculateStdDev(values: number[], mean: number): number {
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2))
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length
    return Math.sqrt(variance)
  }
}

export function createAnomalyDetector(config?: Partial<AnomalyConfig>): AnomalyDetector {
  return new AnomalyDetector(config)
}
