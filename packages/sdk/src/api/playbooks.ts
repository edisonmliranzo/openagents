import type { OpenAgentsClient } from '../client'
import type {
  CreatePlaybookInput,
  PlaybookDefinition,
  PlaybookRun,
  RunPlaybookInput,
  UpdatePlaybookInput,
} from '@openagents/shared'

export function createPlaybooksApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<PlaybookDefinition[]>('/api/v1/playbooks'),

    get: (id: string) => client.get<PlaybookDefinition>(`/api/v1/playbooks/${id}`),

    create: (input: CreatePlaybookInput) => client.post<PlaybookDefinition>('/api/v1/playbooks', input),

    update: (id: string, input: UpdatePlaybookInput) =>
      client.patch<PlaybookDefinition>(`/api/v1/playbooks/${id}`, input),

    remove: (id: string) => client.delete<{ ok: true }>(`/api/v1/playbooks/${id}`),

    run: (id: string, input: RunPlaybookInput = {}) =>
      client.post<PlaybookRun>(`/api/v1/playbooks/${id}/run`, input),

    listRuns: (id: string, limit = 25) =>
      client.get<PlaybookRun[]>(`/api/v1/playbooks/${id}/runs?limit=${limit}`),
  }
}
