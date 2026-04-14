export interface ElectionCandidate {
  id: string
  name: string
  proposal: string
  votes: number
  confidence: number
}

export interface ElectionResult {
  winner: ElectionCandidate
  candidates: ElectionCandidate[]
  votesCast: number
  timestamp: string
}

export interface ElectionConfig {
  quorum: number
  votingPeriod: number
  majorityThreshold: number
}

export class AgentElections {
  private candidates: Map<string, ElectionCandidate> = new Map()
  private votes: Map<string, Set<string>> = new Map()
  private config: ElectionConfig

  constructor(config: Partial<ElectionConfig> = {}) {
    this.config = {
      quorum: 3,
      votingPeriod: 60000,
      majorityThreshold: 0.5,
      ...config,
    }
  }

  addCandidate(name: string, proposal: string): ElectionCandidate {
    const candidate: ElectionCandidate = {
      id: `candidate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      proposal,
      votes: 0,
      confidence: 0.5,
    }
    this.candidates.set(candidate.id, candidate)
    this.votes.set(candidate.id, new Set())
    return candidate
  }

  castVote(voterId: string, candidateId: string): void {
    for (const [id, voters] of this.votes) {
      voters.delete(voterId)
      const candidate = this.candidates.get(id)
      if (candidate) candidate.votes = voters.size
    }

    const voters = this.votes.get(candidateId)
    if (voters) {
      voters.add(voterId)
      const candidate = this.candidates.get(candidateId)
      if (candidate) candidate.votes = voters.size
    }
  }

  async holdElection(): Promise<ElectionResult> {
    await this.simulateVoting()

    const sorted = Array.from(this.candidates.values()).sort((a, b) => b.votes - a.votes)

    const totalVotes = sorted.reduce((sum, c) => sum + c.votes, 0)

    for (const candidate of sorted) {
      candidate.confidence = totalVotes > 0 ? candidate.votes / totalVotes : 0.5
    }

    const winner = sorted[0]

    return {
      winner,
      candidates: sorted,
      votesCast: totalVotes,
      timestamp: new Date().toISOString(),
    }
  }

  async delegateVote(toAgentId: string, candidates: string[]): Promise<string> {
    const randomCandidate = candidates[Math.floor(Math.random() * candidates.length)]
    this.castVote(toAgentId, randomCandidate)
    return randomCandidate
  }

  tallyVotes(): Record<string, number> {
    const results: Record<string, number> = {}

    for (const [id, voters] of this.votes) {
      results[id] = voters.size
    }

    return results
  }

  hasQuorum(): boolean {
    const totalVotes = Array.from(this.votes.values()).reduce((sum, v) => sum + v.size, 0)
    return totalVotes >= this.config.quorum
  }

  declareWinner(): ElectionCandidate | null {
    if (!this.hasQuorum()) return null

    const sorted = Array.from(this.candidates.values()).sort((a, b) => b.votes - a.votes)

    const topVotes = sorted[0]?.votes || 0
    const secondVotes = sorted[1]?.votes || 0

    if (topVotes > secondVotes && topVotes > 0) {
      return sorted[0]
    }

    return null
  }

  private async simulateVoting(): Promise<void> {
    for (const candidate of this.candidates.values()) {
      const simulatedVoters = Math.floor(Math.random() * 10)
      const voters = this.votes.get(candidate.id) || new Set()

      for (let i = 0; i < simulatedVoters; i++) {
        voters.add(`voter-${i}`)
      }

      this.votes.set(candidate.id, voters)
      candidate.votes = voters.size
    }
  }

  getCandidates(): ElectionCandidate[] {
    return Array.from(this.candidates.values())
  }

  resetElection(): void {
    for (const candidate of this.candidates.values()) {
      candidate.votes = 0
      candidate.confidence = 0.5
    }
    for (const voters of this.votes.values()) {
      voters.clear()
    }
  }
}

export function createAgentElections(config?: Partial<ElectionConfig>): AgentElections {
  return new AgentElections(config)
}
