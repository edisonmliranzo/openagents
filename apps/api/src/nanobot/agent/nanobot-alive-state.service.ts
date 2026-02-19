import { Injectable } from '@nestjs/common'
import type { NanobotAliveState, NanobotRoleDecision, NanobotThoughtMode } from '../types'

interface AlivePatch {
  activeGoal?: string | null
  thoughtMode?: NanobotThoughtMode
  confidence?: number
  intentionQueue?: string[]
  waitingReason?: string | null
  lastRoleDecision?: NanobotRoleDecision | null
}

@Injectable()
export class NanobotAliveStateService {
  private stateByUser = new Map<string, NanobotAliveState>()

  getForUser(userId: string): NanobotAliveState {
    const current = this.stateByUser.get(userId)
    if (current) return current
    const initial = this.defaultState()
    this.stateByUser.set(userId, initial)
    return initial
  }

  patchForUser(userId: string, patch: AlivePatch): NanobotAliveState {
    const current = this.getForUser(userId)
    const next: NanobotAliveState = {
      ...current,
      ...patch,
      confidence: patch.confidence != null ? this.clamp01(patch.confidence) : current.confidence,
      updatedAt: new Date().toISOString(),
    }
    this.stateByUser.set(userId, next)
    return next
  }

  markWaiting(userId: string, reason: string, mode: NanobotThoughtMode = 'act') {
    return this.patchForUser(userId, {
      waitingReason: reason,
      thoughtMode: mode,
    })
  }

  markDone(userId: string) {
    return this.patchForUser(userId, {
      waitingReason: null,
      thoughtMode: 'reflect',
      intentionQueue: [],
    })
  }

  private defaultState(): NanobotAliveState {
    return {
      activeGoal: null,
      thoughtMode: 'reflect',
      confidence: 0.5,
      intentionQueue: [],
      waitingReason: null,
      lastRoleDecision: null,
      updatedAt: new Date().toISOString(),
    }
  }

  private clamp01(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
  }
}

