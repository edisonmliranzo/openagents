import type { OpenAgentsClient } from '../client'

export interface BoardAgentDef { name: string; role?: string }
export interface BoardRubricCriterion { name: string; weight: number; description?: string }

export interface BoardArgumentRow {
  agent: string
  role: string
  text: string
  error?: string
  scores?: Record<string, number>
  total?: number
  judgeNote?: string
}

export interface BoardRoundRow { index: number; arguments: BoardArgumentRow[]; consensus?: number; judged: boolean }

export interface BoardVerdictRow {
  winner: string
  summary: string
  confidence: number
  finalScore: number
  agentTotals: Array<{ agent: string; avg: number }>
  dissent: Array<{ agent: string; note: string }>
}

export interface BoardSessionRow {
  id: string
  question: string
  status: 'running' | 'done' | 'failed'
  phase: string
  createdAt: string
  updatedAt: string
  config: {
    agents: Array<Required<BoardAgentDef>>
    rounds: number
    rubric: BoardRubricCriterion[]
    model: { provider: string; model?: string }
    judge: { provider: string; model?: string }
    maxCalls: number
    maxCostUsd: number
  }
  rounds: BoardRoundRow[]
  verdict?: BoardVerdictRow
  calls: number
  estCostUsd: number
  stoppedEarly?: string
  error?: string
}

export interface BoardSessionSummary {
  id: string
  question: string
  status: string
  createdAt: string
  winner: string | null
  finalScore: number | null
  agents: number
  rounds: number
  estCostUsd: number
}

export interface BoardStartInput {
  question: string
  agents?: BoardAgentDef[]
  rounds?: number
  rubric?: BoardRubricCriterion[]
  /** "provider:model" */
  model?: string
  judgeModel?: string
  maxCostUsd?: number
}

export function createBoardroomApi(client: OpenAgentsClient) {
  const e = encodeURIComponent
  return {
    defaults: () =>
      client.get<{ specialists: Array<Required<BoardAgentDef>>; rubric: BoardRubricCriterion[]; limits: { minAgents: number; maxAgents: number; maxRounds: number; maxCalls: number } }>('/api/v1/boardroom/defaults'),
    list: () => client.get<BoardSessionSummary[]>('/api/v1/boardroom/sessions'),
    start: (input: BoardStartInput) => client.post<BoardSessionRow>('/api/v1/boardroom/sessions', input),
    get: (id: string) => client.get<BoardSessionRow>(`/api/v1/boardroom/sessions/${e(id)}`),
    remove: (id: string) => client.delete<{ ok: boolean }>(`/api/v1/boardroom/sessions/${e(id)}`),
  }
}
