import type { OpenAgentsClient } from '../client'
import type { CiIncident, CiIncidentStatus, CreateCiIncidentInput } from '@openagents/shared'

export function createCiHealerApi(client: OpenAgentsClient) {
  return {
    reportFailure: (input: CreateCiIncidentInput, token?: string) =>
      client.post<CiIncident>(
        '/api/v1/ci/failure',
        input,
        token ? { 'x-ci-healer-token': token } : undefined,
      ),

    listIncidents: (status?: CiIncidentStatus, limit?: number) => {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      if (typeof limit === 'number') qs.set('limit', String(limit))
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return client.get<CiIncident[]>(`/api/v1/ci/incidents${suffix}`)
    },

    getIncident: (id: string) =>
      client.get<CiIncident>(`/api/v1/ci/incidents/${encodeURIComponent(id)}`),

    processIncident: (id: string) =>
      client.post<CiIncident>(`/api/v1/ci/incidents/${encodeURIComponent(id)}/process`),
  }
}
