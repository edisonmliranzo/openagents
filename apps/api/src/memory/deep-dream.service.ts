import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { promises as fs } from 'fs'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'
import { DocumentStore } from '../prisma/document-store.service'
import { LLMService } from '../agent/llm.service'
import { UsersService } from '../users/users.service'
import { LessonsStore } from '../reflection/lessons.store'
import type { LLMProvider } from '@openagents/shared'

/**
 * Deep Dream — the CowAgent-inspired nightly distillation pass.
 *
 * The existing nightly curation is a keyword-weight heuristic: it dedupes,
 * expires stale entries and extracts bullet points by regex weighting. Deep
 * Dream adds the missing half of CowAgent's three-tier memory: an LLM pass
 * that reads the day's scattered memories, lessons and debriefs and distils
 * them into (a) a narrative journal entry and (b) refined, durable long-term
 * facts that survive into the curated core.
 *
 *   context (messages)  →  nightly curation (heuristic)  →  Deep Dream (this)
 *                                                             ├─ JOURNAL.md  (narrative, append-only)
 *                                                             └─ memory facts (durable, retrievable)
 */

interface DeepDreamState {
  lastRunAt: string | null
  runs: Array<{ at: string; theme: string; keepCount: number; journalChars: number }>
}

export interface DeepDreamResult {
  ran: boolean
  reason?: string
  theme?: string
  journalChars?: number
  keepCount?: number
  materialMemories?: number
  materialLessons?: number
}

const KIND = 'deep_dream'
const WINDOW_HOURS = 48
const MAX_KEEP = 10
const JOURNAL_MAX_CHARS = 64_000
const STATE_MAX_RUNS = 30

const DISTILL_PROMPT = [
  'You are the memory distillation engine for a personal AI assistant ("Deep Dream" pass).',
  'You receive the raw material from the last two days: memory entries, learned lessons, and run debriefs.',
  'Produce a distilled long-term memory update. Reply with JSON only:',
  '{"theme":"<=6 words capturing the day","journal":"a narrative journal entry, 120-200 words, third person, what happened and what it means for the user","keep":["durable long-term facts worth remembering for months, each <=140 chars, max 10, omit anything transient or trivial"]}',
  '',
  'Rules for "keep": only durable information (preferences, facts about the user, decisions, recurring patterns, important dates/commitments).',
  'Never include secrets, tokens, or one-off chatter. If nothing is durable, return an empty "keep" array.',
  'The journal must read like a diary entry about the *user\'s* work and interests — not a log of API calls.',
].join('\n')

@Injectable()
export class DeepDreamService {
  private readonly logger = new Logger(DeepDreamService.name)

  constructor(
    private prisma: PrismaService,
    private documents: DocumentStore,
    private moduleRef: ModuleRef,
  ) {}

  // ── lazy cross-module deps (avoid cycles: AgentModule imports MemoryModule) ──
  private lazy<T>(token: new (...args: any[]) => T): T | null {
    try {
      return this.moduleRef.get(token, { strict: false })
    } catch {
      return null
    }
  }
  private get llm() { return this.lazy(LLMService) }
  private get users() { return this.lazy(UsersService) }
  private get lessons() { return this.lazy(LessonsStore) }

  // ── state ─────────────────────────────────────────────────────────────────

  private async readState(userId: string): Promise<DeepDreamState> {
    const state = await this.documents.read<DeepDreamState>(userId, KIND, () => ({
      lastRunAt: null,
      runs: [],
    }))
    return {
      lastRunAt: state?.lastRunAt ?? null,
      runs: Array.isArray(state?.runs) ? state.runs : [],
    }
  }

  private async writeState(userId: string, state: DeepDreamState) {
    await this.documents.write(userId, KIND, {
      lastRunAt: state.lastRunAt,
      runs: state.runs.slice(0, STATE_MAX_RUNS),
    })
  }

  async status(userId: string) {
    const state = await this.readState(userId)
    return {
      lastRunAt: state.lastRunAt,
      runs: state.runs.slice(0, 10),
      journalExists: await this.fileExists(userId, 'JOURNAL.md'),
    }
  }

  /** Once per calendar day per user — mirrors the curation guard. */
  async maybeRun(userId: string, source: 'manual' | 'nightly' = 'nightly'): Promise<DeepDreamResult | null> {
    const state = await this.readState(userId)
    const today = new Date().toISOString().slice(0, 10)
    if (state.lastRunAt?.slice(0, 10) === today) return null
    return this.run(userId, source)
  }

  // ── the pass ───────────────────────────────────────────────────────────────

  async run(userId: string, source: 'manual' | 'nightly' = 'manual'): Promise<DeepDreamResult> {
    const now = new Date()
    const since = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000)

    // Gather the day's material.
    const memories = await this.prisma.memory.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { type: true, content: true, createdAt: true },
    })

    const lessonsState = await this.lessons?.read(userId).catch(() => null)
    const recentLessons = (lessonsState?.lessons ?? [])
      .filter((lesson) => lesson.createdAt >= since.toISOString())
      .slice(0, 20)
      .map((lesson) => `[${lesson.kind}] ${lesson.text}`)
    const recentDebriefs = (lessonsState?.runs ?? [])
      .filter((run) => run.at >= since.toISOString())
      .slice(0, 20)
      .map((run) => run.summary)

    const materialCount = memories.length + recentLessons.length + recentDebriefs.length
    if (materialCount === 0) {
      this.logger.debug(`Deep Dream skipped for ${userId}: no recent material`)
      return { ran: false, reason: 'No memories, lessons or debriefs in the last 48 hours.' }
    }

    const material = [
      memories
        .slice(0, 120)
        .map((m) => `[${m.type}] ${m.content.replace(/\s+/g, ' ').trim().slice(0, 220)}`)
        .join('\n'),
      recentLessons.length ? `Lessons:\n${recentLessons.join('\n')}` : '',
      recentDebriefs.length ? `Run debriefs:\n${recentDebriefs.join('\n')}` : '',
    ].filter(Boolean).join('\n\n')

    const parsed = await this.distill(userId, material)
    if (!parsed) {
      return { ran: false, reason: 'Distillation failed or returned nothing usable.' }
    }

    const today = now.toISOString().slice(0, 10)
    const theme = String(parsed.theme ?? 'daily distillation').slice(0, 80)
    const journal = String(parsed.journal ?? '').trim()
    const keep = (Array.isArray(parsed.keep) ? parsed.keep : [])
      .map((entry: unknown) => String(entry ?? '').trim())
      .filter(Boolean)
      .slice(0, MAX_KEEP)

    // (a) The narrative journal — append-only, never touched by curation.
    if (journal) {
      await this.appendJournal(userId, today, theme, journal)
    }

    // (b) The durable facts — into the memory store so retrieval can find them
    // and the next curation folds them into MEMORY.md.
    for (const fact of keep) {
      await this.prisma.memory.create({
        data: {
          userId,
          type: 'summary',
          content: `[deep dream] ${fact.slice(0, 400)}`,
          tags: JSON.stringify(['auto-curated', 'deep-dream', `dream:${today}`]),
        },
      }).catch(() => undefined)
    }

    // (c) The curated core — merge the distilled facts into the Deep Dream
    // section of MEMORY.md. The nightly curation carries this section over.
    if (keep.length > 0) {
      await this.mergeCoreSection(userId, today, theme, keep)
    }

    const state = await this.readState(userId)
    state.lastRunAt = now.toISOString()
    state.runs = [
      { at: now.toISOString(), theme, keepCount: keep.length, journalChars: journal.length },
      ...state.runs,
    ]
    await this.writeState(userId, state)

    this.logger.log(
      `Deep Dream for ${userId} (${source}): theme="${theme}", journal ${journal.length} chars, ${keep.length} kept fact(s)`,
    )

    return {
      ran: true,
      theme,
      journalChars: journal.length,
      keepCount: keep.length,
      materialMemories: memories.length,
      materialLessons: recentLessons.length + recentDebriefs.length,
    }
  }

  /** One LLM call; a failure is a no-op, never a crash. */
  private async distill(userId: string, material: string): Promise<{ theme?: string; journal?: string; keep?: string[] } | null> {
    const llm = this.llm
    const users = this.users
    if (!llm || !users) {
      this.logger.warn('Deep Dream skipped: LLM or Users service unavailable')
      return null
    }

    const settings = await users.getSettings(userId).catch(() => null)
    const provider = (settings?.preferredProvider ?? undefined) as LLMProvider | undefined
    const stored = provider
      ? await users.getRawLlmKey(userId, provider).catch(() => null)
      : null
    const apiKey = stored?.isActive ? (stored.apiKey ?? stored.loginPassword ?? undefined) : undefined
    const baseUrl = stored?.isActive ? (stored.baseUrl ?? undefined) : undefined

    const clipped = material.slice(0, 12_000)
    try {
      const res = await llm.complete(
        [{ role: 'user', content: `${DISTILL_PROMPT}\n\n--- MATERIAL FROM THE LAST 48 HOURS ---\n${clipped}` }],
        [],
        'Return only valid JSON. No markdown fences.',
        provider,
        apiKey,
        baseUrl,
        settings?.preferredModel ?? undefined,
      )
      const m = String(res.content ?? '').match(/\{[\s\S]*\}/)
      return m ? JSON.parse(m[0]) : null
    } catch (error: any) {
      this.logger.warn(`Deep Dream distillation failed: ${error?.message ?? error}`)
      return null
    }
  }

  // ── files (same layout as memory.service: data/memory/<userId>/) ─────────

  private userDir(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    return path.join(root, userId)
  }

  private async fileExists(userId: string, fileName: string) {
    try {
      await fs.access(path.join(this.userDir(userId), fileName))
      return true
    } catch {
      return false
    }
  }

  /**
   * Merges the distilled facts into the `## Deep Dream` section of MEMORY.md,
   * deduplicating against what earlier dreams already kept. The nightly
   * curation preserves this section when it rewrites the file.
   */
  private async mergeCoreSection(userId: string, day: string, theme: string, keep: string[]) {
    const file = path.join(this.userDir(userId), 'MEMORY.md')
    let doc = ''
    try {
      doc = await fs.readFile(file, 'utf8')
    } catch {
      doc = '# MEMORY\n'
    }

    const sectionRe = /## Deep Dream\n([\s\S]*?)(?=\n## |\n*$)/
    const existing = doc.match(sectionRe)
    const existingBullets = existing
      ? (existing[1] ?? '').split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- '))
      : []

    const seen = new Set(existingBullets.map((b) => b.toLowerCase()))
    const merged = [...existingBullets]
    for (const fact of keep) {
      const bullet = `- ${fact}`
      if (seen.has(bullet.toLowerCase())) continue
      seen.add(bullet.toLowerCase())
      merged.push(bullet)
    }

    const section = [
      '## Deep Dream',
      `Last distilled: ${day} — ${theme}`,
      ...merged.slice(-30),
    ].join('\n')

    let next: string
    if (existing) {
      next = doc.replace(sectionRe, `${section}\n`)
    } else if (doc.includes('## Recent Memory Entries')) {
      next = doc.replace('## Recent Memory Entries', `${section}\n\n## Recent Memory Entries`)
    } else {
      next = `${doc.trimEnd()}\n\n${section}\n`
    }

    await fs.mkdir(this.userDir(userId), { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, next, 'utf8')
    await fs.rename(tmp, file)
  }

  private async appendJournal(userId: string, day: string, theme: string, journal: string) {
    const dir = this.userDir(userId)
    const file = path.join(dir, 'JOURNAL.md')
    let existing = ''
    try {
      existing = await fs.readFile(file, 'utf8')
    } catch {
      existing = '# JOURNAL\n\nDistilled nightly by the Deep Dream pass. One narrative entry per day.\n'
    }

    const entry = `\n## ${day} — ${theme}\n\n${journal}\n`
    let next = existing + entry
    if (next.length > JOURNAL_MAX_CHARS) {
      next = next.slice(next.length - JOURNAL_MAX_CHARS)
    }

    await fs.mkdir(dir, { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, next, 'utf8')
    await fs.rename(tmp, file)
  }
}
