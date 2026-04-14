export interface MonitorRule {
  id: string
  condition: string
  action: string
  enabled: boolean
}

export interface MonitorEvent {
  type: string
  data: unknown
  timestamp: string
}

export class BackgroundMonitor {
  private rules: Map<string, MonitorRule> = new Map()
  private events: MonitorEvent[] = []
  private intervalId: ReturnType<typeof setInterval> | null = null

  addRule(condition: string, action: string): MonitorRule {
    const rule: MonitorRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      condition,
      action,
      enabled: true,
    }
    this.rules.set(rule.id, rule)
    return rule
  }

  start(intervalMs: number = 60000): void {
    this.intervalId = setInterval(() => {
      this.evaluateRules()
    }, intervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  recordEvent(type: string, data: unknown): void {
    this.events.push({
      type,
      data,
      timestamp: new Date().toISOString(),
    })

    if (this.events.length > 1000) {
      this.events.shift()
    }
  }

  private evaluateRules(): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue

      const matching = this.events.filter((e) => this.matchesCondition(rule.condition, e))

      if (matching.length > 0) {
        this.triggerAction(rule.action, matching)
      }
    }
  }

  private matchesCondition(condition: string, event: MonitorEvent): boolean {
    return event.type === condition || condition === '*'
  }

  private triggerAction(action: string, events: MonitorEvent[]): void {
    console.log(`Triggering action: ${action} for ${events.length} events`)
  }

  getRecentEvents(limit: number = 50): MonitorEvent[] {
    return this.events.slice(-limit)
  }

  getRules(): MonitorRule[] {
    return Array.from(this.rules.values())
  }
}

export function createBackgroundMonitor(): BackgroundMonitor {
  return new BackgroundMonitor()
}
