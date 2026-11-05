import type { OpenAgentsClient } from '../client'

export interface KeyStatus {
  provider: { id: string; source: string; byok: boolean }
  availableProviders: string[]
  format: { current: string; legacy: string[] }
  masterKeyVersion: number
  dataKeyVersion: number
  dataKeys: Array<{ version: number; masterVersion: number; createdAt: string }>
  lastRotation: KeyRotationEvent | null
}
export interface KeyRotationEvent {
  id: string
  at: string
  by: string
  fromMasterVersion: number
  toMasterVersion: number
  rewrappedUsers: number
  rewrappedKeys: number
  newDataKeys: boolean
  failed: number
}

export function createKeysApi(client: OpenAgentsClient) {
  return {
    status: () => client.get<KeyStatus>('/api/v1/keys/status'),
    history: () => client.get<KeyRotationEvent[]>('/api/v1/keys/history'),
    rotate: (rotateDataKeys = false) => client.post<KeyRotationEvent>('/api/v1/keys/rotate', { rotateDataKeys }),
    encrypt: (value: string) => client.post<{ value: string }>('/api/v1/keys/encrypt', { value }),
    decrypt: (value: string) => client.post<{ value: string }>('/api/v1/keys/decrypt', { value }),
  }
}

export interface SkillProposalStep { tool: string; description: string }
export interface SkillProposalInput { name: string; type: 'string'; description: string }
export interface SkillProposalRow {
  id: string
  signature: string
  skillId: string
  name: string
  description: string
  steps: SkillProposalStep[]
  inputs: SkillProposalInput[]
  occurrences: number
  sources: { messages: number; tasks: number; conversations: number }
  examples: string[]
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
  decidedAt?: string
  registeredVersion?: string
}
export type SkillProposalEdit = Partial<Pick<SkillProposalRow, 'name' | 'description' | 'skillId' | 'steps' | 'inputs'>>

export function createSkillProposalsApi(client: OpenAgentsClient) {
  const base = '/api/v1/skill-proposals'
  return {
    list: (status?: SkillProposalRow['status']) =>
      client.get<{ lastMinedAt: string | null; proposals: SkillProposalRow[] }>(`${base}${status ? `?status=${status}` : ''}`),
    mine: () =>
      client.post<{ scanned: { messages: number; tasks: number }; patterns: number; created: number; updated: number; minOccurrences: number }>(`${base}/mine`),
    get: (id: string) => client.get<SkillProposalRow>(`${base}/${encodeURIComponent(id)}`),
    edit: (id: string, patch: SkillProposalEdit) => client.patch<SkillProposalRow>(`${base}/${encodeURIComponent(id)}`, patch),
    approve: (id: string, patch: SkillProposalEdit = {}) => client.post<SkillProposalRow>(`${base}/${encodeURIComponent(id)}/approve`, patch),
    reject: (id: string) => client.post<SkillProposalRow>(`${base}/${encodeURIComponent(id)}/reject`),
    remove: (id: string) => client.delete<{ ok: boolean }>(`${base}/${encodeURIComponent(id)}`),
  }
}

export interface SyncDeviceRow {
  id: string
  name: string
  platform: string
  registeredAt: string
  lastSeenAt: string
  cursor: number
  revokedAt?: string
}
export interface SyncRecordRow { key: string; version: number; seq: number; blob: string; deleted: boolean; deviceId: string; updatedAt: string }
export interface SyncConflictRow {
  id: string
  key: string
  at: string
  lostVersion: number
  lostDeviceId: string
  lostBlob: string
  winnerVersion: number
  winnerDeviceId: string
  baseVersion: number
  resolved: boolean
}
export interface SyncKeyringRow { salt: string; iterations: number; check: string; createdAt: string }
export interface SyncStateRow {
  latestSeq: number
  recordCount: number
  devices: SyncDeviceRow[]
  unresolvedConflicts: number
  configured: boolean
}

export function createSyncApi(client: OpenAgentsClient) {
  const base = '/api/v1/sync'
  return {
    state: () => client.get<SyncStateRow>(`${base}/state`),
    keyring: () => client.get<{ keyring: SyncKeyringRow | null }>(`${base}/keyring`),
    setKeyring: (k: { salt: string; iterations: number; check: string; reset?: boolean }) => client.put<{ keyring: SyncKeyringRow }>(`${base}/keyring`, k),
    registerDevice: (name: string, platform = 'web') => client.post<SyncDeviceRow>(`${base}/devices`, { name, platform }),
    revokeDevice: (id: string) => client.delete<SyncDeviceRow>(`${base}/devices/${encodeURIComponent(id)}`),
    push: (deviceId: string, records: Array<{ key: string; baseVersion: number; blob: string; deleted?: boolean }>) =>
      client.post<{ accepted: Array<{ key: string; version: number; seq: number }>; conflicts: SyncConflictRow[]; latestSeq: number }>(`${base}/push`, { deviceId, records }),
    pull: (deviceId: string, since?: number) =>
      client.post<{ records: SyncRecordRow[]; cursor: number; latestSeq: number }>(`${base}/pull`, { deviceId, ...(since !== undefined ? { since } : {}) }),
    conflicts: (all = false) => client.get<SyncConflictRow[]>(`${base}/conflicts${all ? '?all=true' : ''}`),
    resolveConflict: (id: string) => client.post<SyncConflictRow>(`${base}/conflicts/${encodeURIComponent(id)}/resolve`),
  }
}
