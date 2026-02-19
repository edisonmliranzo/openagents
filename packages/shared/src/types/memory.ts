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
