// Anomaly detection types for agent behavior monitoring
export interface AnomalyDetection {
  id: string
  userId: string
  type: AnomalyType
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'detected' | 'investigating' | 'resolved' | 'false_positive'
  description: string
  metrics: AnomalyMetrics
  recommendations: string[]
  detectedAt: string
  resolvedAt?: string
}

export type AnomalyType =
  | 'excessive_tool_calls'
  | 'cost_spike'
  | 'repeated_failures'
  | 'unusual_token_usage'
  | 'approval_rate_drop'
  | 'response_time_degradation'
  | 'auth_anomaly'
  | 'resource_exhaustion'

export interface AnomalyMetrics {
  actualValue: number
  expectedRange: { min: number; max: number }
  deviation: number
  percentile: number
  historicalAverage: number
}

export interface AnomalyAlert {
  id: string
  userId: string
  anomalyId: string
  channel: 'email' | 'slack' | 'discord' | 'webhook' | 'in_app'
  target: string
  enabled: boolean
  threshold: number
  createdAt: string
}

export interface AnomalyConfig {
  userId: string
  enabled: boolean
  sensitivity: 'low' | 'medium' | 'high'
  alertChannels: string[]
  ignoredPatterns: string[]
  baselineWindowDays: number
}
