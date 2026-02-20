export type AgentFeatureId =
  | 'voice_mode'
  | 'goal_board'
  | 'autonomous_followups'
  | 'memory_controls'
  | 'decision_journal'
  | 'skill_marketplace'
  | 'simulation_sandbox'
  | 'multi_provider_failover'
  | 'tool_permissions_scope'
  | 'conversation_project_mode'
  | 'persona_presets'
  | 'realtime_observability'
  | 'self_healing_runs'
  | 'smart_code_actions'
  | 'safety_tiers'
  | 'benchmark_lab'
  | 'daily_briefings'
  | 'web_knowledge_pack'
  | 'team_mode'
  | 'mobile_companion'

export type AgentFeatureMaturity = 'planned' | 'foundation' | 'active'
export type AgentSafetyTier = 'strict' | 'balanced' | 'fast'
export type AgentGoalStatus = 'todo' | 'doing' | 'blocked' | 'done'
export type AgentGoalPriority = 'low' | 'medium' | 'high' | 'critical'

export interface AgentFeatureState {
  id: AgentFeatureId
  title: string
  description: string
  maturity: AgentFeatureMaturity
  enabled: boolean
}

export interface AgentGoal {
  id: string
  title: string
  details?: string
  status: AgentGoalStatus
  priority: AgentGoalPriority
  createdAt: string
  updatedAt: string
}

export interface AgentDecisionJournalEntry {
  id: string
  summary: string
  options: string[]
  risk: 'low' | 'medium' | 'high'
  confidence: number
  selected: string
  createdAt: string
}

export interface AgentLabsSnapshot {
  updatedAt: string
  safetyTier: AgentSafetyTier
  features: AgentFeatureState[]
  goals: AgentGoal[]
  decisionJournal: AgentDecisionJournalEntry[]
}

export interface AgentBriefing {
  generatedAt: string
  summary: string
  topGoals: AgentGoal[]
  blockedGoals: AgentGoal[]
  recommendations: string[]
}

export interface CreateGoalInput {
  title: string
  details?: string
  priority?: AgentGoalPriority
}

export interface UpdateGoalInput {
  title?: string
  details?: string
  priority?: AgentGoalPriority
  status?: AgentGoalStatus
}

export interface ToggleFeatureInput {
  enabled: boolean
}

export interface SetSafetyTierInput {
  safetyTier: AgentSafetyTier
}

