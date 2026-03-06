export type ToolCategory = 'email' | 'calendar' | 'web' | 'notes' | 'custom' | 'mcp'
export type ToolStatus = 'available' | 'connected' | 'error'

export interface Tool {
  id: string
  name: string
  displayName: string
  description: string
  category: ToolCategory
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
  source?: 'builtin' | 'mcp'
  serverId?: string | null
  originalName?: string | null
}

export interface ConnectedTool {
  id: string
  userId: string
  toolId: string
  tool: Tool
  status: ToolStatus
  connectedAt: string
}
