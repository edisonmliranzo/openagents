import type { OpenAgentsClient } from '../client'

export interface BrowserSessionRow {
  id: string
  userId: string
  url: string
  status: 'initializing' | 'active' | 'closed' | 'error'
  lastScreenshot?: string
  createdAt: string
}

export interface BrowserStateResult {
  screenshot: string | null
  dom: string
  url: string
}

export type BrowserActionType = 'navigate' | 'click' | 'type' | 'scroll' | 'extract' | 'upload' | 'press'

export interface BrowserActionInput {
  type: BrowserActionType
  selector?: string
  value?: string
  url?: string
}

export interface BrowserActionLogEntry {
  id: string
  at: string
  action: BrowserActionInput
  status: 'executed' | 'failed' | 'needs_approval' | 'approved' | 'denied'
  detail?: string
}

export interface PendingBrowserAction {
  id: string
  action: BrowserActionInput
  reason: string
  createdAt: string
}

export type BrowserActionResult =
  | { status: 'ok'; success: true; result?: unknown }
  | { status: 'error'; success: false; result?: unknown }
  | { status: 'needs_approval'; success: false; pendingActionId: string; reason: string }
  | { status: 'denied' }

/** Payload of `event: frame` on the SSE stream. `screenshot` is omitted when unchanged. */
export interface BrowserStreamFrame {
  sessionId: string
  url: string
  status: BrowserSessionRow['status']
  screenshot?: string | null
  log: BrowserActionLogEntry[]
  pending: PendingBrowserAction[]
  at: string
}

export interface BrowserWorkflowVariable {
  name: string
  description?: string
  defaultValue?: string
}

export interface BrowserWorkflowVariableSuggestion extends BrowserWorkflowVariable {
  stepIndex?: number
}

export interface BrowserWorkflow {
  id: string
  name: string
  description?: string
  steps: BrowserActionInput[]
  variables: BrowserWorkflowVariable[]
  createdAt: string
  updatedAt: string
}

export interface BrowserWorkflowRunResult {
  workflowId: string
  sessionId: string
  status: 'completed' | 'paused_for_approval' | 'failed'
  completedSteps: number
  steps: Array<{ index: number; action: BrowserActionInput; result: BrowserActionResult }>
  pendingActionId?: string
  nextStep?: number
}

export function createBrowserApi(client: OpenAgentsClient) {
  const base = (id: string) => `/api/v1/browser/sessions/${encodeURIComponent(id)}`
  return {
    listSessions: () => client.get<BrowserSessionRow[]>('/api/v1/browser/sessions'),
    startSession: (url: string) => client.post<BrowserSessionRow>('/api/v1/browser/sessions', { url }),
    state: (id: string) => client.get<BrowserStateResult>(`${base(id)}/state`),
    action: (id: string, action: BrowserActionInput) => client.post<BrowserActionResult>(`${base(id)}/action`, action),
    pending: (id: string) => client.get<PendingBrowserAction[]>(`${base(id)}/pending`),
    log: (id: string) => client.get<BrowserActionLogEntry[]>(`${base(id)}/log`),
    approve: (id: string, pendingId: string) =>
      client.post<BrowserActionResult>(`${base(id)}/actions/${encodeURIComponent(pendingId)}/approve`),
    deny: (id: string, pendingId: string) =>
      client.post<BrowserActionResult>(`${base(id)}/actions/${encodeURIComponent(pendingId)}/deny`),
    /** Path of the SSE stream (requires Authorization header; use fetch streaming, not EventSource). */
    streamPath: (id: string) => `${base(id)}/stream`,
    close: (id: string) => client.delete<void>(base(id)),

    // ── Workflow recorder ──
    startRecording: (id: string) =>
      client.post<{ recording: true; sessionId: string; startedAt: string }>(`${base(id)}/recording/start`),
    stopRecording: (id: string) =>
      client.post<{ recording: false; steps: BrowserActionInput[]; suggestedVariables: BrowserWorkflowVariableSuggestion[] }>(
        `${base(id)}/recording/stop`,
      ),
    recordingStatus: (id: string) =>
      client.get<{ recording: boolean; steps: BrowserActionInput[] }>(`${base(id)}/recording`),
    listWorkflows: () => client.get<BrowserWorkflow[]>('/api/v1/browser/workflows'),
    getWorkflow: (wid: string) => client.get<BrowserWorkflow>(`/api/v1/browser/workflows/${encodeURIComponent(wid)}`),
    saveWorkflow: (input: {
      name: string
      description?: string
      sessionId?: string
      steps?: BrowserActionInput[]
      variables?: BrowserWorkflowVariableSuggestion[]
    }) => client.post<BrowserWorkflow>('/api/v1/browser/workflows', input),
    deleteWorkflow: (wid: string) => client.delete<{ ok: true }>(`/api/v1/browser/workflows/${encodeURIComponent(wid)}`),
    runWorkflow: (wid: string, input: { sessionId?: string; inputs?: Record<string, string>; fromStep?: number } = {}) =>
      client.post<BrowserWorkflowRunResult>(`/api/v1/browser/workflows/${encodeURIComponent(wid)}/run`, input),
  }
}
