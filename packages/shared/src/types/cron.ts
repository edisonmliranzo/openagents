export type CronScheduleKind = 'every' | 'at' | 'cron'
export type CronSessionTarget = 'main' | 'isolated'
export type CronPayloadKind = 'systemEvent' | 'agentTurn'
export type CronDeliveryMode = 'none' | 'announce' | 'webhook'
export type CronRunStatus = 'ok' | 'error' | 'skipped'

export interface CronJob {
  id: string
  userId: string
  name: string
  description: string | null
  enabled: boolean
  scheduleKind: CronScheduleKind
  scheduleValue: string
  sessionTarget: CronSessionTarget
  payloadKind: CronPayloadKind
  payloadText: string
  deliveryMode: CronDeliveryMode
  deliveryTarget: string | null
  createdAt: string
  updatedAt: string
}

export interface CronRun {
  id: string
  cronJobId: string
  status: CronRunStatus
  summary: string | null
  error: string | null
  durationMs: number | null
  createdAt: string
}

export interface CreateCronJobInput {
  name: string
  description?: string | null
  enabled?: boolean
  scheduleKind: CronScheduleKind
  scheduleValue: string
  sessionTarget?: CronSessionTarget
  payloadKind?: CronPayloadKind
  payloadText: string
  deliveryMode?: CronDeliveryMode
  deliveryTarget?: string | null
}

export interface UpdateCronJobInput {
  name?: string
  description?: string | null
  enabled?: boolean
  scheduleKind?: CronScheduleKind
  scheduleValue?: string
  sessionTarget?: CronSessionTarget
  payloadKind?: CronPayloadKind
  payloadText?: string
  deliveryMode?: CronDeliveryMode
  deliveryTarget?: string | null
}
