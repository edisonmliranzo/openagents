import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import { PrismaService } from '../../prisma/prisma.service'
import type { ToolDefinition } from '../tools.service'

/**
 * When the agent hits a capability gap (no tool for an API/service), it can
 * draft a reusable skill from an HTTP endpoint description. The user approves
 * it from the Ideas tab — same review flow as skill suggestions.
 */
@Injectable()
export class ApiToolProposalTool {
  constructor(private readonly prisma: PrismaService) {}

  get def(): ToolDefinition {
    return {
      name: 'propose_api_tool',
      displayName: 'Propose API Tool',
      description:
        'You lack a tool for a service the user needs. Draft a reusable skill that calls the service HTTP API (documented endpoint, method, auth header, example request). Saved as a pending suggestion the user can approve. Use when you can tell the user exactly how to call the API yourself next time.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name (e.g. "Stripe charges lookup")' },
          description: { type: 'string', description: 'What it does and when to use it' },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exact steps: endpoint URL, method, auth header env var, example curl, how to parse the response',
          },
        },
        required: ['name', 'description', 'steps'],
      },
    }
  }

  async run(input: { name: string; description: string; steps: string[] }, userId: string): Promise<ToolResult> {
    const name = String(input.name ?? '').trim().slice(0, 100)
    const description = String(input.description ?? '').trim().slice(0, 500)
    const steps = Array.isArray(input.steps) ? input.steps.map(String).filter(Boolean).slice(0, 12) : []
    if (!name || !description || steps.length === 0) {
      return { success: false, output: null, error: 'name, description, and at least one step are required.' }
    }

    const sourcePattern = `api-tool:${name.toLowerCase().replace(/\s+/g, '-')}`
    const existing = await this.prisma.skillSuggestion.findFirst({ where: { userId, sourcePattern } })
    if (existing) {
      return { success: true, output: { status: existing.status, note: 'A proposal for this tool already exists.' } }
    }

    const suggestion = await this.prisma.skillSuggestion.create({
      data: {
        userId,
        name,
        description: `API tool proposal — ${description}`,
        steps: JSON.stringify(steps),
        tags: JSON.stringify(['api-tool', 'proposed-by-agent']),
        sourcePattern,
        status: 'pending',
      },
    })

    return {
      success: true,
      output: {
        status: 'proposed',
        suggestionId: suggestion.id,
        note: 'Saved as a pending suggestion. The user can approve it from the Ideas tab.',
      },
    }
  }
}
