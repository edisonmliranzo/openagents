import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import type { LLMProvider } from '@openagents/shared'
import { Lesson, LessonsStore } from './lessons.store'

const SCAN_INTERVAL_MS = 20 * 60 * 1000
const MAX_CONVERSATIONS_PER_CYCLE = 15

const LESSON_PROMPT = `You review one completed AI agent run (user request + agent reply + tool activity).
1. Score the outcome 0-100 (did the agent satisfy the request accurately, efficiently, safely?).
2. Extract at most 3 short, reusable, GENERAL lessons that would make future runs for this user better
   (e.g. preferred formats, tools that worked/failed, mistakes to avoid). No one-off facts, no secrets.
Return STRICT JSON only:
{"score":0-100,"summary":"one sentence","lessons":[{"kind":"do"|"avoid"|"preference","text":"<=160 chars"}]}`

@Injectable()
export class LessonsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LessonsService.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly lessons: LessonsStore,
  ) {}

  get enabled(): boolean {
    const raw = (this.config.get<string>('LESSONS_ENABLED') ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.scanCycle(), SCAN_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** Reflect on recently finished agent runs that have not been scored yet. */
  async scanCycle(): Promise<number> {
    if (!this.enabled || this.running) return 0
    this.running = true
    let done = 0
    try {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const convs = await this.prisma.conversation.findMany({
        where: { messages: { some: { role: 'agent', status: 'done', createdAt: { gte: since } } } },
        select: { id: true, userId: true },
        take: MAX_CONVERSATIONS_PER_CYCLE,
      })
      for (const c of convs) {
        const ok = await this.reflectOnConversation(c.userId, c.id).catch((e: any) => {
          this.logger.debug(`Lesson reflection failed: ${e?.message ?? e}`)
          return null
        })
        if (ok) done += 1
      }
    } finally {
      this.running = false
    }
    return done
  }

  async reflectOnConversation(userId: string, conversationId?: string) {
    const conv = conversationId
      ? await this.prisma.conversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } })
      : await this.prisma.conversation.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
    if (!conv) return null
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'desc' },
      take: 14,
      select: { role: true, content: true, status: true, createdAt: true },
    })
    const last = messages[0]
    if (!last || last.role !== 'agent' || last.status !== 'done') return null
    const store = await this.lessons.read(userId)
    const stamp = last.createdAt.toISOString()
    if (store.processed[conv.id] === stamp) return null

    const log = messages
      .reverse()
      .map((m) => `[${m.role}] ${String(m.content ?? '').slice(0, 800)}`)
      .join('\n')
      .slice(-8000)
    const settings = await this.users.getSettings(userId).catch(() => null as any)
    const provider = (settings?.preferredProvider ?? undefined) as LLMProvider | undefined
    const res = await this.llm.complete(
      [{ role: 'user', content: `${LESSON_PROMPT}\n\n--- RUN ---\n${log}` }],
      [],
      'Return only valid JSON.',
      provider,
      undefined,
      undefined,
      settings?.preferredModel ?? undefined,
    )
    const parsed = extractJson(res.content)
    store.processed[conv.id] = stamp
    if (!parsed) {
      await this.lessons.write(userId, store)
      return null
    }
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0))
    const existing = new Set(store.lessons.map((l) => l.text.toLowerCase()))
    const added: Lesson[] = []
    for (const raw of Array.isArray(parsed.lessons) ? parsed.lessons.slice(0, 3) : []) {
      const text = typeof raw?.text === 'string' ? raw.text.trim().slice(0, 200) : ''
      if (!text || existing.has(text.toLowerCase())) continue
      const kind: Lesson['kind'] = raw.kind === 'avoid' || raw.kind === 'preference' ? raw.kind : 'do'
      added.push({
        id: `lsn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        kind,
        score,
        enabled: true,
        conversationId: conv.id,
        createdAt: new Date().toISOString(),
      })
    }
    store.lessons = [...added, ...store.lessons]
    store.runs.unshift({ conversationId: conv.id, score, summary: String(parsed.summary ?? '').slice(0, 300), at: new Date().toISOString() })
    await this.lessons.write(userId, store)
    return { score, summary: parsed.summary ?? '', added }
  }

  async list(userId: string) {
    const s = await this.lessons.read(userId)
    const avg = s.runs.length ? Math.round(s.runs.reduce((a, r) => a + r.score, 0) / s.runs.length) : null
    return { lessons: s.lessons, runs: s.runs.slice(0, 20), averageScore: avg }
  }

  async remove(userId: string, id: string) {
    const s = await this.lessons.read(userId)
    const before = s.lessons.length
    s.lessons = s.lessons.filter((l) => l.id !== id)
    await this.lessons.write(userId, s)
    return { deleted: s.lessons.length < before }
  }

  async toggle(userId: string, id: string, enabled?: boolean) {
    const s = await this.lessons.read(userId)
    const lesson = s.lessons.find((l) => l.id === id)
    if (!lesson) return null
    lesson.enabled = typeof enabled === 'boolean' ? enabled : !lesson.enabled
    await this.lessons.write(userId, s)
    return lesson
  }

  preview(userId: string) {
    return this.lessons.renderBlock(userId).then((block) => ({ block }))
  }
}

function extractJson(text: string): any | null {
  const raw = String(text ?? '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}
