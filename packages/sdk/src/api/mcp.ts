import type { OpenAgentsClient } from '../client'

export interface McpServerView {
  id: string
  name: string
  transport: 'stdio' | 'http'
  enabled: boolean
  command?: string
  args: string[]
  envKeys: string[]
  url?: string
  headerNames: string[]
  toolCount: number
  lastStatus: string
  lastError: string | null
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateMcpServerInput {
  name: string
  transport?: 'stdio' | 'http'
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  secretEnv?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  secretHeaders?: Record<string, string>
  enabled?: boolean
}

export interface McpConnectResult {
  ok: boolean
  toolCount?: number
  error?: string
  tools: Array<Record<string, unknown>>
}

const BASE = '/api/v1/mcp/servers'

export function createMcpApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<McpServerView[]>(BASE),

    get: (id: string) => client.get<McpServerView>(`${BASE}/${encodeURIComponent(id)}`),

    create: (input: CreateMcpServerInput) => client.post<McpServerView>(BASE, input),

    update: (id: string, patch: Partial<CreateMcpServerInput> & { enabled?: boolean }) =>
      client.patch<McpServerView>(`${BASE}/${encodeURIComponent(id)}`, patch),

    remove: (id: string) => client.delete<{ ok: boolean }>(`${BASE}/${encodeURIComponent(id)}`),

    /** Connect (or reconnect) and discover the server's tools. */
    connect: (id: string) => client.post<McpConnectResult>(`${BASE}/${encodeURIComponent(id)}/connect`),

    /** Test a connection without persisting status. */
    test: (id: string) => client.post<McpConnectResult>(`${BASE}/${encodeURIComponent(id)}/test`),

    /** Tools a server currently exposes. */
    tools: (id: string) => client.get<Array<Record<string, unknown>>>(`${BASE}/${encodeURIComponent(id)}/tools`),
  }
}
