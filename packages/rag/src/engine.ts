export interface RagConfig {
  provider: 'pgvector' | 'pinecone' | 'weaviate'
  dimension?: number
}

export interface DocumentChunk {
  id: string
  content: string
  embedding: number[]
  metadata?: Record<string, unknown>
}

export interface SearchResult {
  id: string
  content: string
  score: number
  metadata?: Record<string, unknown>
}

export class RagEngine {
  private config: RagConfig

  constructor(config: RagConfig) {
    this.config = { dimension: 1536, ...config }
  }

  async embed(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to create embedding')
    }

    const data = (await response.json()) as { data?: Array<{ embedding: number[] }> }
    return data.data?.[0]?.embedding || []
  }

  async addChunk(chunk: DocumentChunk): Promise<void> {
    if (this.config.provider === 'pgvector') {
      await this.addPgVector(chunk)
    }
  }

  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    const queryEmbedding = await this.embed(query)

    if (this.config.provider === 'pgvector') {
      return await this.searchPgVector(queryEmbedding, topK)
    }

    return []
  }

  async similarity(a: number[], b: number[]): Promise<number> {
    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  private async addPgVector(_chunk: DocumentChunk): Promise<void> {
    // Implementation for pgvector would go here
  }

  private async searchPgVector(_embedding: number[], _topK: number): Promise<SearchResult[]> {
    return []
  }
}

export interface ChunkOptions {
  chunkSize?: number
  chunkOverlap?: number
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { chunkSize = 1000, chunkOverlap = 200 } = options
  const words = text.split(' ')
  const chunks: string[] = []

  for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ')
    if (chunk) chunks.push(chunk)
  }

  return chunks
}

export function createRagClient(config: RagConfig): RagEngine {
  return new RagEngine(config)
}
