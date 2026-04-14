export interface LearningRecord {
  timestamp: string
  interaction: string
  feedback?: 'positive' | 'negative' | 'neutral'
  context: Record<string, unknown>
}

export interface PreferenceModel {
  communicationStyle: 'formal' | 'casual' | 'mixed'
  responseLength: 'short' | 'medium' | 'long'
  technicalLevel: 'beginner' | 'intermediate' | 'expert'
  preferredFormats: string[]
}

export interface ContinuousLearningConfig {
  learningRate: number
  decayFactor: number
  feedbackWeight: number
}

export class ContinuousLearningAgent {
  private records: LearningRecord[] = []
  private preferenceModel: PreferenceModel
  private config: ContinuousLearningConfig

  constructor(config: Partial<ContinuousLearningConfig> = {}) {
    this.config = {
      learningRate: 0.1,
      decayFactor: 0.95,
      feedbackWeight: 2.0,
      ...config,
    }
    this.preferenceModel = {
      communicationStyle: 'mixed',
      responseLength: 'medium',
      technicalLevel: 'intermediate',
      preferredFormats: ['text'],
    }
  }

  record(interaction: string, context: Record<string, unknown> = {}): void {
    this.records.push({
      timestamp: new Date().toISOString(),
      interaction,
      context,
    })

    if (this.records.length > 1000) {
      this.records.shift()
    }
  }

  recordFeedback(
    interaction: string,
    feedback: 'positive' | 'negative' | 'neutral',
    context: Record<string, unknown> = {},
  ): void {
    this.records.push({
      timestamp: new Date().toISOString(),
      interaction,
      feedback,
      context,
    })
    this.updateModel()
  }

  getModel(): PreferenceModel {
    this.updateModel()
    return { ...this.preferenceModel }
  }

  adaptResponse(response: string): string {
    const model = this.getModel()

    if (model.responseLength === 'short') {
      const sentences = response.split('. ')
      return sentences.slice(0, 2).join('. ') + '.'
    }

    if (model.responseLength === 'long') {
      return `${response}\n\nAdditional context and elaboration on the above points.`
    }

    return response
  }

  suggestFormat(preferredResponse: string): string {
    const model = this.getModel()

    if (model.preferredFormats.includes('bullet')) {
      const lines = preferredResponse.split('. ')
      return lines.map((l) => `- ${l.trim()}`).join('\n')
    }

    if (model.preferredFormats.includes('numbered')) {
      const lines = preferredResponse.split('. ')
      return lines.map((l, i) => `${i + 1}. ${l.trim()}`).join('\n')
    }

    return preferredResponse
  }

  getSuccessRate(): number {
    const withFeedback = this.records.filter((r) => r.feedback)
    if (withFeedback.length === 0) return 0.5

    const positive = withFeedback.filter((r) => r.feedback === 'positive').length
    return positive / withFeedback.length
  }

  getRecentTrends(): { interactions: number; positiveRate: number } {
    const recent = this.records.slice(-50)
    const withFeedback = recent.filter((r) => r.feedback)

    return {
      interactions: recent.length,
      positiveRate:
        withFeedback.length > 0
          ? withFeedback.filter((r) => r.feedback === 'positive').length / withFeedback.length
          : 0.5,
    }
  }

  private updateModel(): void {
    const recentRecords = this.records.slice(-100)

    const formalCount = recentRecords.filter(
      (r) => r.interaction.includes('therefore') || r.interaction.includes('consequently'),
    ).length

    if (formalCount > recentRecords.length * 0.3) {
      this.preferenceModel.communicationStyle = 'formal'
    } else if (formalCount < recentRecords.length * 0.1) {
      this.preferenceModel.communicationStyle = 'casual'
    }

    const avgLength =
      recentRecords.reduce((sum, r) => sum + r.interaction.length, 0) / recentRecords.length
    if (avgLength < 100) {
      this.preferenceModel.responseLength = 'short'
    } else if (avgLength > 500) {
      this.preferenceModel.responseLength = 'long'
    }

    const technicalTerms = ['API', 'function', 'algorithm', 'implementation']
    const technicalCount = recentRecords.filter((r) =>
      technicalTerms.some((t) => r.interaction.includes(t)),
    ).length

    if (technicalCount > recentRecords.length * 0.4) {
      this.preferenceModel.technicalLevel = 'expert'
    } else if (technicalCount < recentRecords.length * 0.1) {
      this.preferenceModel.technicalLevel = 'beginner'
    }
  }
}

export function createContinuousLearningAgent(
  config?: Partial<ContinuousLearningConfig>,
): ContinuousLearningAgent {
  return new ContinuousLearningAgent(config)
}
