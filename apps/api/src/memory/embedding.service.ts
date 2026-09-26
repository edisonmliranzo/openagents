import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { embedText, type EmbeddingProvider } from '../agent/embeddings'

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    const raw = (this.config.get<string>('MEMORY_EMBEDDINGS') ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
  }

  async embed(text: string): Promise<{ vector: number[]; provider: EmbeddingProvider } | null> {
    if (!this.enabled) return null
    try {
      return await embedText(text, {
        openaiKey: this.config.get<string>('OPENAI_API_KEY') ?? undefined,
        ollamaBaseUrl: (this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434').trim(),
      })
    } catch (error: any) {
      this.logger.debug(`Embedding failed: ${error?.message ?? 'unknown'}`)
      return null
    }
  }

  serialize(vector: number[]): string {
    return JSON.stringify(vector)
  }
}
