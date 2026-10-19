import type { OpenAgentsClient } from '../client'

export interface ResearchSource {
  n: number
  url: string
  title: string
  snippet: string
  kind: 'web' | 'library'
  documentId?: string
}

export interface ResearchStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  detail?: string
  startedAt?: string
  finishedAt?: string
}

export interface ResearchJob {
  id: string
  goal: string
  status: 'running' | 'completed' | 'failed'
  steps: ResearchStep[]
  queries: string[]
  sources: ResearchSource[]
  report: string
  error?: string
  artifactId?: string
  createdAt: string
  updatedAt: string
}

export interface ResearchJobSummary {
  id: string
  goal: string
  status: ResearchJob['status']
  sourceCount: number
  createdAt: string
}

export interface ResearchReport {
  id: string
  goal: string
  status: ResearchJob['status']
  markdown: string
  sources: ResearchSource[]
}

export function createResearchApi(client: OpenAgentsClient) {
  return {
    start: (input: { goal: string; maxQueries?: number; includeLibrary?: boolean }) =>
      client.post<ResearchJob>('/api/v1/research/deep', input),
    list: () => client.get<ResearchJobSummary[]>('/api/v1/research/deep'),
    get: (id: string) => client.get<ResearchJob>(`/api/v1/research/deep/${encodeURIComponent(id)}`),
    report: (id: string) => client.get<ResearchReport>(`/api/v1/research/deep/${encodeURIComponent(id)}/report`),
    export: (id: string, input: { title?: string; workspaceId?: string } = {}) =>
      client.post<{ artifactId: string }>(`/api/v1/research/deep/${encodeURIComponent(id)}/export`, input),
  }
}
