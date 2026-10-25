import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { ToolPermissionsService } from '../../permissions/tool-permissions.service'

/**
 * Chat-driven management of opencode-style permission rules. When the user
 * says "never use shell_execute" or "always let me approve postgres_query",
 * the agent updates the rules; enforcement happens in the agent tool loop.
 */
@Injectable()
export class PermissionsTool {
  constructor(private readonly permissions: ToolPermissionsService) {}

  get listDef(): ToolDefinition {
    return {
      name: 'permissions_list',
      displayName: 'List Permission Rules',
      description:
        "List the user's tool permission rules. Rules are ordered and the FIRST match wins: each rule has a tool name or trailing-glob pattern (e.g. 'web_*', or '*' for all tools) and an effect: 'deny' (never run), 'ask' (always request approval first), or 'allow' (run without approval).",
      requiresApproval: false,
      inputSchema: { type: 'object', properties: {} },
    }
  }

  get setDef(): ToolDefinition {
    return {
      name: 'permissions_set',
      displayName: 'Set Permission Rules',
      description:
        "Replace the user's full ordered permission rule list (first match wins). Use when the user states a standing preference about tools, e.g. \"never run shell_execute\", \"always ask before postgres_query\", \"web tools are always fine\". Body rules: [{ tool: 'shell_execute' | 'web_*' | '*', effect: 'deny' | 'ask' | 'allow', note?: 'why' }]. IMPORTANT: this replaces the whole list — read it first with permissions_list, merge, then set.",
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          rules: {
            type: 'array',
            description: 'The complete ordered rule list (first match wins)',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', description: 'Exact tool name, trailing-glob like "web_*", or "*"' },
                effect: { type: 'string', description: 'deny | ask | allow' },
                note: { type: 'string', description: 'Why this rule exists (shown when it blocks)' },
              },
              required: ['tool', 'effect'],
            },
          },
        },
        required: ['rules'],
      },
    }
  }

  async list(_input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const state = await this.permissions.get(userId)
      return { success: true, output: { rules: state.rules, updatedAt: state.updatedAt } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to read permission rules.' }
    }
  }

  async set(input: { rules?: unknown }, userId: string): Promise<ToolResult> {
    try {
      if (!Array.isArray(input?.rules)) {
        return { success: false, output: null, error: 'rules must be an array of { tool, effect, note? }.' }
      }
      const state = await this.permissions.set(userId, input.rules)
      return {
        success: true,
        output: {
          rules: state.rules,
          updatedAt: state.updatedAt,
          message: `Saved ${state.rules.length} permission rule(s). 'deny' rules hard-block immediately; 'ask' rules always request approval; 'allow' rules skip approval.`,
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to save permission rules.' }
    }
  }
}
