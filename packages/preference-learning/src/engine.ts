export interface UserPreference {
  key: string
  value: unknown
  confidence: number
  source: 'explicit' | 'implicit' | 'derived'
  lastUpdated: string
}

export interface PreferenceLearningConfig {
  explorationRate: number
  decayRate: number
  inferenceThreshold: number
}

export class PreferenceLearningEngine {
  private preferences: Map<string, UserPreference> = new Map()
  private config: PreferenceLearningConfig

  constructor(config: Partial<PreferenceLearningConfig> = {}) {
    this.config = {
      explorationRate: 0.2,
      decayRate: 0.01,
      inferenceThreshold: 0.7,
      ...config,
    }
  }

  learnFromAction(action: string, outcome: unknown): void {
    const existing = this.preferences.get(action)
    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + this.config.explorationRate)
      existing.value = outcome
      existing.lastUpdated = new Date().toISOString()
    } else {
      this.preferences.set(action, {
        key: action,
        value: outcome,
        confidence: 0.5,
        source: 'implicit',
        lastUpdated: new Date().toISOString(),
      })
    }
  }

  learnFromFeedback(
    key: string,
    value: unknown,
    feedback: 'positive' | 'negative' | 'neutral',
  ): void {
    const weight = feedback === 'positive' ? 0.3 : feedback === 'negative' ? -0.2 : 0.1

    const existing = this.preferences.get(key)
    if (existing) {
      existing.confidence = Math.min(1, Math.max(0, existing.confidence + weight))
      existing.value = value
      existing.lastUpdated = new Date().toISOString()
    } else {
      this.preferences.set(key, {
        key,
        value,
        confidence: 0.5 + weight,
        source: 'explicit',
        lastUpdated: new Date().toISOString(),
      })
    }
  }

  inferPreference(context: string): UserPreference | null {
    const words = context.toLowerCase().split(/\s+/)
    let bestMatch: UserPreference | null = null

    for (const pref of this.preferences.values()) {
      const prefWords = pref.key.toLowerCase().split(/\s+/)
      const overlap = words.filter((w) => prefWords.includes(w)).length

      if (overlap >= words.length * 0.5 && pref.confidence >= this.config.inferenceThreshold) {
        if (!bestMatch || pref.confidence > bestMatch.confidence) {
          bestMatch = pref
        }
      }
    }

    return bestMatch
  }

  getPreference(key: string): UserPreference | undefined {
    return this.preferences.get(key)
  }

  getAllPreferences(): UserPreference[] {
    return Array.from(this.preferences.values())
  }

  getHighConfidencePreferences(minConfidence: number = 0.7): UserPreference[] {
    return Array.from(this.preferences.values())
      .filter((p) => p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
  }

  decay(): void {
    for (const pref of this.preferences.values()) {
      pref.confidence = Math.max(0, pref.confidence - this.config.decayRate)
    }
  }
}

export function createPreferenceLearningEngine(
  config?: Partial<PreferenceLearningConfig>,
): PreferenceLearningEngine {
  return new PreferenceLearningEngine(config)
}
