import type {
  AgentPreset,
  ApplyAgentPresetResult,
  CreateAgentPresetInput,
  UpdateAgentPresetInput,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

export function createAgentPresetsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<AgentPreset[]>('/api/v1/agent-presets'),
    get: (id: string) => client.get<AgentPreset>(`/api/v1/agent-presets/${id}`),
    create: (input: CreateAgentPresetInput) =>
      client.post<AgentPreset>('/api/v1/agent-presets', input),
    update: (id: string, input: UpdateAgentPresetInput) =>
      client.patch<AgentPreset>(`/api/v1/agent-presets/${id}`, input),
    remove: (id: string) => client.delete<{ ok: true }>(`/api/v1/agent-presets/${id}`),
    apply: (id: string) =>
      client.post<ApplyAgentPresetResult>(`/api/v1/agent-presets/${id}/apply`),
  }
}
