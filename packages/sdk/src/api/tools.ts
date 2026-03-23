import type { OpenAgentsClient } from '../client'
import type { ToolDryRunInput, ToolDryRunResult } from '@openagents/shared'

export interface ToolDefinition {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
  source?: 'builtin' | 'mcp'
  serverId?: string
  originalName?: string
}

export function createToolsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<ToolDefinition[]>('/api/v1/tools'),

    dryRun: (input: ToolDryRunInput) =>
      client.post<ToolDryRunResult>('/api/v1/tools/dry-run', input),
  }
}
