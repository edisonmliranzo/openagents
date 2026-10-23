import { Injectable } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'

export interface Lesson {
  id: string
  text: string
  /** Outcome score (0-100) of the run the lesson was extracted from. */
  score: number
  kind: 'do' | 'avoid' | 'preference'
  enabled: boolean
  conversationId?: string
  createdAt: string
}

export interface LessonsFile {
  lessons: Lesson[]
  /** conversationId -> ISO timestamp of the last message reflected on */
  processed: Record<string, string>
  runs: Array<{ conversationId: string; score: number; summary: string; at: string }>
}

const MAX_LESSONS = 200
const MAX_RUNS = 100
/** ~800 tokens at ~4 chars/token. */
export const LESSONS_BLOCK_CHAR_CAP = 3200
const KIND = 'lessons'

@Injectable()
export class LessonsStore {
  constructor(private documents: DocumentStore) {}

  async read(userId: string): Promise<LessonsFile> {
    const data = await this.documents.read<LessonsFile>(userId, KIND, () => ({
      lessons: [],
      processed: {},
      runs: [],
    }))
    return {
      lessons: Array.isArray(data.lessons) ? data.lessons : [],
      processed: data.processed && typeof data.processed === 'object' ? data.processed : {},
      runs: Array.isArray(data.runs) ? data.runs : [],
    }
  }

  async write(userId: string, data: LessonsFile): Promise<void> {
    data.lessons = data.lessons.slice(0, MAX_LESSONS)
    data.runs = data.runs.slice(0, MAX_RUNS)
    const keys = Object.keys(data.processed)
    if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete data.processed[k]
    await this.documents.write(userId, KIND, data)
  }

  /** Short prompt block of enabled lessons, newest first, capped at ~800 tokens. */
  async renderBlock(userId: string): Promise<string> {
    const { lessons } = await this.read(userId)
    const active = lessons.filter((l) => l.enabled)
    if (!active.length) return ''
    const header = 'Lessons learned from past runs (apply when relevant):'
    const lines: string[] = []
    let size = header.length
    for (const l of active) {
      const line = `- ${l.kind === 'avoid' ? 'Avoid: ' : ''}${l.text}`
      if (size + line.length + 1 > LESSONS_BLOCK_CHAR_CAP) break
      lines.push(line)
      size += line.length + 1
    }
    return lines.length ? `${header}\n${lines.join('\n')}` : ''
  }

  /**
   * Adds a lesson, deduplicated by text. Returns the lesson, or null when it
   * was already present.
   */
  async addLesson(
    userId: string,
    input: { text: string; kind?: Lesson['kind']; score?: number; conversationId?: string },
  ): Promise<Lesson | null> {
    const text = String(input.text ?? '').trim().slice(0, 200)
    if (!text) return null
    const store = await this.read(userId)
    if (store.lessons.some((l) => l.text.toLowerCase() === text.toLowerCase())) return null
    const lesson: Lesson = {
      id: `lsn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      kind: input.kind === 'avoid' || input.kind === 'preference' ? input.kind : 'do',
      score: Number.isFinite(input.score) ? Math.max(0, Math.min(100, Number(input.score))) : 50,
      enabled: true,
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
    }
    store.lessons = [lesson, ...store.lessons]
    await this.write(userId, store)
    return lesson
  }

  /**
   * Turns a tool failure into an 'avoid' lesson so the agent does not repeat
   * the same mistake on the next run.
   */
  async learnFromFailure(
    userId: string,
    input: { toolName: string; error?: string; conversationId?: string },
  ): Promise<Lesson | null> {
    const detail = String(input.error ?? '').trim().slice(0, 140)
    const text = `Tool "${input.toolName}" failed${detail ? `: ${detail}` : ''}. Check its inputs or pick an alternative before retrying.`
    return this.addLesson(userId, { text, kind: 'avoid', conversationId: input.conversationId })
  }

  /** Records a one-line debrief for a finished run (feeds the weekly summary). */
  async recordDebrief(
    userId: string,
    entry: { conversationId: string; summary: string; score?: number },
  ) {
    const store = await this.read(userId)
    store.runs = [
      {
        conversationId: entry.conversationId,
        score: Number.isFinite(entry.score) ? Math.max(0, Math.min(100, Number(entry.score))) : 0,
        summary: String(entry.summary ?? '').slice(0, 300),
        at: new Date().toISOString(),
      },
      ...store.runs,
    ]
    await this.write(userId, store)
  }
}
