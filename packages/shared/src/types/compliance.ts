// Compliance mode types for SOC2/HIPAA
export interface ComplianceMode {
  id: string
  userId: string
  standard: 'soc2' | 'hipaa' | 'gdpr' | 'custom'
  enabled: boolean
  settings: ComplianceSettings
  auditLogRetentionDays: number
  createdAt: string
  updatedAt: string
}

export interface ComplianceSettings {
  // Data residency
  dataResidencyRegion: string
  allowCrossBorderTransfer: boolean
  
  // Access controls
  requireMfa: boolean
  sessionTimeoutMinutes: number
  ipAllowlist?: string[]
  
  // Audit & logging
  logAllAccess: boolean
  logDataExports: boolean
  immutableAuditLog: boolean
  
  // Data handling
  encryptAtRest: boolean
  encryptInTransit: boolean
  piiDetectionEnabled: boolean
  automaticPiiRedaction: boolean
  
  // Retention
  retentionPolicyDays: number
  autoDeleteAfterRetention: boolean
  
  // Consent
  requireConsentForDataCollection: boolean
  consentTrackingEnabled: boolean
}

export interface ComplianceAuditEntry {
  id: string
  userId: string
  action: string
  resourceType: string
  resourceId: string
  ipAddress: string
  userAgent: string
  metadata: Record<string, unknown>
  complianceTags: string[]
  timestamp: string
}

export interface DataSubjectRequest {
  id: string
  userId: string
  type: 'access' | 'deletion' | 'correction' | 'portability'
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  requestedAt: string
  completedAt?: string
  dataIncluded: string[]
}

export interface ComplianceReport {
  id: string
  userId: string
  standard: string
  periodStart: string
  periodEnd: string
  metrics: ComplianceMetrics
  generatedAt: string
}

export interface ComplianceMetrics {
  totalAccessEvents: number
  totalDataExports: number
  totalDeletions: number
  averageResponseTimeHours: number
  incidentsDetected: number
  incidentsResolved: number
  complianceScore: number
}
