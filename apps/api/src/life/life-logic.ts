import { createHash } from 'node:crypto'

/**
 * Pure helpers for the life module. No I/O so they are unit-testable.
 */

// ---- Janitor: file plan builder ----

export interface JanitorFileEntry {
  name: string
  sizeBytes: number
  modifiedAt: Date
}

export interface JanitorMove {
  from: string
  to: string
  action: 'rename' | 'move'
  reason: string
}

const JANITOR_CATEGORIES: Array<{ folder: string; extensions: string[] }> = [
  { folder: 'images', extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.svg', '.bmp'] },
  { folder: 'documents', extensions: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.odt', '.pages'] },
  { folder: 'spreadsheets', extensions: ['.xls', '.xlsx', '.csv', '.numbers'] },
  { folder: 'presentations', extensions: ['.ppt', '.pptx', '.key'] },
  { folder: 'archives', extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'] },
  { folder: 'installers', extensions: ['.exe', '.msi', '.dmg', '.pkg', '.deb', '.appimage'] },
  { folder: 'audio', extensions: ['.mp3', '.wav', '.flac', '.m4a', '.ogg'] },
  { folder: 'video', extensions: ['.mp4', '.mov', '.mkv', '.avi', '.webm'] },
  { folder: 'code', extensions: ['.ts', '.js', '.py', '.json', '.html', '.css', '.sh', '.rs', '.go'] },
]

export function categoryFor(fileName: string): string {
  const lower = fileName.toLowerCase()
  for (const cat of JANITOR_CATEGORIES) {
    if (cat.extensions.some((ext) => lower.endsWith(ext))) return cat.folder
  }
  return 'other'
}

export function cleanFileName(fileName: string): string {
  return fileName
    .replace(/\s+/g, ' ')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[-\s]+([-.])/g, '$1')
    .replace(/\s+$/, '')
    .trim()
}

/**
 * Build a tidy plan: never touches files modified in the last 24h (likely in
 * use), dedupes same-size files (keeps newest), sorts by category, cleans names.
 */
export function buildJanitorPlan(folder: string, files: JanitorFileEntry[], now: Date = new Date()): JanitorMove[] {
  const moves: JanitorMove[] = []
  const freshCutoff = now.getTime() - 24 * 3600_000

  // Duplicate detection: same size + same normalized name base.
  const byKey = new Map<string, JanitorFileEntry[]>()
  for (const f of files) {
    const base = cleanFileName(f.name).replace(/(\.\w+)?\s*\(\d+\)(\.\w+)?$/i, '$2')
    const key = `${categoryFor(f.name)}:${base.toLowerCase()}:${f.sizeBytes}`
    const list = byKey.get(key) ?? []
    list.push(f)
    byKey.set(key, list)
  }
  const dupes = new Set<string>()
  for (const list of byKey.values()) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
    for (const loser of sorted.slice(1)) dupes.add(loser.name)
  }

  for (const f of files) {
    if (dupes.has(f.name)) {
      moves.push({ from: `${folder}/${f.name}`, to: `${folder}/.janitor-trash/${f.name}`, action: 'move', reason: 'duplicate (older copy)' })
      continue
    }
    if (f.modifiedAt.getTime() > freshCutoff) continue // too fresh, in use
    const cat = categoryFor(f.name)
    const clean = cleanFileName(f.name)
    const needsCategory = cat !== 'other'
    const targetDir = needsCategory ? `${folder}/${cat}` : folder
    if (needsCategory) {
      moves.push({ from: `${folder}/${f.name}`, to: `${targetDir}/${clean}`, action: 'move', reason: `sort into ${cat}/` })
    } else if (clean !== f.name) {
      moves.push({ from: `${folder}/${f.name}`, to: `${folder}/${clean}`, action: 'rename', reason: 'clean file name' })
    }
  }
  return moves.slice(0, 200)
}

// ---- Approval rules: glob matching ----

/** Minimal glob: `*` matches any run of characters, exact otherwise. */
export function globMatches(pattern: string, value: string): boolean {
  const re = new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    'i',
  )
  return re.test(value)
}

export interface RuleLike {
  toolPattern: string
  decision: string
  enabled: boolean
}

/** First matching enabled rule wins. */
export function decideByRules(rules: RuleLike[], tool: string): 'allow' | 'deny' | null {
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (globMatches(rule.toolPattern, tool)) return rule.decision === 'deny' ? 'deny' : 'allow'
  }
  return null
}

// ---- Anticipation: recurring request clustering ----

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'at', 'is', 'it', 'my', 'me', 'please',
  'can', 'you', 'i', 'we', 'this', 'that', 'with', 'about', 'again', 'up', 'do', 'does', 'did', 'what',
])

export function tokenize(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue
    if (/^\d+$/.test(raw)) continue
    out.add(raw)
  }
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared += 1
  return shared / (a.size + b.size - shared)
}

export interface PromptOccurrence {
  text: string
  at: Date
}

export interface AnticipationCandidate {
  patternText: string
  exampleCount: number
  cadenceDays: number
  lastSeenAt: Date
}

const MIN_SIMILARITY = 0.55
const MIN_EXAMPLES = 3

/** Cluster recurring user prompts; a pattern needs >=3 similar occurrences spread over >=5 days. */
export function findRecurringPrompts(occurrences: PromptOccurrence[]): AnticipationCandidate[] {
  const clusters: Array<{ members: PromptOccurrence[]; tokens: Set<string> }> = []
  for (const occ of [...occurrences].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const tokens = tokenize(occ.text)
    if (tokens.size === 0) continue
    let placed = false
    for (const cluster of clusters) {
      if (jaccard(cluster.tokens, tokens) >= MIN_SIMILARITY) {
        cluster.members.push(occ)
        for (const t of tokens) cluster.tokens.add(t)
        placed = true
        break
      }
    }
    if (!placed) clusters.push({ members: [occ], tokens: new Set(tokens) })
  }

  const candidates: AnticipationCandidate[] = []
  for (const cluster of clusters) {
    if (cluster.members.length < MIN_EXAMPLES) continue
    const sorted = [...cluster.members].sort((a, b) => a.at.getTime() - b.at.getTime())
    const spanDays = (sorted[sorted.length - 1].at.getTime() - sorted[0].at.getTime()) / 86400_000
    if (spanDays < 5) continue
    // Cadence = median gap between occurrences, clamped to 3..60 days.
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i].at.getTime() - sorted[i - 1].at.getTime()) / 86400_000)
    gaps.sort((a, b) => a - b)
    const median = gaps[Math.floor(gaps.length / 2)] ?? 14
    const cadenceDays = Math.max(3, Math.min(Math.round(median), 60))
    // Longest member is usually the most explicit phrasing.
    const patternText = [...cluster.members].sort((a, b) => b.text.length - a.text.length)[0].text
    candidates.push({
      patternText: patternText.slice(0, 400),
      exampleCount: cluster.members.length,
      cadenceDays,
      lastSeenAt: sorted[sorted.length - 1].at,
    })
  }
  return candidates
}

// ---- Agent API tokens ----

export function hashToken(raw: string): string {
  return createHash('sha256').update(`oa-agent-token:${raw}`).digest('hex')
}

export function parseScopes(scopesJson: string): string[] {
  try {
    const v = JSON.parse(scopesJson)
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function scopeAllows(scopesJson: string, needed: string): boolean {
  const scopes = parseScopes(scopesJson)
  return scopes.includes(needed)
}
