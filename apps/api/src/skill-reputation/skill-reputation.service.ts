import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  RecordSkillReputationInput,
  SkillReputationEntry,
  SkillReputationEvent,
  SkillTrustBadge,
} from '@openagents/shared'
import { NanobotSkillsRegistry } from '../nanobot/agent/nanobot-skills.registry'

const SKILL_REPUTATION_FILE = 'SKILL_REPUTATION.json'
const STORE_VERSION = 1
const MAX_EVENTS_PER_USER = 20_000
const MAX_RETENTION_DAYS = 120

interface SkillReputationStoreFile {
  version: number
  events: SkillReputationEvent[]
}

@Injectable()
export class SkillReputationService {
  private readonly logger = new Logger(SkillReputationService.name)
  private readonly loadedUsers = new Set<string>()
  private readonly eventsByUser = new Map<string, SkillReputationEvent[]>()

  constructor(private skills: NanobotSkillsRegistry) {}

  async record(input: RecordSkillReputationInput & { userId: string }) {
    await this.ensureLoaded(input.userId)
    const userId = input.userId
    const source = this.optionalText(input.source)?.slice(0, 120) ?? 'unknown'
    const runId = this.optionalText(input.runId)?.slice(0, 120) ?? undefined
    const conversationId = this.optionalText(input.conversationId)?.slice(0, 120) ?? undefined

    const skillIds = [...new Set((input.skillIds ?? [])
      .map((skillId) => this.optionalText(skillId))
      .filter((skillId): skillId is string => Boolean(skillId)))]

    if (skillIds.length === 0) return []
    const now = new Date().toISOString()
    const nextEvents = [...(this.eventsByUser.get(userId) ?? [])]

    const created: SkillReputationEvent[] = []
    for (const skillId of skillIds) {
      const event: SkillReputationEvent = {
        id: randomUUID(),
        skillId: skillId.slice(0, 120),
        userId,
        success: Boolean(input.success),
        source,
        ...(runId ? { runId } : {}),
        ...(conversationId ? { conversationId } : {}),
        createdAt: now,
      }
      created.push(event)
      nextEvents.push(event)
    }

    this.eventsByUser.set(userId, this.retainEvents(nextEvents))
    await this.persist(userId)
    return created
  }

  async list(userId: string): Promise<SkillReputationEntry[]> {
    await this.ensureLoaded(userId)
    const skills = await this.skills.listForUser(userId)
    const events = this.eventsByUser.get(userId) ?? []
    const sevenDayCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000

    return skills
      .map((skill) => {
        const related = events.filter((event) => event.skillId === skill.id)
        const totalRuns = related.length
        const successRuns = related.filter((event) => event.success).length
        const failedRuns = totalRuns - successRuns
        const successRate = totalRuns > 0 ? successRuns / totalRuns : 0

        const sevenDay = related.filter((event) => {
          const ts = new Date(event.createdAt).getTime()
          return Number.isFinite(ts) && ts >= sevenDayCutoff
        })
        const sevenDaySuccess = sevenDay.filter((event) => event.success).length
        const sevenDaySuccessRate = sevenDay.length > 0 ? sevenDaySuccess / sevenDay.length : successRate

        const lastFailure = related
          .filter((event) => !event.success)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

        const score = this.computeScore(successRate, totalRuns)
        const badge = this.computeBadge(score, totalRuns, failedRuns)

        return {
          skillId: skill.id,
          title: skill.title,
          enabled: skill.enabled,
          totalRuns,
          successRuns,
          failedRuns,
          successRate: Number((successRate * 100).toFixed(2)),
          sevenDaySuccessRate: Number((sevenDaySuccessRate * 100).toFixed(2)),
          lastFailureAt: lastFailure?.createdAt ?? null,
          score,
          badge,
        } satisfies SkillReputationEntry
      })
      .sort((a, b) => b.score - a.score || b.totalRuns - a.totalRuns || a.title.localeCompare(b.title))
  }

  async history(userId: string, skillId: string, days = 30) {
    await this.ensureLoaded(userId)
    const safeDays = Math.max(1, Math.min(days, 180))
    const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1000
    return [...(this.eventsByUser.get(userId) ?? [])]
      .filter((event) => event.skillId === skillId)
      .filter((event) => {
        const ts = new Date(event.createdAt).getTime()
        return Number.isFinite(ts) && ts >= cutoff
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 500)
  }

  private computeScore(successRate: number, totalRuns: number) {
    const stabilityBoost = Math.min(totalRuns, 40) / 40
    const score = (successRate * 0.88 + stabilityBoost * 0.12) * 100
    return Math.round(Math.max(0, Math.min(100, score)))
  }

  private computeBadge(score: number, totalRuns: number, failedRuns: number): SkillTrustBadge {
    if (score >= 85 && totalRuns >= 10 && failedRuns <= Math.floor(totalRuns * 0.2)) return 'trusted'
    if (score >= 65 && totalRuns >= 3) return 'stable'
    return 'at_risk'
  }

  private retainEvents(events: SkillReputationEvent[]) {
    const cutoff = Date.now() - MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000
    return events
      .filter((event) => {
        const ts = new Date(event.createdAt).getTime()
        return Number.isFinite(ts) && ts >= cutoff
      })
      .slice(-MAX_EVENTS_PER_USER)
  }

  private async ensureLoaded(userId: string) {
    if (this.loadedUsers.has(userId)) return
    const store = await this.readStore(this.storeFilePath(userId))
    const events = (store.events ?? [])
      .filter((event) => event.userId === userId)
      .map((event) => this.sanitizeStoredEvent(event, userId))
      .filter((event): event is SkillReputationEvent => Boolean(event))
    this.eventsByUser.set(userId, this.retainEvents(events))
    this.loadedUsers.add(userId)
  }

  private sanitizeStoredEvent(event: SkillReputationEvent, userId: string): SkillReputationEvent | null {
    if (!event || typeof event !== 'object') return null
    const createdAt = this.normalizeIso(event.createdAt)
    const skillId = this.optionalText(event.skillId)
    const source = this.optionalText(event.source)
    if (!createdAt || !skillId || !source) return null

    return {
      id: this.optionalText(event.id) ?? randomUUID(),
      skillId: skillId.slice(0, 120),
      userId,
      success: Boolean(event.success),
      source: source.slice(0, 120),
      ...(this.optionalText(event.runId) ? { runId: this.optionalText(event.runId)!.slice(0, 120) } : {}),
      ...(this.optionalText(event.conversationId)
        ? { conversationId: this.optionalText(event.conversationId)!.slice(0, 120) }
        : {}),
      createdAt,
    }
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private normalizeIso(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }

  private async persist(userId: string) {
    const filePath = this.storeFilePath(userId)
    const payload: SkillReputationStoreFile = {
      version: STORE_VERSION,
      events: this.eventsByUser.get(userId) ?? [],
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private async readStore(filePath: string): Promise<SkillReputationStoreFile> {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<SkillReputationStoreFile>
      return {
        version: Number.isFinite(parsed.version) ? Number(parsed.version) : STORE_VERSION,
        events: Array.isArray(parsed.events) ? parsed.events : [],
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : ''
      if (message && !message.toLowerCase().includes('no such file')) {
        this.logger.warn(`Failed to load skill reputation store: ${message}`)
      }
      return { version: STORE_VERSION, events: [] }
    }
  }

  private storeFilePath(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    return path.join(root, userId, SKILL_REPUTATION_FILE)
  }
}
