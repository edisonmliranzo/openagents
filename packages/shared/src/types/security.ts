/**
 * Security and Audit Types for OpenAgents Platform
 */

/**
 * Audit event severity levels
 */
export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Audit event categories
 */
export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  CONFIGURATION = 'configuration',
  SECURITY = 'security',
  SYSTEM = 'system',
  COMPLIANCE = 'compliance',
}

/**
 * Audit event structure
 */
export interface AuditEvent {
  category: AuditCategory
  action: string
  resource: string
  severity: AuditSeverity
  description: string
  ipAddress?: string
  userAgent?: string
  timestamp?: Date
}

/**
 * Encryption result structure
 */
export interface EncryptionResult {
  encrypted: string
  iv: string
  authTag?: string
}

/**
 * Security scan result
 */
export interface SecurityScanResult {
  id: string
  timestamp: Date
  status: 'passed' | 'failed' | 'warning'
  checks: SecurityCheck[]
  overallScore: number
  recommendations: string[]
}

/**
 * Individual security check
 */
export interface SecurityCheck {
  id: string
  name: string
  description: string
  status: 'passed' | 'failed' | 'warning' | 'skipped'
  severity: AuditSeverity
  details?: string
  remediation?: string
}

/**
 * Compliance framework types
 */
export enum ComplianceFramework {
  SOC2 = 'soc2',
  GDPR = 'gdpr',
  HIPAA = 'hipaa',
  ISO27001 = 'iso27001',
  PCI_DSS = 'pci_dss',
}

/**
 * Compliance requirement status
 */
export interface ComplianceRequirement {
  id: string
  framework: ComplianceFramework
  requirementId: string
  name: string
  description: string
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_applicable'
  evidence?: string[]
  lastReviewed: Date
  nextReview: Date
}

/**
 * Data classification levels
 */
export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
}

/**
 * Access control policy
 */
export interface AccessControlPolicy {
  id: string
  name: string
  description: string
  resourceType: string
  permissions: Permission[]
  conditions: PolicyCondition[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Permission definition
 */
export interface Permission {
  action: 'read' | 'write' | 'delete' | 'execute' | 'admin'
  effect: 'allow' | 'deny'
  principal: string
  resource: string
}

/**
 * Policy condition for access control
 */
export interface PolicyCondition {
  attribute: string
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than'
  value: any
}

/**
 * Security incident structure
 */
export interface SecurityIncident {
  id: string
  title: string
  description: string
  severity: AuditSeverity
  status: 'open' | 'investigating' | 'resolved' | 'closed'
  type: string
  affectedResources: string[]
  detectedAt: Date
  resolvedAt?: Date
  assignedTo?: string
  evidence: IncidentEvidence[]
}

/**
 * Incident evidence
 */
export interface IncidentEvidence {
  id: string
  type: string
  data: string
  collectedAt: Date
  collectedBy: string
}

/**
 * Vulnerability assessment result
 */
export interface VulnerabilityAssessment {
  id: string
  timestamp: Date
  target: string
  vulnerabilities: Vulnerability[]
  riskScore: number
  summary: VulnerabilitySummary
}

/**
 * Individual vulnerability
 */
export interface Vulnerability {
  id: string
  cveId?: string
  title: string
  description: string
  severity: AuditSeverity
  cvssScore: number
  affectedComponent: string
  remediation?: string
  status: 'open' | 'fixed' | 'mitigated' | 'accepted'
}

/**
 * Vulnerability summary
 */
export interface VulnerabilitySummary {
  critical: number
  high: number
  medium: number
  low: number
  total: number
}

/**
 * API key structure
 */
export interface ApiKey {
  id: string
  name: string
  keyHash: string
  encryptedKey: string
  permissions: string[]
  expiresAt?: Date
  lastUsedAt?: Date
  createdAt: Date
  createdBy: string
  isActive: boolean
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

/**
 * Security headers configuration
 */
export interface SecurityHeaders {
  contentSecurityPolicy?: string
  strictTransportSecurity?: string
  xFrameOptions?: string
  xContentTypeOptions?: string
  xXssProtection?: string
  referrerPolicy?: string
}