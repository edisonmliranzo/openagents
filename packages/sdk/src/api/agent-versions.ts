import type {
  AgentVersionDiffResult,
  AgentVersionRollbackResult,
  AgentVersionSnapshot,
  CreateAgentVersionInput,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

export function createAgentVersionsApi(client: OpenAgentsClient) {
  return {
    /** Lists the caller's versions. Pass `agentId` to narrow to a single agent. */
    list: (agentId?: string) =>
      client.get<AgentVersionSnapshot[]>(
        agentId ? `/api/v1/agent-versions?agentId=${encodeURIComponent(agentId)}` : '/api/v1/agent-versions',
      ),
    get: (id: string) => client.get<AgentVersionSnapshot>(`/api/v1/agent-versions/id/${encodeURIComponent(id)}`),
    create: (input: CreateAgentVersionInput = {}) =>
      client.post<AgentVersionSnapshot>('/api/v1/agent-versions', input),
    diff: (fromId: string, toId: string) =>
      client.get<AgentVersionDiffResult>(
        `/api/v1/agent-versions/compare/${encodeURIComponent(fromId)}/${encodeURIComponent(toId)}`,
      ),
    rollback: (id: string) =>
      client.post<AgentVersionRollbackResult>(`/api/v1/agent-versions/${encodeURIComponent(id)}/rollback`),
  }
}
