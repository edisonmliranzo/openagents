export interface Suggestion {
  id: string
  type: 'action' | 'information' | 'correction'
  message: string
  confidence: number
  trigger: string
  timestamp: string
}

export interface UserContext {
  recentTasks: string[]
  currentGoal?: string
  frustration?: number
}

export class ProactiveSuggestionsEngine {
  private suggestions: Suggestion[] = []
  private context: UserContext

  constructor() {
    this.context = { recentTasks: [] }
  }

  async generate(context: UserContext): Promise<Suggestion[]> {
    this.context = context
    const suggestions: Suggestion[] = []

    if (context.recentTasks.length > 0) {
      const lastTask = context.recentTasks[context.recentTasks.length - 1]
      suggestions.push(this.suggestFollowUp(lastTask))
    }

    if ((context.frustration || 0) > 0.7) {
      suggestions.push({
        id: this.generateId(),
        type: 'correction',
        message: 'Would you like me to try a different approach?',
        confidence: 0.9,
        trigger: 'high_frustration',
        timestamp: new Date().toISOString(),
      })
    }

    return suggestions
  }

  private suggestFollowUp(task: string): Suggestion {
    if (task.includes('debug')) {
      return {
        id: this.generateId(),
        type: 'action',
        message: 'Want me to run automated tests to identify the issue?',
        confidence: 0.8,
        trigger: 'debug_completed',
        timestamp: new Date().toISOString(),
      }
    }

    return {
      id: this.generateId(),
      type: 'information',
      message: 'Based on your recent activity, here are some useful shortcuts.',
      confidence: 0.6,
      trigger: 'routine',
      timestamp: new Date().toISOString(),
    }
  }

  updateContext(task: string): void {
    this.context.recentTasks.push(task)
    if (this.context.recentTasks.length > 10) {
      this.context.recentTasks.shift()
    }
  }

  dismissSuggestion(id: string): void {
    this.suggestions = this.suggestions.filter((s) => s.id !== id)
  }

  private generateId(): string {
    return `sug-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

export function createProactiveSuggestionsEngine(): ProactiveSuggestionsEngine {
  return new ProactiveSuggestionsEngine()
}
