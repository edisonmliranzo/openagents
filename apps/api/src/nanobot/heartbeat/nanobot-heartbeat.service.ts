import { Injectable, Logger } from '@nestjs/common'
import { NotificationsService } from '../../notifications/notifications.service'
import { MemoryService } from '../../memory/memory.service'
import { NanobotBusService } from '../bus/nanobot-bus.service'
import { NanobotAliveStateService } from '../agent/nanobot-alive-state.service'
import { NanobotSessionService } from '../session/nanobot-session.service'
import type { NanobotHeartbeatRecoveryResult, NanobotHeartbeatStatus } from '../types'

const DEFAULT_MISSED_HEARTBEAT_MS = 3 * 60 * 1000

@Injectable()
export class NanobotHeartbeatService {
  private readonly logger = new Logger(NanobotHeartbeatService.name)
  private readonly lastTickByUser = new Map<string, number>()
  private readonly stateByUser = new Map<string, NanobotHeartbeatStatus>()

  constructor(
    private bus: NanobotBusService,
    private sessions: NanobotSessionService,
    private alive: NanobotAliveStateService,
    private notifications: NotificationsService,
    private memory: MemoryService,
  ) {}

  getStatus(userId: string): NanobotHeartbeatStatus {
    const existing = this.stateByUser.get(userId)
    if (existing) return existing
    const initial: NanobotHeartbeatStatus = {
      lastTickAt: null,
      lastMissedAt: null,
      lastRecoveryAt: null,
      missedCount: 0,
      recoveryCount: 0,
    }
    this.stateByUser.set(userId, initial)
    return initial
  }

  async tick(userId: string, source: 'manual' | 'auto' = 'manual') {
    const now = Date.now()
    const staleMs = this.resolveMissedHeartbeatMs()
    const previousTick = this.lastTickByUser.get(userId)
    const status = this.getStatus(userId)
    let recovery: NanobotHeartbeatRecoveryResult | null = null

    if (previousTick && now - previousTick > staleMs) {
      recovery = await this.recoverFromMissedHeartbeat(userId, now - previousTick)
    }

    const nightlyCuration = await this.memory.maybeRunNightlyCuration(userId)

    const tickedAt = new Date(now).toISOString()
    this.lastTickByUser.set(userId, now)
    this.stateByUser.set(userId, {
      ...status,
      lastTickAt: tickedAt,
    })

    const payload = {
      userId,
      tickedAt,
      source,
      recovery,
      nightlyCurated: Boolean(nightlyCuration),
    }
    this.bus.publish('heartbeat.tick', payload)

    if (nightlyCuration) {
      const { source: curationSource, ...curationRest } = nightlyCuration
      this.bus.publish('run.event', {
        source: 'nanobot.memory.curator',
        userId,
        mode: 'nightly',
        curationSource,
        ...curationRest,
      })
    }

    return payload
  }

  private async recoverFromMissedHeartbeat(userId: string, staleMs: number): Promise<NanobotHeartbeatRecoveryResult> {
    const status = this.getStatus(userId)
    const nowIso = new Date().toISOString()
    const actions: string[] = []

    const sessions = this.sessions.listForUser(userId)
    const staleThreshold = Date.now() - Math.max(staleMs, this.resolveMissedHeartbeatMs())
    const staleSessions = sessions.filter((session) => {
      if (session.status === 'done' || session.status === 'failed') return false
      const updatedAt = new Date(session.updatedAt).getTime()
      return Number.isFinite(updatedAt) && updatedAt <= staleThreshold
    })

    for (const session of staleSessions) {
      this.sessions.setStatus(session.conversationId, 'failed')
    }
    actions.push(`self-check: ${staleSessions.length} stale session(s) quarantined`)

    this.alive.patchForUser(userId, {
      activeGoal: 'Recover runtime after missed heartbeat',
      thoughtMode: 'act',
      taskType: 'ops',
      thinkingDepth: 'balanced',
      urgency: 'high',
      waitingReason: null,
      intentionQueue: [
        'Rebuild runtime liveness state',
        'Resume presence monitoring loop',
        'Notify user of recovery actions',
      ],
    })
    actions.push('restart-loop: alive state reset and monitoring queue restored')

    let curated = false
    try {
      await this.memory.curateNightly(userId, 'heartbeat-recovery')
      curated = true
      actions.push('memory-curator: completed')
    } catch (error) {
      actions.push(`memory-curator: failed (${this.safeError(error)})`)
    }

    let notified = false
    try {
      await this.notifications.create(
        userId,
        'Agent heartbeat recovered',
        `Detected missed heartbeat (${Math.round(staleMs / 1000)}s). Ran self-check and restarted monitoring loop.`,
        'warning',
      )
      notified = true
      actions.push('notify: sent')
    } catch (error) {
      this.logger.warn(`Failed to create heartbeat recovery notification for ${userId}: ${this.safeError(error)}`)
      actions.push('notify: failed')
    }

    this.stateByUser.set(userId, {
      ...status,
      lastMissedAt: nowIso,
      lastRecoveryAt: nowIso,
      missedCount: status.missedCount + 1,
      recoveryCount: status.recoveryCount + 1,
    })

    this.bus.publish('run.event', {
      source: 'nanobot.heartbeat.recovery',
      userId,
      staleMs,
      staleSessions: staleSessions.length,
      actions,
      curated,
      notified,
      recoveredAt: nowIso,
    })

    return {
      recovered: true,
      staleMs,
      staleSessions: staleSessions.length,
      actions,
      notified,
      curated,
      recoveredAt: nowIso,
    }
  }

  private resolveMissedHeartbeatMs() {
    const parsed = Number.parseInt(process.env.NANOBOT_HEARTBEAT_MISSED_MS ?? `${DEFAULT_MISSED_HEARTBEAT_MS}`, 10)
    if (!Number.isFinite(parsed)) return DEFAULT_MISSED_HEARTBEAT_MS
    return Math.max(30_000, parsed)
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'unknown error'
  }
}
