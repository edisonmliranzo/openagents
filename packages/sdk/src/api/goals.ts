import type { OpenAgentsClient } from '../client'

export interface MuseGoalMilestone {
  id: string
  title: string
  completed: boolean
  completedAt?: string
}

export interface MuseGoal {
  id: string
  userId: string
  title: string
  description: string
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  priority: 'low' | 'medium' | 'high' | 'critical'
  milestones: MuseGoalMilestone[]
  progress: number
  conversationIds: string[]
  tags: string[]
  dueDate?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface CreateMuseGoalInput {
  title: string
  description: string
  priority?: MuseGoal['priority']
  milestones?: string[]
  tags?: string[]
  dueDate?: string
}

export function createGoalsApi(client: OpenAgentsClient) {
  return {
    list: (status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ''
      return client.get<MuseGoal[]>(`/api/v1/goals${qs}`)
    },

    get: (id: string) => client.get<MuseGoal>(`/api/v1/goals/${id}`),

    create: (input: CreateMuseGoalInput) =>
      client.post<MuseGoal>('/api/v1/goals', input),

    update: (id: string, input: Partial<Pick<MuseGoal, 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'tags'>>) =>
      client.patch<MuseGoal>(`/api/v1/goals/${id}`, input),

    completeMilestone: (id: string, milestoneId: string) =>
      client.post<MuseGoal>(`/api/v1/goals/${id}/milestones/${milestoneId}/complete`),

    linkConversation: (id: string, conversationId: string) =>
      client.post<void>(`/api/v1/goals/${id}/link/${conversationId}`),

    remove: (id: string) => client.delete<boolean>(`/api/v1/goals/${id}`),
  }
}
