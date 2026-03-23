import type { PolicyEvaluationResult, PolicyScope } from './policy'

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

export interface ToolDryRunInput {
  toolName: string
  input?: Record<string, unknown>
}

export interface ToolDryRunResult {
  toolName: string
  requiresApproval: boolean
  ready: boolean
  connectorId: string | null
  connectorStatus: 'connected' | 'degraded' | 'down' | 'unknown'
  predictedScope: PolicyScope
  reversible: boolean
  estimatedCostUsd: number
  sideEffects: string[]
  warnings: string[]
  risk: PolicyEvaluationResult
  previewGeneratedAt: string
}
