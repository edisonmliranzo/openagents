import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PrismaService } from '../prisma/prisma.service'

const CORE_MEMORY_FILES = ['SOUL.md', 'USER.md', 'MEMORY.md', 'HEARTBEAT.md'] as const
const DERIVED_MEMORY_FILE = 'cron.json'
const EXTENDED_WRITABLE_FILES = ['SKILLS.json', 'PERSONA.json'] as const
const MAX_CONTEXT_CHARS = 16_000
const MAX_DAILY_NOTE_DAYS = 30
const MAX_CONVERSATION_EXPORTS = 20
const MAX_MESSAGES_PER_CONVERSATION_EXPORT = 500

export interface MemoryFileMeta {
  name: string
  size: number
  updatedAt: string
  readonly: boolean
}

export interface MemoryFileDocument extends MemoryFileMeta {
  content: string
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name)

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
