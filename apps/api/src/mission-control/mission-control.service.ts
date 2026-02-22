import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  MissionControlEvent,
  MissionControlEventStatus,
  MissionControlEventType,
  MissionControlListInput,
  MissionControlListResult,
} from '@openagents/shared'

const MISSION_EVENTS_FILE = 'MISSION_EVENTS.json'
const STORE_VERSION = 1
const MAX_EVENTS_PER_USER = 5000
const MAX_RETENTION_DAYS = 30

interface MissionEventStoreFile {
  version: number
  events: MissionControlEvent[]
}

type MissionControlListener = (event: MissionControlEvent) => void

@Injectable()
export class MissionControlService {
  private readonly logger = new Logger(MissionControlService.name)
  private readonly loadedUsers = new Set<string>()
  private readonly eventsByUser = new Map<string, MissionControlEvent[]>()
  private readonly listenersByUser = new Map<string, Set<MissionControlListener>>()

  async listEvents(userId: string, input: MissionControlListInput = {}): Promise<MissionControlListResult> {
    await this.ensureLoaded(userId)
    const all = [...(this.eventsByUser.get(userId) ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const filtered = this.filterEvents(all, input)
    const limit = Math.max(1, Math.min(input.limit ?? 60, 500))

    const cursor = input.cursor?.trim() || ''
    let startIndex = 0
    if (cursor) {
      const idx = filtered.findIndex((event) => event.id === cursor)
      if (idx >= 0) startIndex = idx + 1
    }

    const slice = filtered.slice(startIndex, startIndex + limit)
    const nextCursor = (startIndex + limit) < filtered.length
      ? (slice[slice.length - 1]?.id ?? null)
      : null

    return { events: slice, nextCursor }
  }

  async publish(input: {
    userId: string
    type: MissionControlEventType
    status: MissionControlEventStatus
    source: string
    runId?: string
    conversationId?: string
    approvalId?: string
    payload?: Record<string, unknown>
  }) {
    await this.ensureLoaded(input.userId)
    const event: MissionControlEvent = {
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      status: input.status,
      source: input.source.trim().slice(0, 120) || 'system',
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.approvalId ? { approvalId: input.approvalId } : {}),
      createdAt: new Date().toISOString(),
      payload: input.payload ?? {},
    }

    const events = [...(this.eventsByUser.get(input.userId) ?? []), event]
    const retained = this.retainEvents(events)
    this.eventsByUser.set(input.userId, retained)
    await this.persist(input.userId)

    const listeners = this.listenersByUser.get(input.userId)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          // Ignore listener delivery failures.
        }
      }
    }

    return event
  }

  subscribe(userId: string, listener: MissionControlListener) {
    const listeners = this.listenersByUser.get(userId) ?? new Set<MissionControlListener>()
    listeners.add(listener)
    this.listenersByUser.set(userId, listeners)
    return () => {
      const current = this.listenersByUser.get(userId)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) this.listenersByUser.delete(userId)
    }
  }

  private filterEvents(events: MissionControlEvent[], input: MissionControlListInput) {
    const types = new Set((input.types ?? []).map((value) => value.trim()).filter(Boolean))
    const statuses = new Set((input.statuses ?? []).map((value) => value.trim()).filter(Boolean))
    const source = input.source?.trim().toLowerCase()

    return events.filter((event) => {
      if (types.size > 0 && !types.has(event.type)) return false
      if (statuses.size > 0 && !statuses.has(event.status)) return false
      if (source && !event.source.toLowerCase().includes(source)) return false
      return true
    })
  }

  private retainEvents(events: MissionControlEvent[]) {
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
    const filePath = this.storeFilePath(userId)
    const store = await this.readStore(filePath)
    const events = (store.events ?? [])
      .filter((event) => event.userId === userId)
      .map((event) => this.sanitizeStoredEvent(event, userId))
      .filter((event): event is MissionControlEvent => Boolean(event))
    this.eventsByUser.set(userId, this.retainEvents(events))
    this.loadedUsers.add(userId)
  }

  private sanitizeStoredEvent(event: MissionControlEvent, userId: string): MissionControlEvent | null {
    if (!event || typeof event !== 'object') return null
    const type = this.normalizeType(event.type)
    const status = this.normalizeStatus(event.status)
    const source = typeof event.source === 'string' ? event.source.trim() : ''
    const createdAt = this.normalizeIso(event.createdAt)
    if (!type || !status || !source || !createdAt) return null

    return {
      id: typeof event.id === 'string' && event.id.trim() ? event.id.trim() : randomUUID(),
      userId,
      type,
      status,
      source: source.slice(0, 120),
      ...(typeof event.runId === 'string' && event.runId.trim() ? { runId: event.runId.trim() } : {}),
      ...(typeof event.conversationId === 'string' && event.conversationId.trim()
        ? { conversationId: event.conversationId.trim() }
        : {}),
      ...(typeof event.approvalId === 'string' && event.approvalId.trim() ? { approvalId: event.approvalId.trim() } : {}),
      createdAt,
      payload: this.asRecord(event.payload) ?? {},
    }
  }

  private normalizeType(value: unknown): MissionControlEventType | null {
    if (
      value === 'run'
      || value === 'tool_call'
      || value === 'approval'
      || value === 'workflow_run'
      || value === 'playbook_run'
      || value === 'version_change'
      || value === 'failure'
    ) {
      return value
    }
    return null
  }

  private normalizeStatus(value: unknown): MissionControlEventStatus | null {
    if (
      value === 'started'
      || value === 'success'
      || value === 'failed'
      || value === 'pending'
      || value === 'approved'
      || value === 'denied'
      || value === 'info'
    ) {
      return value
    }
    return null
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  }

  private normalizeIso(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }

  private async persist(userId: string) {
    const filePath = this.storeFilePath(userId)
    const payload: MissionEventStoreFile = {
      version: STORE_VERSION,
      events: this.eventsByUser.get(userId) ?? [],
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private async readStore(filePath: string): Promise<MissionEventStoreFile> {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<MissionEventStoreFile>
      return {
        version: Number.isFinite(parsed.version) ? Number(parsed.version) : STORE_VERSION,
        events: Array.isArray(parsed.events) ? parsed.events : [],
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : ''
      if (message && !message.toLowerCase().includes('no such file')) {
        this.logger.warn(`Failed to load mission control store: ${message}`)
      }
      return { version: STORE_VERSION, events: [] }
    }
  }

  private storeFilePath(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    return path.join(root, userId, MISSION_EVENTS_FILE)
  }
}
