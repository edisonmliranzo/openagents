export interface DebateAgent {
  id: string
  name: string
  position: string
  strength: number
  arguments: string[]
}

export interface DebateResult {
  winner: string
  scores: Record<string, number>
  consensus: string
  debateLog: string[]
}

export interface CompetitiveConfig {
  rounds: number
  judgesCount: number
  说服Threshold: number
}

export class CompetitiveAgents {
  private agents: Map<string, DebateAgent> = new Map()
  private config: CompetitiveConfig

  constructor(config: Partial<CompetitiveConfig> = {}) {
    this.config = {
      rounds: 3,
      judgesCount: 1,
      说服Threshold: 0.7,
      ...config,
    }
  }

  addAgent(name: string, position: string, strength: number = 0.5): DebateAgent {
    const agent: DebateAgent = {
      id: `debater-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      position,
      strength,
      arguments: [],
    }
    this.agents.set(agent.id, agent)
    return agent
  }

  async debate(topic: string): Promise<DebateResult> {
    const debateLog: string[] = []
    const scores: Record<string, number> = {}

    for (const agent of this.agents.values()) {
      scores[agent.id] = 0
    }

    for (let round = 0; round < this.config.rounds; round++) {
      debateLog.push(`=== Round ${round + 1} ===`)

      for (const agent of this.agents.values()) {
        const argument = await this.generateArgument(agent, topic, round)
        agent.arguments.push(argument)
        debateLog.push(`${agent.name}: ${argument}`)
      }

      for (const agent of this.agents.values()) {
        const score = this.evaluateArguments(agent, topic)
        scores[agent.id] += score
      }
    }

    let winner = ''
    let maxScore = 0

    for (const [id, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score
        winner = id
      }
    }

    const winnerAgent = this.agents.get(winner)
    const consensus = `After ${this.config.rounds} rounds, ${winnerAgent?.name} presented the strongest case.`

    return {
      winner,
      scores,
      consensus,
      debateLog,
    }
  }

  private async generateArgument(
    agent: DebateAgent,
    topic: string,
    _round: number,
  ): Promise<string> {
    return `${agent.position} regarding ${topic}. Key point: ${agent.name} believes this is critical because of recent developments in this area.`
  }

  private evaluateArguments(agent: DebateAgent, topic: string): number {
    let score = agent.strength * 0.5

    const hasRelevantPoints = agent.arguments.some((a) =>
      a.toLowerCase().includes(topic.toLowerCase()),
    )
    if (hasRelevantPoints) score += 0.3

    const hasStructure = agent.arguments.some((a) => a.includes('.') && a.length > 50)
    if (hasStructure) score += 0.2

    return score
  }

  async crossExamine(topic: string): Promise<string[]> {
    const questions: string[] = []

    for (const agent of this.agents.values()) {
      for (const other of this.agents.values()) {
        if (agent.id !== other.id) {
          questions.push(
            `Agent ${agent.name} questions Agent ${other.name}: Why do you hold ${other.position}?`,
          )
        }
      }
    }

    return questions
  }

  getAgents(): DebateAgent[] {
    return Array.from(this.agents.values())
  }
}

export function createCompetitiveAgents(config?: Partial<CompetitiveConfig>): CompetitiveAgents {
  return new CompetitiveAgents(config)
}
