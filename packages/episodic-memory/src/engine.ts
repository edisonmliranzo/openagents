export interface Episode {
  id: string
  timestamp: string
  task: string
  context: Record<string, unknown>
  actions: Action[]
  outcome: 'success' | 'failure' | 'partial'
  learnings: string[]
  embedding?: number[]
}

export interface Action {
  type: string
  params: Record<string, unknown>
  result?: unknown
  duration?: number
}

export interface EpisodicMemoryConfig {
  maxEpisodes: number
  similarityThreshold: number
}

export class EpisodicMemorySystem {
  private episodes: Episode[] = []
  private config: EpisodicMemoryConfig

  constructor(config: Partial<EpisodicMemoryConfig> = {}) {
    this.config = {
      maxEpisodes: 1000,
      similarityThreshold: 0.7,
      ...config,
    }
  }

  async addEpisode(episode: Omit<Episode, 'id' | 'timestamp'>): Promise<Episode> {
    const fullEpisode: Episode = {
      ...episode,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    }

    this.episodes.push(fullEpisode)

    if (this.episodes.length > this.config.maxEpisodes) {
      this.episodes.shift()
    }

    return fullEpisode
  }

  async retrieve(task: string, limit: number = 5): Promise<Episode[]> {
    const taskWords = task.toLowerCase().split(/\s+/)

    const scored = this.episodes.map((ep) => {
      const epWords = ep.task.toLowerCase().split(/\s+/)
      const matches = taskWords.filter((w) => epWords.includes(w))
      const similarity = matches.length / Math.max(taskWords.length, epWords.length)
      return { episode: ep, similarity }
    })

    return scored
      .filter((s) => s.similarity >= this.config.similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((s) => s.episode)
  }

  async retrieveSimilar(episode: Episode, limit: number = 3): Promise<Episode[]> {
    const embeddings = await this.getEmbedding(episode.task)
    if (!embeddings) return []

    return this.episodes
      .filter((e) => e.id !== episode.id && e.embedding)
      .map((e) => ({
        episode: e,
        similarity: this.cosineSimilarity(embeddings, e.embedding!),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((s) => s.episode)
  }

  async extractLearnings(episodeId: string): Promise<string[]> {
    const episode = this.episodes.find((e) => e.id === episodeId)
    if (!episode) return []

    const learnings: string[] = []

    for (const action of episode.actions) {
      if (action.result) {
        learnings.push(`Action ${action.type}: ${JSON.stringify(action.result)}`)
      }
    }

    if (episode.outcome === 'success') {
      learnings.push('Task completed successfully - consider this pattern for similar tasks')
    } else if (episode.outcome === 'failure') {
      learnings.push('Task failed - avoid this approach in similar contexts')
    }

    return learnings
  }

  getRecentEpisodes(limit: number = 10): Episode[] {
    return this.episodes.slice(-limit).reverse()
  }

  getOutcomes(): { success: number; failure: number; partial: number } {
    return {
      success: this.episodes.filter((e) => e.outcome === 'success').length,
      failure: this.episodes.filter((e) => e.outcome === 'failure').length,
      partial: this.episodes.filter((e) => e.outcome === 'partial').length,
    }
  }

  private async getEmbedding(text: string): Promise<number[] | null> {
    return text.split('').map((c) => c.charCodeAt(0) / 255)
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 0.0001)
  }

  private generateId(): string {
    return `ep-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

export function createEpisodicMemory(config?: Partial<EpisodicMemoryConfig>): EpisodicMemorySystem {
  return new EpisodicMemorySystem(config)
}
