/**
 * Pure helpers for the autonomy module. No I/O so they are unit-testable.
 */

export interface MissionLike {
  status: string
  intervalHours: number
  lastRunAt: Date | null
  nextRunAt: Date | null
}

/** A mission is due when it is active and its nextRunAt has passed (or was never set). */
export function isMissionDue(mission: MissionLike, now: Date = new Date()): boolean {
  if (mission.status !== 'active') return false
  const interval = Math.max(1, Math.min(Number(mission.intervalHours) || 24, 24 * 30))
  if (!mission.nextRunAt) return true
  return mission.nextRunAt.getTime() <= now.getTime()
}

export function nextRunAfter(now: Date = new Date(), intervalHours: number): Date {
  const hours = Math.max(1, Math.min(Number(intervalHours) || 24, 24 * 30))
  return new Date(now.getTime() + hours * 3600_000)
}

/**
 * Compensation map: how to revert a side-effecting tool call.
 * Extracts identifiers from the recorded output and returns the reverting
 * call, or null when the action cannot be automatically reverted.
 */
export interface CompensatingCall {
  tool: string
  input: Record<string, unknown>
}

export function planCompensation(tool: string, input: Record<string, unknown>, output: unknown): CompensatingCall | null {
  const out = typeof output === 'string' ? tryParse(output) : output
  const rec = (out && typeof out === 'object' && !Array.isArray(out) ? out : {}) as Record<string, unknown>
  const id = rec.id ?? rec.noteId ?? rec.eventId ?? rec.artifactId ?? rec.documentId
  switch (tool) {
    case 'notes_create':
    case 'notes_update':
      return typeof id === 'string' ? { tool: 'notes_delete', input: { id } } : null
    case 'artifacts_create':
    case 'artifact_create':
      return typeof id === 'string' ? { tool: 'artifacts_delete', input: { id } } : null
    case 'calendar_create_event':
      return typeof id === 'string' ? { tool: 'calendar_delete_event', input: { eventId: id } } : null
    case 'memory_write':
    case 'memory_upsert':
      return typeof id === 'string' ? { tool: 'memory_delete', input: { id } } : null
    case 'library_upload':
    case 'library_add_document':
      return typeof id === 'string' ? { tool: 'library_delete_document', input: { id } } : null
    default:
      return null
  }
}

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Merge LLM-extracted entities/relations into graph node/edge lists.
 * Pure: returns new structures, callers persist them.
 */
export interface ExtractedEntity {
  name: string
  type: string
  summary?: string
}

export interface ExtractedRelation {
  from: string
  to: string
  relation: string
}

export interface GraphMergeResult {
  nodes: ExtractedEntity[]
  edges: ExtractedRelation[]
}

const ENTITY_TYPES = new Set(['person', 'company', 'project', 'topic', 'place', 'other'])

export function normalizeEntityType(raw: string): string {
  const t = String(raw ?? '').trim().toLowerCase()
  return ENTITY_TYPES.has(t) ? t : 'other'
}

export function normalizeEntityName(raw: string): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
}

export function mergeGraph(entities: ExtractedEntity[], relations: ExtractedRelation[]): GraphMergeResult {
  const byKey = new Map<string, ExtractedEntity>()
  for (const e of entities) {
    const name = normalizeEntityName(e?.name)
    if (!name) continue
    const type = normalizeEntityType(e?.type)
    const key = `${type}:${name.toLowerCase()}`
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.summary && e.summary) existing.summary = String(e.summary).slice(0, 400)
    } else {
      byKey.set(key, { name, type, summary: String(e?.summary ?? '').slice(0, 400) })
    }
  }

  const nameIndex = new Map<string, string>()
  for (const e of byKey.values()) nameIndex.set(e.name.toLowerCase(), e.name)

  const edgeMap = new Map<string, ExtractedRelation>()
  for (const r of relations) {
    const from = nameIndex.get(normalizeEntityName(r?.from).toLowerCase())
    const to = nameIndex.get(normalizeEntityName(r?.to).toLowerCase())
    const relation = normalizeEntityName(r?.relation).toLowerCase().slice(0, 60)
    if (!from || !to || !relation || from === to) continue
    const key = `${from}=>${to}:${relation}`
    if (!edgeMap.has(key)) edgeMap.set(key, { from, to, relation })
  }

  return { nodes: [...byKey.values()], edges: [...edgeMap.values()] }
}
