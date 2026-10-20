import { promises as fs } from 'fs'
import * as path from 'path'

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

const dir = () => path.resolve(process.env.LESSONS_DATA_DIR ?? path.join(process.cwd(), 'data', 'lessons'))
const fileFor = (userId: string) => path.join(dir(), `${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)

export async function readLessons(userId: string): Promise<LessonsFile> {
  try {
    const raw = JSON.parse(await fs.readFile(fileFor(userId), 'utf8')) as Partial<LessonsFile>
    return {
      lessons: Array.isArray(raw.lessons) ? raw.lessons : [],
      processed: raw.processed && typeof raw.processed === 'object' ? raw.processed : {},
      runs: Array.isArray(raw.runs) ? raw.runs : [],
    }
  } catch {
    return { lessons: [], processed: {}, runs: [] }
  }
}

export async function writeLessons(userId: string, data: LessonsFile): Promise<void> {
  data.lessons = data.lessons.slice(0, MAX_LESSONS)
  data.runs = data.runs.slice(0, MAX_RUNS)
  const keys = Object.keys(data.processed)
  if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete data.processed[k]
  await fs.mkdir(dir(), { recursive: true })
  const target = fileFor(userId)
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, target)
}

/** Short prompt block of enabled lessons, newest first, capped at ~800 tokens. */
export async function renderLessonsBlock(userId: string): Promise<string> {
  const { lessons } = await readLessons(userId)
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
