export interface SwarmAgent {
  id: string
  name: string
  role: string
  status: 'idle' | 'working' | 'completed' | 'failed'
  contribution?: unknown
}

export interface SwarmTask {
  id: string
  description: string
  assignedAgent?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  result?: unknown
}

export interface SwarmConfig {
  maxAgents: number
  consensusThreshold: number
  timeout: number
}

export class AgentSwarm {
  private agents: Map<string, SwarmAgent> = new Map()
  private tasks: Map<string, SwarmTask> = []
  private config: SwarmConfig

  constructor(config: Partial<SwarmConfig> = {}) {
    this.config = {
      maxAgents: 10,
      consensusThreshold: 0.7,
      timeout: 30000,
      ...config,
    }
  }

  addAgent(name: string, role: string): SwarmAgent {
    const agent: SwarmAgent = {
      id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      role,
      status: 'idle',
    }
    this.agents.set(agent.id, agent)
    return agent
  }

  addTask(description: string): SwarmTask {
    const task: SwarmTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      description,
      status: 'pending',
    }
    this.tasks.push(task)
    return task
  }

  async executeTask(
    taskId: string,
    agentId: string,
    executor: () => Promise<unknown>,
  ): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId)
    const agent = this.agents.get(agentId)

    if (!task || !agent) return

    task.status = 'in_progress'
    task.assignedAgent = agentId
    agent.status = 'working'

    try {
      const result = await this.withTimeout(executor(), this.config.timeout)
      task.result = result
      task.status = 'completed'
      agent.contribution = result
      agent.status = 'completed'
    } catch {
      task.status = 'failed'
      agent.status = 'failed'
    }
  }

  async executeSwarm(
    task: string,
    executor: (agent: SwarmAgent, task: string) => Promise<unknown>,
  ): Promise<unknown[]> {
    const results: unknown[] = []

    const assignedAgents = Array.from(this.agents.values()).slice(0, this.config.maxAgents)

    const promises = assignedAgents.map(async (agent) => {
      await this.executeTask(this.addTask(`${task} [${agent.role}]`).id, agent.id, () =>
        executor(agent, task),
      )
      return agent.contribution
    })

    const outcomes = await Promise.allSettled(promises)

    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value)
      }
    }

    return results
  }

  async reachConsensus(evaluator: (results: unknown[]) => number): Promise<unknown> {
    const results: unknown[] = []

    for (const agent of this.agents.values()) {
      if (agent.contribution !== undefined) {
        results.push(agent.contribution)
      }
    }

    if (results.length === 0) return null

    const score = evaluator(results)

    if (score >= this.config.consensusThreshold) {
      return results[0]
    }

    return results.sort(() => Math.random() - 0.5)[0]
  }

  getAgentStatuses(): SwarmAgent[] {
    return Array.from(this.agents.values())
  }

  getTaskStatuses(): SwarmTask[] {
    return [...this.tasks]
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Task timeout')), ms)),
    ])
  }
}

export function createAgentSwarm(config?: Partial<SwarmConfig>): AgentSwarm {
  return new AgentSwarm(config)
}
