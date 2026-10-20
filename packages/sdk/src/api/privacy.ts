import type { OpenAgentsClient } from '../client'

export interface PrivacySettings {
  localOnly: boolean
  localModel?: string
  sensitiveMemoryCount?: number
}

export interface PrivacyMemoryRow {
  id: string
  type: string
  preview: string
  sensitive: boolean
  updatedAt: string
}

export interface PrivacyExportBundle {
  format: 'openagents-export'
  version: number
  exportedAt: string
  user: unknown
  settings: unknown
  privacy: PrivacySettings
  memories: unknown[]
  conversations: unknown[]
  artifacts: unknown[]
  featureData: Record<string, unknown>
}

export function createPrivacyApi(client: OpenAgentsClient) {
  return {
    export: () => client.get<PrivacyExportBundle>('/api/v1/privacy/export'),
    deleteAll: (password: string) =>
      client.post<{ ok: boolean; deleted: Record<string, number>; featureFilesRemoved: number }>(
        '/api/v1/privacy/delete-all',
        { password },
      ),
    getSettings: () => client.get<PrivacySettings>('/api/v1/privacy/settings'),
    updateSettings: (patch: Partial<PrivacySettings>) => client.put<PrivacySettings>('/api/v1/privacy/settings', patch),
    memories: () => client.get<PrivacyMemoryRow[]>('/api/v1/privacy/memories'),
    setSensitive: (id: string, sensitive: boolean) =>
      client.put<{ id: string; sensitive: boolean }>(`/api/v1/privacy/memories/${encodeURIComponent(id)}/sensitive`, { sensitive }),
    reveal: (id: string) =>
      client.get<{ id: string; content: string | null }>(`/api/v1/privacy/memories/${encodeURIComponent(id)}/reveal`),
  }
}
