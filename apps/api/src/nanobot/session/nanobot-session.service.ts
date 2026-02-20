import { Injectable } from '@nestjs/common'
import type { NanobotSessionState } from '../types'

@Injectable()
export class NanobotSessionService {
  private sessions = new Map<string, NanobotSessionState>()
  private readonly maxSessions = 500

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
    this.prune()
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
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listAll() {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listActiveUsers(maxAgeMinutes = 6 * 60) {
    const cutoff = Date.now() - Math.max(1, maxAgeMinutes) * 60 * 1000
    const users = new Set<string>()
    for (const session of this.sessions.values()) {
      const ts = new Date(session.updatedAt).getTime()
      if (!Number.isFinite(ts) || ts < cutoff) continue
      users.add(session.userId)
    }
    return [...users]
  }

  private prune() {
    if (this.sessions.size <= this.maxSessions) return
    const oldest = [...this.sessions.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    const overflow = oldest.length - this.maxSessions
    for (let index = 0; index < overflow; index += 1) {
      this.sessions.delete(oldest[index].conversationId)
    }
  }
}
