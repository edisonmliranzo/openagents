import type { OpenAgentsClient } from '../client'
import type { CreateExtractionJobInput, ExtractionJob, ExtractionStatus } from '@openagents/shared'

export function createExtractionApi(client: OpenAgentsClient) {
  return {
    createJob: (input: CreateExtractionJobInput) =>
      client.post<ExtractionJob>('/api/v1/extract/jobs', input),

    listJobs: (status?: ExtractionStatus, limit?: number) => {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      if (typeof limit === 'number') qs.set('limit', String(limit))
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return client.get<ExtractionJob[]>(`/api/v1/extract/jobs${suffix}`)
    },

    getJob: (id: string) =>
      client.get<ExtractionJob>(`/api/v1/extract/jobs/${encodeURIComponent(id)}`),
  }
}
