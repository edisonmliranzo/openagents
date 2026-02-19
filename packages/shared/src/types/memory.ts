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
