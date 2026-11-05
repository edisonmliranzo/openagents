import type { OpenAgentsClient } from '../client'

export type DurableStepKind = 'tool' | 'llm' | 'delay' | 'note'
export type DurableRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface DurableAttempt {
  attempt: number
  startedAt: string
  finishedAt?: string
  ok?: boolean
  error?: string
}

export interface DurableStep {
  index: number
  kind: DurableStepKind
  name: string
  tool?: string
  input?: Record<string, unknown>
  instruction?: string
  delayMs?: number
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
  attempts: DurableAttempt[]
  output?: string
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface DurableRunSummary {
  id: string
  title: string
  status: DurableRunStatus
  cursor: number
  totalSteps: number
  createdAt: string
  updatedAt: string
  finishedAt: string | null
  error: string | null
  resumes: number
}

export interface DurableRun extends Omit<DurableRunSummary, 'totalSteps' | 'finishedAt' | 'error'> {
  userId: string
  steps: DurableStep[]
  maxAttempts: number
  backoffMs: number
  waitUntil?: string
  finishedAt?: string
  error?: string
}

export interface DurableStepInput {
  kind: DurableStepKind
  name?: string
  tool?: string
  input?: Record<string, unknown>
  instruction?: string
  delayMs?: number
}

export function createDurableApi(client: OpenAgentsClient) {
  const base = '/api/v1/durable/runs'
  const id = (v: string) => encodeURIComponent(v)
  return {
    list: () => client.get<DurableRunSummary[]>(base),
    get: (runId: string) => client.get<DurableRun>(`${base}/${id(runId)}`),
    create: (body: { title: string; steps: DurableStepInput[]; maxAttempts?: number; backoffMs?: number; autoStart?: boolean }) =>
      client.post<DurableRun>(base, body),
    pause: (runId: string) => client.post<DurableRun>(`${base}/${id(runId)}/pause`, {}),
    resume: (runId: string) => client.post<DurableRun>(`${base}/${id(runId)}/resume`, {}),
    cancel: (runId: string) => client.post<DurableRun>(`${base}/${id(runId)}/cancel`, {}),
    remove: (runId: string) => client.delete<{ ok: boolean }>(`${base}/${id(runId)}`),
  }
}
