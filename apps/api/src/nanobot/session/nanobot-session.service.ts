import { Injectable } from '@nestjs/common'
import type { NanobotSessionState } from '../types'

@Injectable()
export class NanobotSessionService {
  private sessions = new Map<string, NanobotSessionState>()

  touch(conversationId: string, userId: string) {
    const existing = this.sessions.get(conversationId)
    const next: NanobotSessionState = {
      conversationId,
      userId,
      status: 'running',
      updatedAt: new Date().toISOString(),
      runCount: (existing?.runCount ?? 0) + 1,
    }
    this.sessions.set(conversationId, next)
    return next
  }

  setStatus(conversationId: string, status: NanobotSessionState['status']) {
    const existing = this.sessions.get(conversationId)
    if (!existing) return null
    const next = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    }
    this.sessions.set(conversationId, next)
    return next
  }

  get(conversationId: string) {
    return this.sessions.get(conversationId) ?? null
  }

  listForUser(userId: string) {
    return [...this.sessions.values()].filter((s) => s.userId === userId)
  }
}

