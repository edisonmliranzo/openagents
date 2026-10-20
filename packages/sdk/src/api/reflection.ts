import type { OpenAgentsClient } from '../client'

export interface ReflectionResult {
  userId: string
  skipped: boolean
  facts: number
  events: number
  reason?: string
}

export interface LessonRow {
  id: string
  text: string
  score: number
  kind: 'do' | 'avoid' | 'preference'
  enabled: boolean
  conversationId?: string
  createdAt: string
}

export interface LessonRunRow {
  conversationId: string
  score: number
  summary: string
  at: string
}

export interface LessonsListResponse {
  lessons: LessonRow[]
  runs: LessonRunRow[]
  averageScore: number | null
}

export function createReflectionApi(client: OpenAgentsClient) {
  return {
    run: () => client.post<ReflectionResult>('/api/v1/reflection/run'),
    lessons: {
      list: () => client.get<LessonsListResponse>('/api/v1/reflection/lessons'),
      preview: () => client.get<{ block: string }>('/api/v1/reflection/lessons/preview'),
      reflect: (conversationId?: string) =>
        client.post<{ score?: number; summary?: string; added?: LessonRow[]; skipped?: boolean }>(
          '/api/v1/reflection/lessons/reflect',
          conversationId ? { conversationId } : {},
        ),
      toggle: (id: string, enabled?: boolean) =>
        client.patch<LessonRow>(`/api/v1/reflection/lessons/${encodeURIComponent(id)}/toggle`, enabled !== undefined ? { enabled } : {}),
      remove: (id: string) =>
        client.delete<{ deleted: boolean }>(`/api/v1/reflection/lessons/${encodeURIComponent(id)}`),
    },
  }
}
