import type { ChannelRuntimeStatus } from './channels'
import type { SystemCostBreakdown } from './system'
import type { UserRole } from './user'

export type PlatformPlanId = 'free' | 'pro' | 'team'
export type PlatformTemplateRequiredPlan = PlatformPlanId
export type PlatformChannelId = 'web' | 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'email'
export type PlatformNodeStatus = 'healthy' | 'degraded' | 'offline'

export interface PlatformFeatureGate {
  id: string
  label: string
  enabled: boolean
  reason?: string
}

export interface PlatformQuota {
  id: string
  label: string
  unit: string
  limit: number | null
  used: number
  remaining: number | null
}

export interface PlatformSubscriptionSnapshot {
  planId: PlatformPlanId
  planLabel: string
  priceUsdMonthly: number
  currency: 'USD'
  renewsAt: string | null
  updatedAt: string
  featureGates: PlatformFeatureGate[]
  quotas: PlatformQuota[]
}

export interface PlatformSetPlanInput {
  planId: PlatformPlanId
}

export interface PlatformTemplateIncludes {
  marketplacePacks: string[]
  starterGoals: string[]
  recommendedTools: string[]
}

export interface PlatformTemplate {
  id: string
  title: string
  description: string
  category: string
  channels: PlatformChannelId[]
  requiredPlan: PlatformTemplateRequiredPlan
  includes: PlatformTemplateIncludes
  installed: boolean
  installedAt?: string
}

export interface PlatformTemplateInstallResult {
  templateId: string
  installedAt: string
  installedPacks: string[]
  createdGoals: string[]
  subscription: PlatformSubscriptionSnapshot
}

export interface PlatformFleetNode {
  id: string
  label: string
  kind: 'api' | 'runtime' | 'scheduler' | 'channel' | 'control'
  status: PlatformNodeStatus
  details: string
  updatedAt: string
  metrics: Record<string, number | string | null>
}

export interface PlatformFleetSnapshot {
  generatedAt: string
  summary: {
    nodes: number
    healthy: number
    degraded: number
    offline: number
    activeSessions: number
    pendingApprovals: number
    staleCronJobs: number
    failingCronJobs: number
  }
  nodes: PlatformFleetNode[]
}

export interface PlatformEvalSuite {
  id: string
  title: string
  description: string
  provider: 'ollama'
  prompts: number
}

export interface PlatformEvalRunInput {
  suiteId: string
  baseUrl?: string
  models?: string[]
  rounds?: number
}

export interface PlatformEvalModelScore {
  model: string
  avgScore: number
  avgLatencyMs: number
  p95LatencyMs: number
  passRate: number
  errors: number
  rank: number
}

export interface PlatformEvalRunResult {
  runId: string
  suiteId: string
  generatedAt: string
  provider: 'ollama'
  baseUrl: string
  rounds: number
  models: PlatformEvalModelScore[]
}

export interface PlatformBillingChannelRow {
  channelId: PlatformChannelId
  channelLabel: string
  conversations: number
  messages: number
  estimatedCostUsd: number
}

export interface PlatformBillingTotals {
  llmAndToolUsd: number
  channelTransportUsd: number
  estimatedInvoiceUsd: number
}

export interface PlatformBillingSnapshot {
  generatedAt: string
  rangeStart: string
  rangeEnd: string
  llmAndTool: SystemCostBreakdown
  channels: PlatformBillingChannelRow[]
  totals: PlatformBillingTotals
  subscription: PlatformSubscriptionSnapshot
}

export interface PlatformInboxThread {
  conversationId: string
  channelId: PlatformChannelId
  channelLabel: string
  sessionLabel: string | null
  title: string
  lastRole: 'user' | 'agent' | 'tool' | 'system' | null
  lastMessagePreview: string | null
  updatedAt: string
  linkedDeviceLabel: string | null
}

export interface PlatformInboxChannelSummary {
  channelId: PlatformChannelId
  channelLabel: string
  status: ChannelRuntimeStatus
  threads: number
}

export interface PlatformInboxSnapshot {
  generatedAt: string
  channels: PlatformInboxChannelSummary[]
  threads: PlatformInboxThread[]
}

export interface PlatformAdminDailyPoint {
  date: string
  newUsers: number
  newDevices: number
  activeDevices: number
}

export interface PlatformAdminRecentDevice {
  id: string
  userId: string
  email: string
  role: UserRole
  userAgent: string | null
  ipAddress: string | null
  firstSeenAt: string
  lastSeenAt: string
  loginCount: number
}

export interface PlatformAdminTopUser {
  userId: string
  email: string
  role: UserRole
  devices: number
  loginEvents: number
  lastSeenAt: string | null
}

export interface PlatformAdminOverviewSnapshot {
  generatedAt: string
  viewer: {
    id: string
    email: string
    role: UserRole
  }
  totals: {
    totalUsers: number
    owners: number
    admins: number
    members: number
    newUsers30d: number
    activeUsers30d: number
    totalConversations: number
    totalMessages: number
    pendingApprovals: number
    trackedDevices: number
    newDevices30d: number
    activeDevices30d: number
    totalDeviceLoginEvents: number
    linkedWhatsAppDevices: number
    mappedDomains: number
    llmKeysConfigured: number
  }
  daily: PlatformAdminDailyPoint[]
  topUsers: PlatformAdminTopUser[]
  recentDevices: PlatformAdminRecentDevice[]
}
