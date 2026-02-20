import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { NanobotSessionService } from '../session/nanobot-session.service'
import { NanobotAliveStateService } from './nanobot-alive-state.service'
import { NanobotHeartbeatService } from '../heartbeat/nanobot-heartbeat.service'
import { NanobotBusService } from '../bus/nanobot-bus.service'
import type { NanobotPresenceTickResult } from '../types'

@Injectable()
export class NanobotPresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NanobotPresenceService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private sessions: NanobotSessionService,
    private alive: NanobotAliveStateService,
    private heartbeat: NanobotHeartbeatService,
    private bus: NanobotBusService,
  ) {}

  onModuleInit() {
    const raw = Number.parseInt(process.env.NANOBOT_PRESENCE_INTERVAL_MS ?? '60000', 10)
    const intervalMs = Number.isFinite(raw) ? Math.max(15_000, raw) : 60_000
    if (intervalMs <= 0) return

    this.timer = setInterval(() => {
      void this.tickAll('auto')
    }, intervalMs)
    this.timer.unref?.()
    this.logger.log(`Presence loop started (${intervalMs}ms interval).`)
  }

  onModuleDestroy() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  async tick(userId: string, source: 'manual' | 'auto' = 'manual'): Promise<NanobotPresenceTickResult> {
    const sessions = this.sessions.listForUser(userId)
    const activeSessions = sessions.filter((session) => session.status !== 'done' && session.status !== 'failed')

    const actions: string[] = []
    if (activeSessions.length > 0) {
      const top = activeSessions[0]
      this.alive.patchForUser(userId, {
        thoughtMode: 'reflect',
        waitingReason: null,
        intentionQueue: [
          `Monitor active session ${top.conversationId.slice(0, 10)}`,
          'Check for pending approvals and blocked steps',
          'Prepare next concise action',
        ],
      })
      actions.push(`tracked ${activeSessions.length} active session(s)`)
    } else {
      this.alive.patchForUser(userId, {
        thoughtMode: 'reflect',
        waitingReason: null,
        intentionQueue: ['No active sessions. Stand by for next task.'],
      })
      actions.push('no active sessions')
    }

    const hb = this.heartbeat.tick(userId)
    this.bus.publish('run.event', {
      source: 'nanobot.presence',
      userId,
      mode: source,
      activeSessions: activeSessions.length,
      actions,
    })

    return {
      userId,
      tickedAt: hb.tickedAt,
      source,
      activeSessions: activeSessions.length,
      actions,
    }
  }

  async tickAll(source: 'manual' | 'auto' = 'auto') {
    const users = this.sessions.listActiveUsers(12 * 60)
    const results: NanobotPresenceTickResult[] = []
    for (const userId of users) {
      results.push(await this.tick(userId, source))
    }
    return {
      tickedAt: new Date().toISOString(),
      source,
      users: results,
    }
  }
}

