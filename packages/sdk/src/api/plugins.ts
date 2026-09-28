import type { OpenAgentsClient } from '../client'

export interface PluginRow {
  key: string
  name: string
  description: string
  category: string
  requiresEnv?: string[]
  installed: boolean
  enabled: boolean
}

export function createPluginsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<PluginRow[]>('/api/v1/plugins'),
    enable: (key: string) => client.post<PluginRow>(`/api/v1/plugins/${encodeURIComponent(key)}/enable`),
    disable: (key: string) => client.post<PluginRow>(`/api/v1/plugins/${encodeURIComponent(key)}/disable`),
  }
}
