import type { OpenAgentsClient } from '../client'
import type {
  CronDeliveryMode,
  CronJob,
  CronPayloadKind,
  CronRun,
  CronScheduleKind,
  CronSessionTarget,
} from '@openagents/shared'

export interface ScheduledTask extends CronJob {
  /** Human readable schedule, e.g. "Cron: 0 9 * * * (UTC)". */
  scheduleLabel: string
  /** ISO timestamp of the next run, or null when the job will not run again. */
  nextRunAt: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
}

export interface CreateScheduledTaskInput {
  name: string
  description?: string
  /**
   * Friendly schedule string. Accepts a 5-field cron expression
   * ("0 9 * * *"), an interval ("30m", "2h", "1d") or "once".
   */
  schedule: string
  /** The instruction the agent runs on every tick. */
  message: string
  sessionTarget?: CronSessionTarget
  payloadKind?: CronPayloadKind
  deliveryMode?: CronDeliveryMode
  deliveryTarget?: string
  enabled?: boolean
  /** Required when `schedule` is "once". */
  runAt?: string
}

const EVERY_PATTERN = /^(?:every\s+)?(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day)s?$/i

/**
 * Maps a friendly schedule string onto the cron engine's schedule kind/value.
 * Throws when the string cannot be understood, so the UI can show the reason.
 */
export function toCronSchedule(
  schedule: string,
  runAt?: string,
): { scheduleKind: CronScheduleKind; scheduleValue: string } {
  const value = String(schedule ?? '').trim()

  if (!value) throw new Error('A schedule is required.')

  if (value.toLowerCase() === 'once') {
    if (!runAt) throw new Error('A one-off schedule needs an explicit runAt date.')
    const date = new Date(runAt)
    if (Number.isNaN(date.getTime())) throw new Error('runAt is not a valid date.')
    return { scheduleKind: 'at', scheduleValue: date.toISOString() }
  }

  const every = value.match(EVERY_PATTERN)
  if (every) {
    return { scheduleKind: 'every', scheduleValue: `${every[1]}${every[2].toLowerCase()}` }
  }

  if (value.split(/\s+/).length === 5) {
    return { scheduleKind: 'cron', scheduleValue: value }
  }

  throw new Error(
    `"${value}" is not a valid schedule. Use a 5-field cron expression, an interval like 30m/2h/1d, or "once".`,
  )
}

export function createSchedulerApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<ScheduledTask[]>('/api/v1/cron/jobs'),

    get: (id: string) => client.get<ScheduledTask>(`/api/v1/cron/jobs/${id}`),

    create: (input: CreateScheduledTaskInput) => {
      const { scheduleKind, scheduleValue } = toCronSchedule(input.schedule, input.runAt)
      return client.post<ScheduledTask>('/api/v1/cron/jobs', {
        name: input.name,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
        scheduleKind,
        scheduleValue,
        sessionTarget: input.sessionTarget ?? 'main',
        payloadKind: input.payloadKind ?? 'agentTurn',
        payloadText: input.message,
        deliveryMode: input.deliveryMode ?? 'none',
        deliveryTarget: input.deliveryTarget ?? null,
      })
    },

    enable: (id: string) =>
      client.patch<ScheduledTask>(`/api/v1/cron/jobs/${id}`, { enabled: true }),

    disable: (id: string) =>
      client.patch<ScheduledTask>(`/api/v1/cron/jobs/${id}`, { enabled: false }),

    delete: (id: string) => client.delete<{ ok: true }>(`/api/v1/cron/jobs/${id}`),

    runNow: (id: string) =>
      client.post<{ ok: true; jobId: string }>(`/api/v1/cron/jobs/${id}/run`),

    runs: (id: string, limit = 25) =>
      client.get<CronRun[]>(`/api/v1/cron/jobs/${id}/runs?limit=${limit}`),
  }
}
