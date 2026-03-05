export type CiFailureClass =
  | 'flake'
  | 'test_failure'
  | 'build_failure'
  | 'dependency_failure'
  | 'environment_failure'
  | 'unknown'

export type CiIncidentStatus =
  | 'queued'
  | 'analyzing'
  | 'auto_retrying'
  | 'patch_proposed'
  | 'resolved'
  | 'failed'

export interface CreateCiIncidentInput {
  userId: string
  provider: string
  repo: string
  branch?: string
  pipelineId?: string
  jobName?: string
  commitSha?: string
  logExcerpt?: string
  artifactUrls?: string[]
  metadata?: Record<string, unknown>
}

export interface CiIncident {
  id: string
  userId: string
  provider: string
  repo: string
  branch: string | null
  pipelineId: string | null
  jobName: string | null
  commitSha: string | null
  failureClass: CiFailureClass
  status: CiIncidentStatus
  summary: string | null
  suggestedFix: string | null
  prUrl: string | null
  retryCount: number
  failureFingerprint: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}
