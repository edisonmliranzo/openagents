export interface ReflectionResult {
  score: number
  issues: string[]
  suggestions: string[]
  confidence: number
}

export interface SelfReflectionConfig {
  strictness: number
  maxIterations: number
}

export class SelfReflectionEngine {
  private config: SelfReflectionConfig

  constructor(config: Partial<SelfReflectionConfig> = {}) {
    this.config = {
      strictness: 0.7,
      maxIterations: 3,
      ...config,
    }
  }

  async reflect(
    input: { task: string; output: string; context?: string },
    criticPrompt: string,
  ): Promise<ReflectionResult> {
    const issues: string[] = []
    const suggestions: string[] = []
    let confidence = 1.0

    if (input.output.length < 10) {
      issues.push('Output is suspiciously short')
      confidence -= 0.3
    }

    const hasStructure = this.checkStructure(input.output)
    if (!hasStructure) {
      issues.push('Missing clear structure or organization')
      confidence -= 0.2
    }

    const isRelevant = this.checkRelevance(input.task, input.output)
    if (!isRelevant) {
      issues.push('Output does not address the task')
      confidence -= 0.4
    }

    const hasCompleteness = this.checkCompleteness(input.output)
    if (!hasCompleteness) {
      suggestions.push('Consider adding more detail or examples')
      confidence -= 0.1
    }

    if (confidence > this.config.strictness) {
      suggestions.push('Output meets quality threshold')
    }

    return {
      score: confidence,
      issues,
      suggestions,
      confidence,
    }
  }

  async improve(input: { task: string; output: string }, iteration: number): Promise<string> {
    if (iteration >= this.config.maxIterations) {
      return input.output
    }

    const reflection = await this.reflect({ task: input.task, output: input.output }, '')

    let improved = input.output

    for (const issue of reflection.issues) {
      if (issue.includes('short')) {
        improved = `${improved}\n\nAdditional context to expand on the above.`
      }
      if (issue.includes('structure')) {
        improved = `Summary:\n${improved}\n\nDetailed Analysis:\n${improved}`
      }
    }

    return improved
  }

  async evaluateOutput(output: string, criteria: string[]): Promise<Record<string, number>> {
    const scores: Record<string, number> = {}

    for (const criterion of criteria) {
      switch (criterion) {
        case 'accuracy':
          scores[criterion] = output.includes('fact') || output.includes('based') ? 0.8 : 0.5
          break
        case 'completeness':
          scores[criterion] = output.length > 100 ? 0.9 : 0.5
          break
        case 'clarity':
          scores[criterion] = output.split('.').length > 2 ? 0.8 : 0.6
          break
        default:
          scores[criterion] = 0.7
      }
    }

    return scores
  }

  private checkStructure(output: string): boolean {
    const patterns = ['\n\n', '. ', ': ', '1.', '2.', '- ']
    return patterns.some((p) => output.includes(p))
  }

  private checkRelevance(task: string, output: string): boolean {
    const taskWords = task.toLowerCase().split(/\s+/)
    const outputLower = output.toLowerCase()
    const matches = taskWords.filter((w) => outputLower.includes(w) && w.length > 3)
    return matches.length > taskWords.length * 0.3
  }

  private checkCompleteness(output: string): boolean {
    return output.length > 50 && output.split(' ').length > 20
  }
}

export function createSelfReflectionEngine(
  config?: Partial<SelfReflectionConfig>,
): SelfReflectionEngine {
  return new SelfReflectionEngine(config)
}
