import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import type {
  BrowserCaptureInput,
  BrowserCaptureResult,
  NanobotAutonomySchedule,
  NanobotAutonomyStatus,
  NanobotAutonomyWindow,
  NanobotMemoryCurationResult,
  NanobotMemoryCurationStatus,
  UpdateNanobotAutonomyInput,
} from '@openagents/shared'

const CORE_MEMORY_FILES = ['SOUL.md', 'USER.md', 'MEMORY.md', 'HEARTBEAT.md'] as const
const DERIVED_MEMORY_FILE = 'cron.json'
const EXTENDED_WRITABLE_FILES = ['SKILLS.json', 'PERSONA.json', 'AUTONOMY.json'] as const
const MAX_CONTEXT_CHARS = 16_000
const MAX_DAILY_NOTE_DAYS = 30
const MAX_CONVERSATION_EXPORTS = 20
const MAX_MESSAGES_PER_CONVERSATION_EXPORT = 500
const AUTONOMY_FILE = 'AUTONOMY.json'
const DEFAULT_AUTONOMY_TIMEZONE = 'UTC'
const MEMORY_CURATION_WINDOW_HOURS = 24
const MEMORY_RETENTION_DAYS = 45
const MAX_CURATED_SUMMARY_POINTS = 14
const DEFAULT_AUTONOMY_WINDOWS: NanobotAutonomyWindow[] = [
  {
    label: 'business-hours',
    days: [1, 2, 3, 4, 5],
    start: '09:00',
    end: '17:00',
  },
]

export interface MemoryFileMeta {
  name: string
  size: number
  updatedAt: string
  readonly: boolean
}

export interface MemoryFileDocument extends MemoryFileMeta {
  content: string
}

interface CuratedPoint {
  text: string
  weight: number
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name)
  private readonly curationStateByUser = new Map<string, NanobotMemoryCurationStatus>()

  constructor(
    private prisma: PrismaService,
  ) {}

  async getForUser(userId: string) {
    const rows = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    })

    return rows.map((row) => ({
      ...row,
      tags: this.parseTags(row.tags, row.id),
    }))
  }

  async upsert(userId: string, type: 'fact' | 'preference' | 'summary', content: string, tags: string[] = []) {
    return this.prisma.memory.create({
      data: { userId, type, content, tags: JSON.stringify(tags) },
    })
  }

  async delete(id: string, userId: string) {
    return this.prisma.memory.deleteMany({ where: { id, userId } })
  }

  async listFiles(userId: string): Promise<MemoryFileMeta[]> {
    const userDir = await this.syncFiles(userId)
    const entries = await fs.readdir(userDir, { withFileTypes: true })
    const files: MemoryFileMeta[] = []

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const fullPath = path.join(userDir, entry.name)
      const stat = await fs.stat(fullPath)
      files.push({
        name: entry.name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        readonly: this.isReadonlyFile(entry.name),
      })
    }

    return files.sort((a, b) => a.name.localeCompare(b.name))
  }

  async readFile(userId: string, fileName: string): Promise<MemoryFileDocument> {
    this.assertFileName(fileName)
    const userDir = await this.syncFiles(userId)
    const fullPath = path.join(userDir, fileName)
    let content = ''
    try {
      content = await fs.readFile(fullPath, 'utf8')
    } catch {
      throw new NotFoundException(`Memory file "${fileName}" not found.`)
    }
    const stat = await fs.stat(fullPath)
    return {
      name: fileName,
      content,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      readonly: this.isReadonlyFile(fileName),
    }
  }

  async writeFile(userId: string, fileName: string, content: string): Promise<MemoryFileDocument> {
    this.assertFileName(fileName)
    if (this.isReadonlyFile(fileName)) {
      throw new BadRequestException(`File "${fileName}" is generated and cannot be edited directly.`)
    }

    const userDir = await this.ensureUserDir(userId)
    const fullPath = path.join(userDir, fileName)
    await fs.writeFile(fullPath, content, 'utf8')

    // Keep SOUL.md synchronized with the custom system prompt used by the agent.
    if (fileName === 'SOUL.md') {
      await this.prisma.userSettings.upsert({
        where: { userId },
        update: { customSystemPrompt: content.trim() || null },
        create: { userId, customSystemPrompt: content.trim() || null },
      })
    }

    const stat = await fs.stat(fullPath)
    return {
      name: fileName,
      content,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      readonly: false,
    }
  }

  async syncFiles(userId: string) {
    const userDir = await this.ensureUserDir(userId)

    const [profile, settings, memories, cronJobs, conversations] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      this.prisma.userSettings.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
      this.prisma.memory.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.cronJob.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: MAX_CONVERSATION_EXPORTS,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: MAX_MESSAGES_PER_CONVERSATION_EXPORT,
          },
        },
      }),
    ])

    if (!profile) return userDir

    const soul = settings.customSystemPrompt?.trim() || [
      '# SOUL',
      '',
      'You are a practical assistant.',
      'You should use tools when useful, ask for approval before sensitive actions,',
      'and keep responses concise and actionable.',
    ].join('\n')

    const userDoc = [
      '# USER',
      '',
      `id: ${profile.id}`,
      `name: ${profile.name ?? ''}`,
      `email: ${profile.email}`,
      `joined: ${profile.createdAt.toISOString()}`,
      `preferred_provider: ${settings.preferredProvider}`,
      `preferred_model: ${settings.preferredModel}`,
      '',
      'preferences:',
      '- language: en',
      '- tone: concise',
    ].join('\n')

    const memoryDoc = [
      '# MEMORY',
      '',
      ...memories.map((entry) => `- [${entry.type}] ${entry.content}`),
    ].join('\n')

    const heartbeatDoc = [
      '# HEARTBEAT',
      '',
      '## Active Tasks',
      ...cronJobs
        .filter((job) => job.enabled)
        .map((job) => `- ${job.name} (${job.scheduleKind}: ${job.scheduleValue})`),
      '',
      '## Disabled Tasks',
      ...cronJobs
        .filter((job) => !job.enabled)
        .map((job) => `- ${job.name}`),
    ].join('\n')

    await this.writeCoreFileIfMissing(userDir, 'SOUL.md', soul)
    await this.writeCoreFileIfMissing(userDir, 'USER.md', userDoc)
    await this.writeCoreFileIfMissing(userDir, 'MEMORY.md', memoryDoc)
    await this.writeCoreFileIfMissing(userDir, 'HEARTBEAT.md', heartbeatDoc)

    await fs.writeFile(path.join(userDir, DERIVED_MEMORY_FILE), JSON.stringify(cronJobs, null, 2), 'utf8')

    const dayBuckets = new Map<string, Array<{ conversationId: string; role: string; content: string; createdAt: string }>>()
    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        const date = message.createdAt.toISOString().slice(0, 10)
        if (!dayBuckets.has(date)) dayBuckets.set(date, [])
        dayBuckets.get(date)!.push({
          conversationId: conversation.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        })
      }

      const jsonl = conversation.messages
        .map((message) => JSON.stringify({
          id: message.id,
          conversationId: conversation.id,
          role: message.role,
          status: message.status,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        }))
        .join('\n')
      await fs.writeFile(path.join(userDir, `tg_${conversation.id}.jsonl`), jsonl, 'utf8')
    }

    const sortedDays = [...dayBuckets.keys()]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, MAX_DAILY_NOTE_DAYS)

    for (const day of sortedDays) {
      const lines = dayBuckets.get(day) ?? []
      const body = [
        `# ${day}`,
        '',
        ...lines.map((line) => `- ${line.createdAt} [${line.role}] (${line.conversationId}) ${line.content}`),
      ].join('\n')
      await fs.writeFile(path.join(userDir, `${day}.md`), body, 'utf8')
    }

    return userDir
  }

  async buildFilesystemContext(userId: string) {
    const userDir = await this.syncFiles(userId)
    const sections: string[] = []
    let used = 0

    for (const fileName of CORE_MEMORY_FILES) {
      const fullPath = path.join(userDir, fileName)
      try {
        const content = (await fs.readFile(fullPath, 'utf8')).trim()
        if (!content) continue
        const section = `## ${fileName}\n${content}`
        if (used + section.length > MAX_CONTEXT_CHARS) break
        sections.push(section)
        used += section.length
      } catch {
        // Skip missing file; syncFiles should have created it already.
      }
    }

    return sections.join('\n\n')
  }

  /**
   * Extract useful long-term memories from a conversation turn.
   * MVP: simple heuristic extraction (no LLM call, to save tokens).
   * Later: use LLM to extract structured facts.
   */
  async extractAndStore(userId: string, userMessage: string, agentReply: string) {
    // MVP: detect preference statements
    const preferencePatterns = [
      /I (prefer|like|love|hate|always|never|usually) (.+)/i,
      /my (name|email|timezone|language|role|company) is (.+)/i,
    ]

    for (const pattern of preferencePatterns) {
      const match = userMessage.match(pattern)
      if (match) {
        await this.upsert(userId, 'preference', userMessage.trim(), ['auto-extracted'])
        break
      }
    }
  }

  getCurationStatus(userId: string): NanobotMemoryCurationStatus {
    return this.curationStateByUser.get(userId) ?? {
      lastCuratedAt: null,
      lastSource: null,
      summaryPoints: 0,
      dedupedEntries: 0,
      expiredEntries: 0,
    }
  }

  async maybeRunNightlyCuration(userId: string, now = new Date()) {
    const utcHour = now.getUTCHours()
    if (utcHour < 1 || utcHour > 4) return null

    const status = this.getCurationStatus(userId)
    const alreadyCuratedToday = status.lastCuratedAt?.slice(0, 10) === now.toISOString().slice(0, 10)
    if (alreadyCuratedToday) return null

    return this.curateNightly(userId, 'nightly')
  }

  async curateNightly(
    userId: string,
    source: 'manual' | 'nightly' | 'heartbeat-recovery' = 'manual',
  ): Promise<NanobotMemoryCurationResult> {
    const now = new Date()
    const since = new Date(now.getTime() - MEMORY_CURATION_WINDOW_HOURS * 60 * 60 * 1000)

    const allMemories = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 600,
    })

    const dedupeKeepIds = new Set<string>()
    const dedupeSeen = new Set<string>()
    for (const memory of allMemories) {
      const key = `${memory.type}:${this.normalizeMemoryKey(memory.content)}`
      if (!key || key.endsWith(':')) {
        dedupeKeepIds.add(memory.id)
        continue
      }
      if (dedupeSeen.has(key)) continue
      dedupeSeen.add(key)
      dedupeKeepIds.add(memory.id)
    }
    const duplicateIds = allMemories
      .filter((memory) => !dedupeKeepIds.has(memory.id))
      .map((memory) => memory.id)
    if (duplicateIds.length > 0) {
      await this.prisma.memory.deleteMany({
        where: { userId, id: { in: duplicateIds } },
      })
    }

    const staleCutoff = new Date(now.getTime() - MEMORY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const staleIds = allMemories
      .filter((memory) => dedupeKeepIds.has(memory.id))
      .filter((memory) => {
        if (memory.updatedAt >= staleCutoff) return false
        if (memory.type !== 'summary') return false
        const tags = this.parseTags(memory.tags, memory.id)
        return tags.some((tag) => /auto|nightly|curat/i.test(tag))
      })
      .map((memory) => memory.id)

    if (staleIds.length > 0) {
      await this.prisma.memory.deleteMany({
        where: { userId, id: { in: staleIds } },
      })
    }

    const recentMessages = await this.prisma.message.findMany({
      where: {
        conversation: { userId },
        createdAt: { gte: since },
        role: { in: ['user', 'agent'] },
        status: 'done',
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        role: true,
        content: true,
        createdAt: true,
      },
    })

    const points = new Map<string, CuratedPoint>()
    for (const message of recentMessages) {
      const compact = message.content.replace(/\s+/g, ' ').trim()
      if (compact.length < 16) continue
      const clipped = compact.slice(0, 180)
      const key = this.normalizeMemoryKey(clipped)
      if (!key) continue

      let weight = message.role === 'user' ? 3 : 1
      if (/(must|important|deadline|prefer|always|never|avoid|need to)/i.test(clipped)) weight += 2
      if (/\?$/.test(clipped)) weight -= 1
      if (/(thanks|thank you|ok|done|great)/i.test(clipped)) weight -= 1

      const existing = points.get(key)
      if (!existing || existing.weight < weight) {
        points.set(key, { text: clipped, weight })
      }
    }

    const summaryLines = [...points.values()]
      .sort((a, b) => b.weight - a.weight || b.text.length - a.text.length)
      .slice(0, MAX_CURATED_SUMMARY_POINTS)
      .map((point) => `- ${point.text}`)

    const dayTag = now.toISOString().slice(0, 10)
    const summaryContent = [
      `Nightly memory curation (${dayTag})`,
      ...summaryLines,
    ].join('\n')
    const existingDailySummary = allMemories.some((memory) => {
      if (memory.type !== 'summary') return false
      const tags = this.parseTags(memory.tags, memory.id)
      return tags.includes(`nightly:${dayTag}`)
    })

    if (!existingDailySummary && summaryLines.length > 0) {
      await this.prisma.memory.create({
        data: {
          userId,
          type: 'summary',
          content: summaryContent,
          tags: JSON.stringify(['auto-curated', 'nightly-curation', `nightly:${dayTag}`]),
        },
      })
    }

    const curatedMemories = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 240,
    })

    const memoryDoc = [
      '# MEMORY',
      '',
      `Last curated: ${now.toISOString()} (${source})`,
      `Entries: ${curatedMemories.length}`,
      '',
      '## Curated Summary',
      ...(summaryLines.length > 0
        ? summaryLines
        : ['- No high-signal summaries generated in the last curation window.']),
      '',
      '## Recent Memory Entries',
      ...curatedMemories.slice(0, 80).map((entry) => `- [${entry.type}] ${entry.content.replace(/\s+/g, ' ').trim()}`),
    ].join('\n')

    const userDir = await this.ensureUserDir(userId)
    const memoryFilePath = path.join(userDir, 'MEMORY.md')
    await fs.writeFile(memoryFilePath, memoryDoc, 'utf8')
    const memoryStat = await fs.stat(memoryFilePath)

    const status: NanobotMemoryCurationStatus = {
      lastCuratedAt: now.toISOString(),
      lastSource: source,
      summaryPoints: summaryLines.length,
      dedupedEntries: duplicateIds.length,
      expiredEntries: staleIds.length,
    }
    this.curationStateByUser.set(userId, status)

    return {
      curatedAt: now.toISOString(),
      source,
      summaryPoints: summaryLines.length,
      dedupedEntries: duplicateIds.length,
      expiredEntries: staleIds.length,
      memoryEntries: curatedMemories.length,
      memoryFileBytes: memoryStat.size,
    }
  }

  async captureBrowserSelection(userId: string, input: BrowserCaptureInput): Promise<BrowserCaptureResult> {
    const url = (input.url ?? '').trim()
    const selection = (input.selection ?? '').trim()
    const title = (input.title ?? '').trim()
    const note = (input.note ?? '').trim()
    const conversationId = input.conversationId?.trim() || null

    if (!url) throw new BadRequestException('Capture URL is required.')
    if (!selection) throw new BadRequestException('Capture selection is required.')

    let host = 'unknown-host'
    try {
      host = new URL(url).hostname || host
    } catch {
      // Keep fallback host.
    }

    const clippedSelection = selection.slice(0, 8_000)
    const clippedNote = note.slice(0, 1_000)
    const nowIso = new Date().toISOString()

    let conversation: { id: string; userId: string } | null = null
    if (conversationId) {
      conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, userId: true },
      })
      if (!conversation || conversation.userId !== userId) {
        throw new BadRequestException('Conversation not found for browser capture target.')
      }
    }

    const content = [
      `Captured at ${nowIso}`,
      title ? `Title: ${title.slice(0, 200)}` : '',
      `URL: ${url.slice(0, 800)}`,
      '',
      'Selection:',
      clippedSelection,
      clippedNote ? `\nNote:\n${clippedNote}` : '',
    ].filter(Boolean).join('\n')

    const tags = ['browser-capture', host]
    const memory = await this.prisma.memory.create({
      data: {
        userId,
        type: 'summary',
        content,
        tags: JSON.stringify(tags),
      },
    })

    let conversationMessageId: string | null = null
    if (conversation) {
      const message = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          status: 'done',
          content: [
            `[Browser Capture] ${title ? title.slice(0, 160) : host}`,
            `Source: ${url.slice(0, 800)}`,
            '',
            clippedSelection,
            clippedNote ? `\nNote:\n${clippedNote}` : '',
          ].filter(Boolean).join('\n'),
        },
      })
      conversationMessageId = message.id

      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      })
    }

    return {
      capturedAt: nowIso,
      memory: {
        id: memory.id,
        userId: memory.userId,
        type: memory.type === 'fact' || memory.type === 'preference' || memory.type === 'summary'
          ? memory.type
          : 'summary',
        content: memory.content,
        tags: this.parseTags(memory.tags, memory.id),
        createdAt: memory.createdAt.toISOString(),
        updatedAt: memory.updatedAt.toISOString(),
      },
      conversationId,
      conversationMessageId,
    }
  }

  async getAutonomySchedule(userId: string): Promise<NanobotAutonomySchedule> {
    const userDir = await this.ensureUserDir(userId)
    const filePath = path.join(userDir, AUTONOMY_FILE)

    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<NanobotAutonomySchedule>
      return this.sanitizeAutonomySchedule(parsed)
    } catch {
      const fallback = this.defaultAutonomySchedule()
      await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8')
      return fallback
    }
  }

  async updateAutonomySchedule(
    userId: string,
    patch: UpdateNanobotAutonomyInput,
  ): Promise<NanobotAutonomySchedule> {
    const current = await this.getAutonomySchedule(userId)
    const next = this.sanitizeAutonomySchedule({
      enabled: patch.enabled ?? current.enabled,
      timezone: patch.timezone ?? current.timezone,
      windows: patch.windows ?? current.windows,
      updatedAt: new Date().toISOString(),
    })

    const userDir = await this.ensureUserDir(userId)
    const filePath = path.join(userDir, AUTONOMY_FILE)
    await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  async getAutonomyStatus(userId: string, now = new Date()): Promise<NanobotAutonomyStatus> {
    const schedule = await this.getAutonomySchedule(userId)
    if (!schedule.enabled) {
      return {
        now: now.toISOString(),
        scheduleEnabled: false,
        timezone: schedule.timezone,
        withinWindow: true,
        reason: 'Autonomy schedule is disabled; autonomous actions are allowed.',
        activeWindow: null,
      }
    }

    if (schedule.windows.length === 0) {
      return {
        now: now.toISOString(),
        scheduleEnabled: true,
        timezone: schedule.timezone,
        withinWindow: false,
        reason: 'Autonomy schedule is enabled but has no windows configured.',
        activeWindow: null,
      }
    }

    const local = this.getLocalClock(now, schedule.timezone)
    for (const window of schedule.windows) {
      if (this.windowMatches(window, local.day, local.minutes)) {
        return {
          now: now.toISOString(),
          scheduleEnabled: true,
          timezone: schedule.timezone,
          withinWindow: true,
          reason: `Within autonomy window "${window.label || `${window.start}-${window.end}`}".`,
          activeWindow: window,
        }
      }
    }

    return {
      now: now.toISOString(),
      scheduleEnabled: true,
      timezone: schedule.timezone,
      withinWindow: false,
      reason: 'Current time is outside configured autonomy windows.',
      activeWindow: null,
    }
  }

  private async ensureUserDir(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    const userDir = path.join(root, userId)
    await fs.mkdir(userDir, { recursive: true })
    return userDir
  }

  private async writeCoreFileIfMissing(userDir: string, fileName: (typeof CORE_MEMORY_FILES)[number], content: string) {
    const fullPath = path.join(userDir, fileName)
    try {
      await fs.access(fullPath)
    } catch {
      await fs.writeFile(fullPath, content, 'utf8')
    }
  }

  private assertFileName(fileName: string) {
    const normalized = fileName.trim()
    if (!normalized) throw new BadRequestException('File name is required.')
    if (normalized.includes('\\') || normalized.includes('/') || normalized.includes('..')) {
      throw new BadRequestException('Invalid file name.')
    }

    const isCore = CORE_MEMORY_FILES.includes(normalized as (typeof CORE_MEMORY_FILES)[number])
    const isExtended = EXTENDED_WRITABLE_FILES.includes(normalized as (typeof EXTENDED_WRITABLE_FILES)[number])
    const isDerived = normalized === DERIVED_MEMORY_FILE
      || /^\d{4}-\d{2}-\d{2}\.md$/.test(normalized)
      || /^tg_[A-Za-z0-9_-]+\.jsonl$/.test(normalized)

    if (!isCore && !isExtended && !isDerived) {
      throw new BadRequestException(`Unsupported memory file: ${normalized}`)
    }
  }

  private isReadonlyFile(fileName: string) {
    return fileName === DERIVED_MEMORY_FILE
      || /^\d{4}-\d{2}-\d{2}\.md$/.test(fileName)
      || /^tg_[A-Za-z0-9_-]+\.jsonl$/.test(fileName)
  }

  private defaultAutonomySchedule(): NanobotAutonomySchedule {
    return {
      enabled: false,
      timezone: DEFAULT_AUTONOMY_TIMEZONE,
      windows: [...DEFAULT_AUTONOMY_WINDOWS],
      updatedAt: new Date().toISOString(),
    }
  }

  private sanitizeAutonomySchedule(raw: Partial<NanobotAutonomySchedule>): NanobotAutonomySchedule {
    const timezone = this.sanitizeTimezone(raw.timezone)
    const windows = this.sanitizeAutonomyWindows(raw.windows)
    return {
      enabled: Boolean(raw.enabled),
      timezone,
      windows,
      updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString(),
    }
  }

  private sanitizeAutonomyWindows(raw: unknown): NanobotAutonomyWindow[] {
    if (!Array.isArray(raw)) return [...DEFAULT_AUTONOMY_WINDOWS]
    const normalized: NanobotAutonomyWindow[] = []

    for (const candidate of raw) {
      if (!candidate || typeof candidate !== 'object') continue
      const record = candidate as Partial<NanobotAutonomyWindow>
      const start = this.sanitizeClockValue(record.start)
      const end = this.sanitizeClockValue(record.end)
      if (!start || !end) continue

      const daysInput = Array.isArray(record.days) ? record.days : []
      const days = [...new Set(daysInput
        .map((value) => Number.parseInt(`${value}`, 10))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6))]
      if (days.length === 0) continue

      const label = typeof record.label === 'string' ? record.label.trim().slice(0, 80) : ''
      normalized.push({
        ...(label ? { label } : {}),
        days,
        start,
        end,
      })
      if (normalized.length >= 16) break
    }

    return normalized.length > 0 ? normalized : [...DEFAULT_AUTONOMY_WINDOWS]
  }

  private sanitizeTimezone(raw: unknown) {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) return DEFAULT_AUTONOMY_TIMEZONE
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
      return value
    } catch {
      return DEFAULT_AUTONOMY_TIMEZONE
    }
  }

  private sanitizeClockValue(raw: unknown) {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!/^\d{2}:\d{2}$/.test(value)) return null
    const hour = Number.parseInt(value.slice(0, 2), 10)
    const minute = Number.parseInt(value.slice(3, 5), 10)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return `${value.slice(0, 2)}:${value.slice(3, 5)}`
  }

  private parseClockMinutes(value: string) {
    const hour = Number.parseInt(value.slice(0, 2), 10)
    const minute = Number.parseInt(value.slice(3, 5), 10)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    return hour * 60 + minute
  }

  private getLocalClock(now: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)

    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun'
    const hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value ?? '0', 10)
    const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value ?? '0', 10)

    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }
    return {
      day: map[weekday] ?? 0,
      minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
    }
  }

  private windowMatches(window: NanobotAutonomyWindow, day: number, minutes: number) {
    const start = this.parseClockMinutes(window.start)
    const end = this.parseClockMinutes(window.end)
    if (start == null || end == null) return false

    const days = new Set(window.days)
    const previousDay = (day + 6) % 7

    if (start === end) {
      return days.has(day)
    }

    if (start < end) {
      return days.has(day) && minutes >= start && minutes < end
    }

    // Cross-midnight window (for example: 22:00 -> 03:00)
    if (days.has(day) && minutes >= start) return true
    if (days.has(previousDay) && minutes < end) return true
    return false
  }

  private normalizeMemoryKey(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[`"'.,!?;:()[\]{}]/g, '')
      .trim()
      .slice(0, 220)
  }

  private parseTags(raw: string, memoryId: string): string[] {
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((tag) => typeof tag === 'string')
    } catch {
      this.logger.warn(`Memory ${memoryId} has invalid tags JSON. Returning empty tags.`)
      return []
    }
  }
}
