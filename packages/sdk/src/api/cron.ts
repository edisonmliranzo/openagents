import type { OpenAgentsClient } from '../client'
import type {
  CreateCronJobInput,
  CronHealthSummary,
  CronJob,
  CronRun,
  CronSelfHealInput,
  CronSelfHealReport,
  UpdateCronJobInput,
} from '@openagents/shared'

export interface CronJobWithLastRun extends CronJob {
  runs?: CronRun[]
}

export function createCronApi(client: OpenAgentsClient) {
  return {
    listJobs: () => client.get<CronJobWithLastRun[]>('/api/v1/cron/jobs'),

    createJob: (input: CreateCronJobInput) => client.post<CronJob>('/api/v1/cron/jobs', input),

    patchJob: (id: string, input: UpdateCronJobInput) =>
      client.patch<CronJob>(`/api/v1/cron/jobs/${id}`, input),

    deleteJob: (id: string) => client.delete<{ ok: true }>(`/api/v1/cron/jobs/${id}`),

    runJob: (id: string) => client.post<CronRun>(`/api/v1/cron/jobs/${id}/run`),

    listRuns: (id: string, limit = 25) =>
      client.get<CronRun[]>(`/api/v1/cron/jobs/${id}/runs?limit=${limit}`),

    health: (staleAfterMinutes?: number) =>
      client.get<CronHealthSummary>(
        `/api/v1/cron/jobs/health/summary${staleAfterMinutes ? `?staleAfterMinutes=${staleAfterMinutes}` : ''}`,
      ),

    selfHeal: (input: CronSelfHealInput = {}) =>
      client.post<CronSelfHealReport>('/api/v1/cron/jobs/self-heal', input),
  }
}
