import type { OpenAgentsClient } from '../client'

export interface SkillSuggestionRow {
  id: string
  userId: string
  name: string
  description: string
  steps: string // JSON array
  tags: string // JSON array
  sourcePattern: string | null
  status: 'pending' | 'approved' | 'dismissed'
  createdAt: string
  updatedAt: string
}

export interface UserSkillRow {
  id: string
  userId: string
  name: string
  description: string
  steps: string
  toolsUsed: string
  tags: string
  triggerPhrase: string | null
  timesUsed: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export function createLearningApi(client: OpenAgentsClient) {
  return {
    stats: () => client.get<Record<string, unknown>>('/api/v1/learning/stats'),

    listSuggestions: (status: 'pending' | 'approved' | 'dismissed' = 'pending') =>
      client.get<SkillSuggestionRow[]>(`/api/v1/learning/suggestions?status=${status}`),

    generateSuggestions: () =>
      client.post<SkillSuggestionRow[]>('/api/v1/learning/suggestions/generate'),

    approveSuggestion: (id: string) =>
      client.post<UserSkillRow>(`/api/v1/learning/suggestions/${id}/approve`),

    dismissSuggestion: (id: string) =>
      client.post<SkillSuggestionRow>(`/api/v1/learning/suggestions/${id}/dismiss`),
  }
}
