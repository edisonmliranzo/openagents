export type ArtifactType =
  | 'doc'
  | 'report'
  | 'spreadsheet'
  | 'landing_page'
  | 'dataset_export'
  | 'brief'

export type ArtifactStatus = 'draft' | 'generated' | 'published' | 'archived'

export interface ArtifactSource {
  conversationId?: string
  workflowId?: string
  presetId?: string
  packId?: string
}

export interface ArtifactVersion {
  id: string
  artifactId: string
  version: number
  format: string
  content: string
  note?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface Artifact {
  id: string
  userId: string
  workspaceId?: string
  title: string
  type: ArtifactType
  status: ArtifactStatus
  summary?: string
  labels: string[]
  source: ArtifactSource
  currentVersion: ArtifactVersion
  versionCount: number
  createdAt: string
  updatedAt: string
}

export interface ArtifactDetail extends Artifact {
  versions: ArtifactVersion[]
}

export interface CreateArtifactInput {
  workspaceId?: string
  title: string
  type: ArtifactType
  status?: ArtifactStatus
  summary?: string
  labels?: string[]
  format?: string
  content?: string
  note?: string
  metadata?: Record<string, unknown>
  source?: ArtifactSource
}

export interface CreateArtifactVersionInput {
  format?: string
  content: string
  note?: string
  metadata?: Record<string, unknown>
}

export interface ArtifactExportResult {
  artifactId: string
  versionId: string
  fileName: string
  mimeType: string
  content: string
  exportedAt: string
}

export interface ArtifactTemplate {
  id: string
  userId: string
  workspaceId?: string
  name: string
  description?: string
  type: ArtifactType
  defaultFormat: string
  outline?: string
  promptGuide?: string
  fieldSchema: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateArtifactTemplateInput {
  workspaceId?: string
  name: string
  description?: string
  type: ArtifactType
  defaultFormat?: string
  outline?: string
  promptGuide?: string
  fieldSchema?: string[]
}
