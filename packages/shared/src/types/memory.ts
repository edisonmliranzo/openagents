export type MemoryType = 'fact' | 'preference' | 'summary'

export interface MemoryEntry {
  id: string
  userId: string
  type: MemoryType
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface MemoryFileSummary {
  name: string
  size: number
  updatedAt: string
  readonly: boolean
}

export interface MemoryFileDocument extends MemoryFileSummary {
  content: string
}

export interface BrowserCaptureInput {
  url: string
  title?: string
  selection: string
  note?: string
  conversationId?: string
}

export interface BrowserCaptureResult {
  capturedAt: string
  memory: MemoryEntry
  conversationId: string | null
  conversationMessageId: string | null
}

export type MemoryEventKind = 'conversation' | 'workflow' | 'incident' | 'extraction' | 'note'

export interface MemoryEvent {
  id: string
  userId: string
  kind: MemoryEventKind
  summary: string
  payload: Record<string, unknown> | null
  sourceRef: string | null
  tags: string[]
  piiRedacted: boolean
  confidence: number
  effectiveConfidence?: number
  freshUntil: string | null
  conflictGroup: string | null
  reinforcedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MemoryFact {
  id: string
  userId: string
  entity: string
  key: string
  value: string
  sourceRef: string | null
  confidence: number
  effectiveConfidence?: number
  freshUntil: string | null
  conflictGroup: string | null
  reinforcedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WriteMemoryEventInput {
  kind: MemoryEventKind
  summary: string
  payload?: Record<string, unknown>
  sourceRef?: string
  tags?: string[]
  piiRedacted?: boolean
  confidence?: number
  freshUntil?: string
  freshnessHours?: number
  conflictGroup?: string
}

export interface UpsertMemoryFactInput {
  entity: string
  key: string
  value: string
  sourceRef?: string
  confidence?: number
  freshUntil?: string
  freshnessHours?: number
  conflictGroup?: string
  reinforce?: boolean
}

export interface QueryMemoryInput {
  query: string
  limit?: number
  includeFacts?: boolean
  tags?: string[]
  minConfidence?: number
  includeConflicts?: boolean
  diversify?: boolean
  temporalDecayDays?: number
}

export interface QueryMemoryStrategy {
  diversify: boolean
  temporalDecayDays: number
  eventMatches: number
  factMatches: number
}

export interface MemoryConflict {
  id: string
  userId: string
  entity: string
  key: string
  existingValue: string
  incomingValue: string
  existingSourceRef: string | null
  incomingSourceRef: string | null
  status: 'open' | 'resolved' | 'ignored'
  severity: 'low' | 'medium' | 'high'
  confidenceDelta: number
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface MemoryReviewItem {
  id: string
  type: 'event' | 'fact'
  reason: 'low_confidence' | 'stale' | 'conflict'
  confidence: number
  summary: string
  updatedAt: string
}

export interface QueryMemoryResult {
  events: MemoryEvent[]
  facts: MemoryFact[]
  conflicts?: MemoryConflict[]
  reviewQueue?: MemoryReviewItem[]
  strategy: QueryMemoryStrategy
  queriedAt: string
}

export type LocalKnowledgeSourceKind = 'file' | 'folder' | 'repo'

export interface LocalKnowledgeSource {
  id: string
  userId: string
  path: string
  kind: LocalKnowledgeSourceKind
  includeGlobs: string[]
  maxFiles: number
  status: 'active' | 'error'
  lastSyncedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateLocalKnowledgeSourceInput {
  path: string
  kind?: LocalKnowledgeSourceKind
  includeGlobs?: string[]
  maxFiles?: number
}

export interface LocalKnowledgeSyncResult {
  source: LocalKnowledgeSource
  syncedFiles: number
  createdEvents: number
  warnings: string[]
  syncedAt: string
}
