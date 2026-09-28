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

export function createBrowserApi(client: OpenAgentsClient) {
  return {
    listSessions: () => client.get<BrowserSessionRow[]>('/api/v1/browser/sessions'),
    startSession: (url: string) => client.post<BrowserSessionRow>('/api/v1/browser/sessions', { url }),
    state: (id: string) => client.get<BrowserStateResult>(`/api/v1/browser/sessions/${encodeURIComponent(id)}/state`),
    close: (id: string) => client.delete<void>(`/api/v1/browser/sessions/${encodeURIComponent(id)}`),
  }
}
