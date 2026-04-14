export interface DocEntry {
  id: string
  action: string
  result: unknown
  timestamp: string
  tags: string[]
}

export class SelfDocumentationEngine {
  private entries: DocEntry[] = []
  private maxEntries: number = 1000

  record(action: string, result: unknown, tags: string[] = []): void {
    this.entries.push({
      id: this.generateId(),
      action,
      result,
      timestamp: new Date().toISOString(),
      tags,
    })

    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }
  }

  generateDocs(): string {
    const lines: string[] = ['# Agent Documentation', '']

    const actions = this.groupByAction()

    for (const [action, entries] of Object.entries(actions)) {
      lines.push(`## ${action}`)
      lines.push('')

      for (const entry of entries.slice(0, 5)) {
        lines.push(`- ${entry.timestamp}: ${JSON.stringify(entry.result).slice(0, 100)}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  private groupByAction(): Record<string, DocEntry[]> {
    const groups: Record<string, DocEntry[]> = {}

    for (const entry of this.entries) {
      if (!groups[entry.action]) {
        groups[entry.action] = []
      }
      groups[entry.action].push(entry)
    }

    return groups
  }

  getSummary(): { totalActions: number; uniqueActions: number; lastActivity: string } {
    const actions = new Set(this.entries.map((e) => e.action))

    return {
      totalActions: this.entries.length,
      uniqueActions: actions.size,
      lastActivity: this.entries[this.entries.length - 1]?.timestamp || 'Never',
    }
  }
}

export function createSelfDocumentationEngine(): SelfDocumentationEngine {
  return new SelfDocumentationEngine()
}
