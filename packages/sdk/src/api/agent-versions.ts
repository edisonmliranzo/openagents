import type { OpenAgentsClient } from '../client'
import type {
  AgentVersionDiffResult,
  AgentVersionSnapshot,
  CreateAgentVersionInput,
} from '@openagents/shared'

export function createAgentVersionsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<AgentVersionSnapshot[]>('/api/v1/agent-versions'),

    get: (id: string) => client.get<AgentVersionSnapshot>(`/api/v1/agent-versions/${id}`),

    create: (input: CreateAgentVersionInput = {}) =>
      client.post<AgentVersionSnapshot>('/api/v1/agent-versions', input),

    diff: (fromId: string, toId: string) =>
      client.get<AgentVersionDiffResult>(
        `/api/v1/agent-versions/diff?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`,
      ),

    rollback: (id: string) =>
      client.post<{
        ok: true
        restoredVersionId: string
        currentSnapshot: AgentVersionSnapshot
      }>(`/api/v1/agent-versions/${id}/rollback`),
  }
}
