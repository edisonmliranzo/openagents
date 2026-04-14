export interface FailurePattern {
  type: string
  occurrences: number
  lastOccurrence: string
  recoveryStrategy: string
  successRate: number
}

export interface SelfHealingConfig {
  maxRetries: number
  backoffBase: number
  timeout: number
}

export class SelfHealingAgent {
  private patterns: Map<string, FailurePattern> = new Map()
  private config: SelfHealingConfig

  constructor(config: Partial<SelfHealingConfig> = {}) {
    this.config = {
      maxRetries: 3,
      backoffBase: 2,
      timeout: 5000,
      ...config,
    }
  }

  async executeWithHealing(
    task: () => Promise<unknown>,
    context?: string,
  ): Promise<{ success: boolean; result?: unknown; healingAttempts?: number }> {
    let attempts = 0

    while (attempts < this.config.maxRetries) {
      try {
        const result = await this.withTimeout(task())
        return { success: true, result }
      } catch (error) {
        attempts++

        if (context) {
          const pattern = this.learnPattern(error, context)
          const recovery = this.getRecoveryStrategy(pattern)

          if (recovery && attempts < this.config.maxRetries) {
            await this.applyRecovery(recovery)
            continue
          }
        }

        if (attempts >= this.config.maxRetries) {
          return { success: false, healingAttempts: attempts }
        }
      }
    }

    return { success: false, healingAttempts: attempts }
  }

  private learnPattern(error: unknown, context: string): FailurePattern {
    const errorType = (error as Error)?.message || 'Unknown'

    const existing = this.patterns.get(errorType)
    if (existing) {
      existing.occurrences++
      existing.lastOccurrence = new Date().toISOString()
      return existing
    }

    const pattern: FailurePattern = {
      type: errorType,
      occurrences: 1,
      lastOccurrence: new Date().toISOString(),
      recoveryStrategy: this.inferRecoveryStrategy(errorType, context),
      successRate: 0.5,
    }

    this.patterns.set(errorType, pattern)
    return pattern
  }

  private inferRecoveryStrategy(errorType: string, context: string): string {
    if (errorType.includes('timeout')) return 'increase_timeout'
    if (errorType.includes('connection')) return 'retry_with_backoff'
    if (errorType.includes('memory')) return 'reduce_batch_size'
    if (errorType.includes('auth')) return 'refresh_credentials'
    return 'retry'
  }

  private getRecoveryStrategy(pattern: FailurePattern): string | null {
    if (pattern.successRate > 0.7) return null
    return pattern.recoveryStrategy
  }

  private async applyRecovery(strategy: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(this.config.backoffBase, 2)))
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Task timeout')), this.config.timeout),
      ),
    ])
  }

  getPatterns(): FailurePattern[] {
    return Array.from(this.patterns.values())
  }

  getReliableStrategies(): string[] {
    return Array.from(this.patterns.values())
      .filter((p) => p.successRate > 0.8)
      .map((p) => p.recoveryStrategy)
  }
}

export function createSelfHealingAgent(config?: Partial<SelfHealingConfig>): SelfHealingAgent {
  return new SelfHealingAgent(config)
}
