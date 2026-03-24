import type {
  Artifact,
  ArtifactDetail,
  ArtifactExportResult,
  ArtifactTemplate,
  CreateArtifactInput,
  CreateArtifactTemplateInput,
  CreateArtifactVersionInput,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

export function createArtifactsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<Artifact[]>('/api/v1/artifacts'),
    get: (id: string) => client.get<ArtifactDetail>(`/api/v1/artifacts/${id}`),
    create: (input: CreateArtifactInput) =>
      client.post<ArtifactDetail>('/api/v1/artifacts', input),
    addVersion: (id: string, input: CreateArtifactVersionInput) =>
      client.post<ArtifactDetail>(`/api/v1/artifacts/${id}/versions`, input),
    export: (id: string, format?: string) =>
      client.post<ArtifactExportResult>(
        `/api/v1/artifacts/${id}/export${format ? `?format=${encodeURIComponent(format)}` : ''}`,
      ),
    listTemplates: () => client.get<ArtifactTemplate[]>('/api/v1/artifacts/templates'),
    createTemplate: (input: CreateArtifactTemplateInput) =>
      client.post<ArtifactTemplate>('/api/v1/artifacts/templates', input),
  }
}
