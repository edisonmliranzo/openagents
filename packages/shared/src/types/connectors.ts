export type ConnectorStatus = 'connected' | 'degraded' | 'down'
export type ConnectorAlertSeverity = 'info' | 'warning' | 'critical'

export interface ConnectorHealthAlert {
  code: string
  severity: ConnectorAlertSeverity
  message: string
}

export type ConnectorToolAccessStatus = 'available' | 'blocked'
export type ConnectorToolAccessMode = 'read' | 'write'

export interface ConnectorToolAccess {
  toolName: string
  displayName: string
  requiresApproval: boolean
  mode: ConnectorToolAccessMode
  status: ConnectorToolAccessStatus
  requiredScopes: string[]
  missingScopes: string[]
  summary: string
}

export interface ConnectorScopeDiagnostics {
  connectorId: string
  recommendedScopes: string[]
  grantedScopes: string[]
  missingScopes: string[]
  availableTools: string[]
  blockedTools: string[]
  hasRefreshToken: boolean
  tokenExpired: boolean
  toolAccess: ConnectorToolAccess[]
  summary: string
}

export interface ConnectorHealthEntry {
  connectorId: string
  displayName: string
  status: ConnectorStatus
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastError: string | null
  tokenExpiresAt: string | null
  p95LatencyMs: number | null
  rateLimitHits: number
  failureStreak: number
  alerts: ConnectorHealthAlert[]
  updatedAt: string
}

export interface ConnectorHealthSnapshot {
  connectors: ConnectorHealthEntry[]
  generatedAt: string
}

export interface RecordConnectorHealthInput {
  connectorId: string
  success: boolean
  latencyMs?: number
  error?: string
  tokenExpiresAt?: string
  rateLimited?: boolean
  metadata?: Record<string, unknown>
}

export interface ReconnectConnectorResult {
  connector: ConnectorHealthEntry
  reconnectedAt: string
}

export interface SaveConnectorConnectionInput {
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: string
  scopes?: string[]
  accountEmail?: string
}

export interface ConnectorConnection {
  connectorId: string
  connected: boolean
  accountEmail: string | null
  scopes: string[]
  tokenExpiresAt: string | null
  connectedAt: string | null
  updatedAt: string | null
  toolNames: string[]
  diagnostics: ConnectorScopeDiagnostics | null
}

export interface ConnectorConnectionResult {
  connector: ConnectorHealthEntry
  connection: ConnectorConnection
}
