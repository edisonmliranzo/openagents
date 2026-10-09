import type { OpenAgentsClient } from '../client'

export interface FrontierStatus {
  sleepConsolidation: boolean
  timeline: boolean
  proceduralLearning: boolean
  debate: boolean
  watchTasks: boolean
  roundtable: boolean
  autoDocs: boolean
  promptRepair: boolean
  costAutopilot: boolean
  stakesAware: boolean
  privacyRouter: boolean
}

export interface TimelineHit {
  id: string
  date: string
  kind: 'memory' | 'summary' | 'message'
  text: string
  score: number
  conversationId?: string | null
}

export interface WatchTaskRow {
  id: string
  name: string
  kind: string
  target: string
  condition: string
  intervalMin: number
  enabled: boolean
  lastCheckAt: string | null
  lastFiredAt: string | null
  lastStatus: string | null
  lastDetail: string | null
  createdAt: string
}

export interface PromptPatchRow {
  id: string
  taskClass: string
  rule: string
  reason: string
  source: string
  active: boolean
  createdAt: string
}

export interface DebateResult {
  question: string
  transcript: Array<{ seat: 'A' | 'B'; text: string }>
  verdict: { winner: 'A' | 'B' | 'tie'; merged: string; confidence: number }
  models: { a: string; b: string; judge: string }
}

export interface RoundtableResult {
  minutes: string
  artifactId: string | null
  speakers: string[]
}

export function createFrontierApi(client: OpenAgentsClient) {
  return {
    status: () => client.get<FrontierStatus>('/api/v1/frontier/status'),
    digest: () => client.get<{ id: string; content: string; createdAt: string } | null>('/api/v1/frontier/digest'),
    consolidate: () => client.post<{ ok: boolean; digest: string | null }>('/api/v1/frontier/consolidate'),
    timeline: (params: { q?: string; from?: string; to?: string; limit?: number }) =>
      client.get<TimelineHit[]>(`/api/v1/frontier/timeline?${new URLSearchParams(
        Object.entries(params)
          .filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '')
          .map((entry): [string, string] => [entry[0], String(entry[1])]),
      )}`),
    mine: () => client.post<{ found: number; created: string[] }>('/api/v1/frontier/procedural/mine'),
    debate: (question: string) => client.post<DebateResult>('/api/v1/frontier/debate', { question }),
    roundtable: (topic: string) => client.post<RoundtableResult>('/api/v1/frontier/roundtable', { topic }),
    autodoc: (input: { task: string; steps: string[]; result: string; source?: string }) =>
      client.post<{ title: string } | null>('/api/v1/frontier/autodoc', input),
    watches: {
      list: () => client.get<WatchTaskRow[]>('/api/v1/frontier/watches'),
      create: (input: { name: string; kind?: string; target: string; condition: string; intervalMin?: number }) =>
        client.post<WatchTaskRow>('/api/v1/frontier/watches', input),
      setEnabled: (id: string, enabled: boolean) => client.patch(`/api/v1/frontier/watches/${id}`, { enabled }),
      remove: (id: string) => client.delete(`/api/v1/frontier/watches/${id}`),
      run: (id: string) => client.post<{ fired?: boolean; detail?: string } | null>(`/api/v1/frontier/watches/${id}/run`),
    },
    patches: {
      list: () => client.get<PromptPatchRow[]>('/api/v1/frontier/patches'),
      setActive: (id: string, active: boolean) => client.patch(`/api/v1/frontier/patches/${id}`, { active }),
      remove: (id: string) => client.delete(`/api/v1/frontier/patches/${id}`),
    },
    autopilot: () => client.get<{ forceFast: boolean; upgrade: boolean; reason: string | null; spentUsd: number; ceilingUsd: number }>('/api/v1/frontier/autopilot'),
  }
}
