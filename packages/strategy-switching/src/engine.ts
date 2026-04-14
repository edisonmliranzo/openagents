export type Strategy = 'direct' | 'exploratory' | 'conservative' | 'creative'

export interface StrategyConfig {
  name: Strategy
  maxIterations: number
  riskTolerance: number
}

export class StrategySwitchingAgent {
  private currentStrategy: Strategy = 'direct'
  private history: Array<{ strategy: Strategy; success: boolean }> = []

  switchStrategy(newStrategy: Strategy): void {
    this.currentStrategy = newStrategy
  }

  getStrategy(): Strategy {
    return this.currentStrategy
  }

  async executeWithStrategy(
    task: string,
    executor: (strategy: Strategy) => Promise<unknown>,
  ): Promise<unknown> {
    const result = await executor(this.currentStrategy)

    this.history.push({
      strategy: this.currentStrategy,
      success: result !== null && result !== undefined,
    })

    if (this.history.length >= 3) {
      this.autoSwitch()
    }

    return result
  }

  private autoSwitch(): void {
    const recent = this.history.slice(-3)
    const failed = recent.filter((h) => !h.success).length

    if (failed >= 2) {
      const strategies: Strategy[] = ['direct', 'exploratory', 'conservative', 'creative']
      const currentIndex = strategies.indexOf(this.currentStrategy)
      const nextIndex = (currentIndex + 1) % strategies.length
      this.currentStrategy = strategies[nextIndex]
    }
  }

  getStrategyRecommendations(): StrategyConfig[] {
    return [
      { name: 'direct', maxIterations: 3, riskTolerance: 0.3 },
      { name: 'exploratory', maxIterations: 5, riskTolerance: 0.6 },
      { name: 'conservative', maxIterations: 2, riskTolerance: 0.1 },
      { name: 'creative', maxIterations: 4, riskTolerance: 0.8 },
    ]
  }
}

export function createStrategySwitchingAgent(): StrategySwitchingAgent {
  return new StrategySwitchingAgent()
}
