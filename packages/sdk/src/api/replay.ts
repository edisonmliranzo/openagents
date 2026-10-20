import type { OpenAgentsClient } from '../client'

export type ReplayStepKind = 'user' | 'agent' | 'system' | 'tool_call' | 'tool_result' | 'approval' | 'metric' | 'error'

export interface ReplayRunSummary {
  id: string
  conversationId: string
  conversationTitle: string | null
  status: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  error: string | null
}

export interface ReplayStep {
  index: number
  at: string
  offsetMs: number
  kind: ReplayStepKind
  title: string
  content?: string
  toolName?: string
  input?: unknown
  output?: unknown
  status?: string
  screenshot?: string
  tokens?: number
  costUsd?: number
  durationMs?: number
}

export interface ReplayRunDetail {
  run: ReplayRunSummary & { model: string | null; provider: string | null; metadata: unknown }
  totals: { steps: number; toolCalls: number; approvals: number; tokens: number; costUsd: number; durationMs: number }
  steps: ReplayStep[]
}

export function createReplayApi(client: OpenAgentsClient) {
  return {
    runs: (limit = 50, conversationId?: string) =>
      client.get<ReplayRunSummary[]>(
        `/api/v1/replay/runs?limit=${limit}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`,
      ),
    run: (id: string) => client.get<ReplayRunDetail>(`/api/v1/replay/runs/${encodeURIComponent(id)}`),
  }
}
