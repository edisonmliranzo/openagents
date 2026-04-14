export interface ManagerAgent {
  id: string
  name: string
  subordinates: string[]
  tasks: string[]
  status: 'idle' | 'planning' | 'delegating' | 'reviewing'
}

export interface SpecialistAgent {
  id: string
  name: string
  specialty: string
  capabilities: string[]
  status: 'idle' | 'working' | 'completed'
  result?: unknown
}

export interface HierarchyConfig {
  maxDepth: number
  maxSubordinates: number
  delegationThreshold: number
}

export class HierarchicalOrchestrator {
  private manager: ManagerAgent | null = null
  private specialists: Map<string, SpecialistAgent> = new Map()
  private config: HierarchyConfig

  constructor(config: Partial<HierarchyConfig> = {}) {
    this.config = {
      maxDepth: 3,
      maxSubordinates: 5,
      delegationThreshold: 0.7,
      ...config,
    }
  }

  setManager(name: string): ManagerAgent {
    this.manager = {
      id: `manager-${Date.now()}`,
      name,
      subordinates: [],
      tasks: [],
      status: 'idle',
    }
    return this.manager
  }

  addSpecialist(name: string, specialty: string, capabilities: string[]): SpecialistAgent {
    const specialist: SpecialistAgent = {
      id: `specialist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      specialty,
      capabilities,
      status: 'idle',
    }

    this.specialists.set(specialist.id, specialist)

    if (this.manager && this.manager.subordinates.length < this.config.maxSubordinates) {
      this.manager.subordinates.push(specialist.id)
    }

    return specialist
  }

  async orchestrate(
    task: string,
    execute: (specialist: SpecialistAgent, task: string) => Promise<unknown>,
  ): Promise<unknown | null> {
    if (!this.manager) return null

    this.manager.status = 'planning'

    const bestSpecialist = this.selectSpecialist(task)

    if (!bestSpecialist) {
      this.manager.status = 'idle'
      return null
    }

    this.manager.status = 'delegating'
    this.manager.tasks.push(task)

    bestSpecialist.status = 'working'
    const result = await execute(bestSpecialist, task)
    bestSpecialist.result = result
    bestSpecialist.status = 'completed'

    this.manager.status = 'reviewing'

    const confidence = this.evaluateResult(result)
    if (confidence < this.config.delegationThreshold) {
      const alternative = this.selectAlternativeSpecialist(bestSpecialist)
      if (alternative) {
        const retryResult = await execute(alternative, task)
        alternative.result = retryResult
        return retryResult
      }
    }

    this.manager.status = 'idle'
    return result
  }

  private selectSpecialist(task: string): SpecialistAgent | null {
    const taskLower = task.toLowerCase()

    let best: SpecialistAgent | null = null
    let bestScore = 0

    for (const specialist of this.specialists.values()) {
      const matchCount = specialist.capabilities.filter((c) =>
        taskLower.includes(c.toLowerCase()),
      ).length

      const score = matchCount / specialist.capabilities.length

      if (score > bestScore) {
        bestScore = score
        best = specialist
      }
    }

    return best
  }

  private selectAlternativeSpecialist(exclude: SpecialistAgent): SpecialistAgent | null {
    for (const specialist of this.specialists.values()) {
      if (specialist.id !== exclude.id && specialist.status === 'idle') {
        return specialist
      }
    }
    return null
  }

  private evaluateResult(result: unknown): number {
    if (result === null || result === undefined) return 0
    if (typeof result === 'string' && result.length > 0) return 0.7
    if (typeof result === 'object') return 0.8
    return 0.5
  }

  getManager(): ManagerAgent | null {
    return this.manager
  }

  getSpecialists(): SpecialistAgent[] {
    return Array.from(this.specialists.values())
  }

  getHierarchy(): { manager: ManagerAgent | null; specialists: SpecialistAgent[] } {
    return {
      manager: this.manager,
      specialists: Array.from(this.specialists.values()),
    }
  }
}

export function createHierarchicalOrchestrator(
  config?: Partial<HierarchyConfig>,
): HierarchicalOrchestrator {
  return new HierarchicalOrchestrator(config)
}
