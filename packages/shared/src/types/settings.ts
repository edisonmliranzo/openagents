export interface UserSettings {
  id: string
  userId: string
  preferredProvider: string
  preferredModel: string
  customSystemPrompt: string | null
  lastActiveConversationId: string | null
  beginnerMode: boolean
  onboardingCompletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateSettingsDto {
  preferredProvider?: string
  preferredModel?: string
  customSystemPrompt?: string | null
  lastActiveConversationId?: string | null
  beginnerMode?: boolean
  onboardingCompletedAt?: string | null
}

export interface LlmApiKey {
  id: string
  userId: string
  provider: string
  apiKey: string | null   // masked (last 4 chars only) in API responses
  baseUrl: string | null
  loginEmail: string | null
  loginPassword: string | null // masked (last 4 chars only) in API responses
  subscriptionPlan: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface UpsertLlmKeyDto {
  apiKey?: string
  baseUrl?: string
  loginEmail?: string
  loginPassword?: string
  subscriptionPlan?: string
  isActive?: boolean
}
