import { Injectable, Logger } from '@nestjs/common'
export interface StreamingChunk {
  type: 'text' | 'token' | 'tool_progress'
  content: string
  timestamp?: string
}

export interface StreamingConfig {
  chunkSize: 'token' | 'sentence' | 'block'
  bufferMs: number
  includeToolProgress: boolean
  includeThinkingSteps: boolean
}

export interface StreamingToolProgress {
  toolName: string
  status: 'started' | 'running' | 'completed' | 'failed'
  percentComplete?: number
  message?: string
  timestamp?: string
}

export interface StreamingSession {
  id: string
  conversationId: string
  status: 'active' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  config: StreamingConfig
  chunks: StreamingChunk[]
  toolProgress: StreamingToolProgress[]
}

export interface StreamEmitter {
  emit(event: string, data: unknown): void
}

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name)
  private sessions = new Map<string, StreamingSession>()

  createSession(conversationId: string, config?: Partial<StreamingConfig>): StreamingSession {
    const session: StreamingSession = {
      id: `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      status: 'active',
      startedAt: new Date().toISOString(),
      config: {
        chunkSize: config?.chunkSize ?? 'token',
        bufferMs: config?.bufferMs ?? 50,
        includeToolProgress: config?.includeToolProgress ?? true,
        includeThinkingSteps: config?.includeThinkingSteps ?? false,
      },
      chunks: [],
      toolProgress: [],
    }
    this.sessions.set(session.id, session)
    return session
  }

  pushChunk(sessionId: string, chunk: StreamingChunk, emitter?: StreamEmitter): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'active') return

    session.chunks.push(chunk)

    if (emitter) {
      emitter.emit('stream_chunk', {
        sessionId,
        chunk: {
          type: chunk.type,
          content: chunk.content,
          index: session.chunks.length - 1,
          timestamp: chunk.timestamp ?? new Date().toISOString(),
        },
      })
    }
  }

  pushToolProgress(
    sessionId: string,
    progress: StreamingToolProgress,
    emitter?: StreamEmitter,
  ): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'active') return

    session.toolProgress.push(progress)

    if (emitter && session.config.includeToolProgress) {
      emitter.emit('tool_progress', {
        sessionId,
        progress: {
          toolName: progress.toolName,
          status: progress.status,
          percentComplete: progress.percentComplete,
          message: progress.message,
          timestamp: progress.timestamp ?? new Date().toISOString(),
        },
      })
    }
  }

  completeSession(sessionId: string): StreamingSession | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    session.status = 'completed'
    session.completedAt = new Date().toISOString()
    return session
  }

  getSession(sessionId: string): StreamingSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  closeSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  getFullContent(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    if (!session) return ''
    return session.chunks
      .filter((c) => c.type === 'text' || c.type === 'token')
      .map((c) => c.content)
      .join('')
  }

  listActiveSessions(conversationId?: string): StreamingSession[] {
    const sessions = Array.from(this.sessions.values()).filter(
      (s) => s.status === 'active',
    )
    if (conversationId) {
      return sessions.filter((s) => s.conversationId === conversationId)
    }
    return sessions
  }
}
