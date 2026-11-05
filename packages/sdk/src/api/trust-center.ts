import type { OpenAgentsClient } from '../client'

export interface TrustControl {
  id: string
  title: string
  status: string
  scope: string
  evidence: string
}

export interface TrustPosture {
  generatedAt: string
  controls: TrustControl[]
  notClaimed: string[]
}

export interface TrustSubprocessor {
  name: string
  purpose: string
  data: string
  location: string
  active: boolean
}

export interface TrustRetention {
  conversationsDays: number | null
  auditLogDays: number | null
  memoriesDays: number | null
  updatedAt: string | null
  enforced: Record<string, boolean>
}

export interface TrustDataRequest {
  id: string
  type: 'export' | 'delete'
  status: 'completed' | 'pending_confirmation' | 'expired' | 'processed'
  note?: string
  createdAt: string
  completedAt?: string
  expiresAt?: string
  result?: Record<string, unknown>
}

const BASE = '/api/v1/trust-center'

export function createTrustCenterApi(client: OpenAgentsClient) {
  return {
    posture: () => client.get<TrustPosture>(`${BASE}/posture`),
    subprocessors: () => client.get<{ note: string; subprocessors: TrustSubprocessor[] }>(`${BASE}/subprocessors`),
    retention: () => client.get<TrustRetention>(`${BASE}/retention`),
    setRetention: (input: { conversationsDays?: number | null; auditLogDays?: number | null; memoriesDays?: number | null }) =>
      client.put<TrustRetention>(`${BASE}/retention`, input),
    applyRetention: (confirm = false) =>
      client.post<{ dryRun: boolean; conversationsDays: number | null; matched: number; deleted: number }>(`${BASE}/retention/apply`, { confirm }),
    dpa: (customer: string) => client.get<{ filename: string; markdown: string }>(`${BASE}/dpa?customer=${encodeURIComponent(customer)}`),
    requests: () => client.get<TrustDataRequest[]>(`${BASE}/requests`),
    createRequest: (type: 'export' | 'delete', note?: string) => client.post<TrustDataRequest>(`${BASE}/requests`, { type, note }),
    downloadExport: (id: string) => client.get<Record<string, unknown>>(`${BASE}/requests/${encodeURIComponent(id)}/download`),
    confirmDelete: (id: string, password: string) => client.post<{ request: TrustDataRequest; result: unknown }>(`${BASE}/requests/${encodeURIComponent(id)}/confirm`, { password }),
  }
}
