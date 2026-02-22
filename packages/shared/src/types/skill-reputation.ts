export type SkillTrustBadge = 'trusted' | 'stable' | 'at_risk'

export interface SkillReputationEvent {
  id: string
  skillId: string
  userId: string
  success: boolean
  source: string
  runId?: string
  conversationId?: string
  createdAt: string
}

export interface SkillReputationEntry {
  skillId: string
  title: string
  enabled: boolean
  totalRuns: number
  successRuns: number
  failedRuns: number
  successRate: number
  sevenDaySuccessRate: number
  lastFailureAt: string | null
  score: number
  badge: SkillTrustBadge
}

export interface RecordSkillReputationInput {
  skillIds: string[]
  success: boolean
  source: string
  runId?: string
  conversationId?: string
}
