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
  tags: string[]
  piiRedacted: boolean
  confidence: number
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
  createdAt: string
  updatedAt: string
}

export interface WriteMemoryEventInput {
  kind: MemoryEventKind
  summary: string
  payload?: Record<string, unknown>
  tags?: string[]
  piiRedacted?: boolean
  confidence?: number
}

export interface UpsertMemoryFactInput {
  entity: string
  key: string
  value: string
  sourceRef?: string
  confidence?: number
}

export interface QueryMemoryInput {
  query: string
  limit?: number
  includeFacts?: boolean
  tags?: string[]
}

export interface QueryMemoryResult {
  events: MemoryEvent[]
  facts: MemoryFact[]
  queriedAt: string
}
