import { promises as fs } from 'node:fs'
import path from 'node:path'

/** Per-user JSON file persistence for governance state (no Prisma schema changes needed). */
function root() {
  return (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
}

export function governanceFile(userId: string, name: string) {
  const safeUser = String(userId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'anonymous'
  return path.join(root(), safeUser, 'governance', name)
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

/** Serialises async work per key so read-modify-write cycles never interleave. */
const chains = new Map<string, Promise<unknown>>()
export function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  chains.set(key, next.catch(() => undefined))
  return next
}
