import type { OpenAgentsClient } from '../client'

export interface OpenAgentsGoalMilestone {
  id: string
  title: string
  completed: boolean
  completedAt?: string
}

export interface OpenAgentsGoal {
  id: string
  userId: string
  title: string
  description: string
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  priority: 'low' | 'medium' | 'high' | 'critical'
  milestones: OpenAgentsGoalMilestone[]
  progress: number
  conversationIds: string[]
  tags: string[]
  dueDate?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type MuseGoalMilestone = OpenAgentsGoalMilestone
export type MuseGoal = OpenAgentsGoal

export interface CreateOpenAgentsGoalInput {
  title: string
  description: string
  priority?: OpenAgentsGoal['priority']
  milestones?: string[]
  tags?: string[]
  dueDate?: string
}

export type CreateMuseGoalInput = CreateOpenAgentsGoalInput

export type PlanStepStatus = 'pending' | 'awaiting_approval' | 'done' | 'skipped'

export interface PlanStep {
  id: string
  title: string
  detail: string
  risky: boolean
  status: PlanStepStatus
  output?: string
  updatedAt?: string
}

export interface GoalPlan {
  goalId: string
  createdAt: string
  steps: PlanStep[]
  autoAdvance: boolean
  lastAdvancedDay?: string
  lastWeeklySummaryAt?: string
}

export interface GoalProgressLogEntry {
  id: string
  goalId: string
  at: string
  kind: 'plan' | 'advance' | 'approval_requested' | 'approved' | 'rejected' | 'weekly_summary' | 'error'
  message: string
}

export function createGoalsApi(client: OpenAgentsClient) {
  return {
    list: (status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ''
      return client.get<OpenAgentsGoal[]>(`/api/v1/goals${qs}`)
    },

    get: (id: string) => client.get<OpenAgentsGoal>(`/api/v1/goals/${id}`),

    create: (input: CreateOpenAgentsGoalInput) =>
      client.post<OpenAgentsGoal>('/api/v1/goals', input),

    update: (id: string, input: Partial<Pick<OpenAgentsGoal, 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'tags'>>) =>
      client.patch<OpenAgentsGoal>(`/api/v1/goals/${id}`, input),

    completeMilestone: (id: string, milestoneId: string) =>
      client.post<OpenAgentsGoal>(`/api/v1/goals/${id}/milestones/${milestoneId}/complete`),

    linkConversation: (id: string, conversationId: string) =>
      client.post<void>(`/api/v1/goals/${id}/link/${conversationId}`),

    remove: (id: string) => client.delete<boolean>(`/api/v1/goals/${id}`),

    getPlan: (id: string) =>
      client.get<{ plan: GoalPlan | null; log: GoalProgressLogEntry[] }>(`/api/v1/goals/${encodeURIComponent(id)}/plan`),

    generatePlan: (id: string) =>
      client.post<{ plan: GoalPlan | null; log: GoalProgressLogEntry[] }>(`/api/v1/goals/${encodeURIComponent(id)}/plan`),

    setAutoAdvance: (id: string, autoAdvance: boolean) =>
      client.put<GoalPlan>(`/api/v1/goals/${encodeURIComponent(id)}/plan/auto-advance`, { autoAdvance }),

    advanceStep: (id: string) =>
      client.post<{ plan: GoalPlan; message: string }>(`/api/v1/goals/${encodeURIComponent(id)}/plan/step`),

    decideStep: (id: string, stepId: string, approve: boolean) =>
      client.post<{ plan: GoalPlan }>(`/api/v1/goals/${encodeURIComponent(id)}/plan/steps/${encodeURIComponent(stepId)}/decide`, { approve }),

    getProgressLog: (limit = 100) =>
      client.get<GoalProgressLogEntry[]>(`/api/v1/goals/progress/log?limit=${limit}`),
  }
}
