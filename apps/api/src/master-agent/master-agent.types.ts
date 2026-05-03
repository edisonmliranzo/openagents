export type AgentIntent =
  | 'coding'
  | 'video_generation'
  | 'image_generation'
  | 'voiceover'
  | 'music_generation'
  | 'content_creation'
  | 'research'
  | 'business_strategy'
  | 'app_builder'
  | 'website_builder'
  | 'ecommerce'
  | 'customer_support'
  | 'automation'
  | 'social_media'
  | 'document_creation'
  | 'email'
  | 'calendar'
  | 'trading'
  | 'unknown'

export type RiskLevel = 'low' | 'medium' | 'high'

export type UploadedFileType = 'image' | 'video' | 'audio' | 'pdf' | 'code' | 'csv' | 'other'

export interface UploadedFile {
  type: UploadedFileType
  filename?: string
  url?: string
  description?: string
}

export interface AgentActionPlan {
  intent: AgentIntent
  confidence: number
  userGoal: string
  workflow: string
  requiredTools: string[]
  missingInputs: string[]
  riskLevel: RiskLevel
  needsApproval: boolean
  approvalReasons: string[]
  steps: string[]
  expectedOutput: string[]
  suggestedNextAction: string
  fileActions: string[]
  availableWorkflows: string[]
}

export interface IntentDetectionResult {
  intent: AgentIntent
  confidence: number
  reasoning: string
  alternativeIntents: Array<{ intent: AgentIntent; confidence: number }>
}

export interface WorkflowInfo {
  id: string
  name: string
  description: string
  intents: AgentIntent[]
  endpoint: string
}
