export type ConnectorStatus = 'connected' | 'degraded' | 'down'
export type ConnectorAlertSeverity = 'info' | 'warning' | 'critical'

export interface ConnectorHealthAlert {
  code: string
  severity: ConnectorAlertSeverity
  message: string
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
