export type ExtractionSourceKind = 'pdf' | 'email' | 'web' | 'text'
export type ExtractionStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'needs_review'

export interface CreateExtractionJobInput {
  sourceKind: ExtractionSourceKind
  sourceUri: string
  schemaVersion: string
  schema: Record<string, unknown>
  options?: Record<string, unknown>
}

export interface ExtractionValidationIssue {
  path: string
  message: string
  level: 'warning' | 'error'
}

export interface ExtractionJob {
  id: string
  userId: string
  sourceKind: ExtractionSourceKind
  sourceUri: string
  schemaVersion: string
  status: ExtractionStatus
  outputJson: Record<string, unknown> | null
  confidence: number
  reviewerStatus: 'pending' | 'approved' | 'rejected' | null
  failureReason: string | null
  validationIssues: ExtractionValidationIssue[]
  createdAt: string
  updatedAt: string
}
