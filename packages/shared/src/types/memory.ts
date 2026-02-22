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
