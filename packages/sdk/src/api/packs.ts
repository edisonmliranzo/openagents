import type {
  CreatePackInput,
  PackBundle,
  PackInstallPreview,
  PackInstallResult,
  SearchPacksInput,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

function buildQuery(input: SearchPacksInput = {}) {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.tag) params.set('tag', input.tag)
  if (typeof input.limit === 'number') params.set('limit', String(input.limit))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function createPacksApi(client: OpenAgentsClient) {
  return {
    listMine: () => client.get<PackBundle[]>('/api/v1/packs'),
    listPublic: (input: SearchPacksInput = {}) =>
      client.get<PackBundle[]>(`/api/v1/packs/public${buildQuery(input)}`),
    get: (id: string) => client.get<PackBundle>(`/api/v1/packs/${id}`),
    create: (input: CreatePackInput) => client.post<PackBundle>('/api/v1/packs', input),
    preview: (id: string) => client.post<PackInstallPreview>(`/api/v1/packs/${id}/preview`),
    install: (id: string) => client.post<PackInstallResult>(`/api/v1/packs/${id}/install`),
  }
}
