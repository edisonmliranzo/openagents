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

export type ReplayCategory = 'browser' | 'terminal' | 'tool' | 'message' | 'approval' | 'system' | 'error'
export type ReplayTimelineStep = ReplayStep & { category: ReplayCategory; cumulativeTokens: number; cumulativeCostUsd: number }

export interface ReplayTimeline {
  run: ReplayRunDetail['run']
  totals: ReplayRunDetail['totals']
  categories: Record<string, number>
  steps: ReplayTimelineStep[]
}

export interface ReplayForkSummary {
  id: string
  sourceRunId: string
  forkConversationId: string
  forkRunId: string
  forkStep: number
  title: string
  model: string | null
  modelProvider: string | null
  instructions: string | null
  createdAt: string
}

export interface ReplayDiffRow {
  index: number
  status: 'same' | 'changed' | 'added' | 'removed'
  original?: ReplayStep
  fork?: ReplayStep
}

export interface ReplayForkDiff {
  fork: ReplayForkSummary
  firstDivergence: number | null
  counts: { same: number; changed: number; added: number; removed: number }
  rows: ReplayDiffRow[]
  totals: {
    original: { steps: number; tokens: number; costUsd: number }
    fork: { steps: number; tokens: number; costUsd: number }
  }
}

export interface ReplayForkRequest {
  stepIndex: number
  model?: string
  modelProvider?: string
  instructions?: string
  title?: string
}

export function createReplayApi(client: OpenAgentsClient) {
  return {
    runs: (limit = 50, conversationId?: string) =>
      client.get<ReplayRunSummary[]>(
        `/api/v1/replay/runs?limit=${limit}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`,
      ),
    run: (id: string) => client.get<ReplayRunDetail>(`/api/v1/replay/runs/${encodeURIComponent(id)}`),
    timeline: (id: string) => client.get<ReplayTimeline>(`/api/v1/replay/runs/${encodeURIComponent(id)}/timeline`),
    fork: (id: string, body: ReplayForkRequest) =>
      client.post<ReplayForkSummary & { seededMessages: number }>(`/api/v1/replay/runs/${encodeURIComponent(id)}/fork`, body),
    forks: (runId?: string) =>
      client.get<ReplayForkSummary[]>(`/api/v1/replay/forks${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`),
    forkDiff: (forkId: string) => client.get<ReplayForkDiff>(`/api/v1/replay/forks/${encodeURIComponent(forkId)}/diff`),
  }
}
