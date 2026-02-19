import type { OpenAgentsClient } from '../client'

export interface ToolDefinition {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
}

export function createToolsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<ToolDefinition[]>('/api/v1/tools'),
  }
}
