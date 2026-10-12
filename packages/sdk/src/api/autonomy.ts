import type { OpenAgentsClient } from '../client'

export interface MissionRow {
  id: string
  title: string
  goal: string
  successCriteria: string
  intervalHours: number
  status: string
  lastRunAt: string | null
  nextRunAt: string | null
  lastReport: string | null
  runCount: number
  createdAt: string
  events: Array<{ id: string; kind: string; message: string; createdAt: string }>
}

export interface MissionDetail {
  mission: MissionRow & { reportSince: string | null }
  events: Array<{ id: string; kind: string; message: string; data: string | null; createdAt: string }>
  tasks: TaskRow[]
}

export interface TaskRow {
  id: string
  title: string
  status: string
  createdAt: string
  finishedAt: string | null
}

export interface QuestionRow {
  id: string
  taskId: string
  question: string
  options: string | null
  answer: string | null
  status: string
  answeredAt: string | null
  createdAt: string
}

export interface JournalRow {
  id: string
  taskId: string | null
  tool: string
  input: string
  output: string | null
  compensation: string | null
  undoneAt: string | null
  createdAt: string
}

export interface GraphData {
  nodes: Array<{ id: string; name: string; type: string; summary: string; mentions: number }>
  edges: Array<{ from: string; to: string; relation: string; weight: number }>
}

export interface HandoffLinkRow {
  id: string
  taskId: string
  token: string
  label: string
  views: number
  expiresAt: string | null
  createdAt: string
}

export function createAutonomyApi(client: OpenAgentsClient) {
  return {
    // Missions: multi-day persistent agents
    listMissions: () => client.get<MissionRow[]>('/api/v1/autonomy/missions'),
    createMission: (input: { title?: string; goal: string; successCriteria?: string; intervalHours?: number }) =>
      client.post<MissionRow>('/api/v1/autonomy/missions', input),
    getMission: (id: string) => client.get<MissionDetail>(`/api/v1/autonomy/missions/${id}`),
    updateMission: (id: string, patch: { status?: string; intervalHours?: number; title?: string }) =>
      client.post<MissionRow>(`/api/v1/autonomy/missions/${id}`, patch),
    runMission: (id: string) => client.post<TaskRow>(`/api/v1/autonomy/missions/${id}/run`, {}),
    missionReport: (id: string) => client.post<{ report: string }>(`/api/v1/autonomy/missions/${id}/report`, {}),

    // Clarifying-questions inbox
    listQuestions: (status?: string) =>
      client.get<QuestionRow[]>(`/api/v1/autonomy/questions${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    answerQuestion: (id: string, answer: string) =>
      client.post<{ ok: boolean }>(`/api/v1/autonomy/questions/${id}/answer`, { answer }),
    dismissQuestion: (id: string) => client.post<{ ok: boolean }>(`/api/v1/autonomy/questions/${id}/dismiss`, {}),

    // Action journal (undo)
    listJournal: (limit = 60) => client.get<JournalRow[]>(`/api/v1/autonomy/journal?limit=${limit}`),
    undoEntry: (id: string) => client.post<{ ok: boolean; revertedWith: string }>(`/api/v1/autonomy/journal/${id}/undo`, {}),
    undoTask: (taskId: string) =>
      client.post<{ reverted: number; results: Array<{ id: string; tool: string; ok: boolean; detail?: string }> }>(
        `/api/v1/autonomy/tasks/${taskId}/undo`,
        {},
      ),

    // Entity memory graph
    getGraph: (limit = 80) => client.get<GraphData>(`/api/v1/autonomy/graph?limit=${limit}`),
    rebuildGraph: () => client.post<{ nodes: number; edges: number }>('/api/v1/autonomy/graph/rebuild', {}),

    // Cross-device handoff links
    listHandoffs: () => client.get<HandoffLinkRow[]>('/api/v1/autonomy/handoff'),
    createHandoff: (taskId: string, label?: string, ttlHours?: number) =>
      client.post<{ id: string; token: string; path: string; expiresAt: string | null }>(
        `/api/v1/autonomy/tasks/${taskId}/handoff`,
        { label, ttlHours },
      ),
    revokeHandoff: (id: string) => client.delete<{ ok: boolean }>(`/api/v1/autonomy/handoff/${id}`),
  }
}
