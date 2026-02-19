export type ToolCategory = 'email' | 'calendar' | 'web' | 'notes' | 'custom'
export type ToolStatus = 'available' | 'connected' | 'error'

export interface Tool {
  id: string
  name: string
  displayName: string
  description: string
  category: ToolCategory
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
}

export interface ConnectedTool {
  id: string
  userId: string
  toolId: string
  tool: Tool
  status: ToolStatus
  connectedAt: string
}
