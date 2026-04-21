import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class SkillSaveTool {
  def: ToolDefinition = {
    name: 'skill_save',
    displayName: 'Save Skill',
    description: 'Save a reusable skill (procedure) to your personal skill library so you can invoke it again later by name. Use after completing a complex multi-step task that is worth repeating.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short slug-style name for the skill (e.g. "weekly-report")' },
        description: { type: 'string', description: 'What this skill does in one sentence' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered list of steps that describe how to complete this skill',
        },
        tools_used: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of tools used in this skill',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Category tags for the skill (e.g. ["research", "writing"])',
        },
        trigger_phrase: {
          type: 'string',
          description: 'Optional phrase the user might say to trigger this skill (e.g. "create weekly report")',
        },
      },
      required: ['name', 'description', 'steps'],
    },
  }

  constructor(private prisma: PrismaService) {}

  async run(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const name = String(input.name ?? '').trim().toLowerCase().replace(/\s+/g, '-')
    const description = String(input.description ?? '').trim()
    const steps: string[] = Array.isArray(input.steps) ? input.steps.map(String) : []
    const toolsUsed: string[] = Array.isArray(input.tools_used) ? input.tools_used.map(String) : []
    const tags: string[] = Array.isArray(input.tags) ? input.tags.map(String) : []
    const triggerPhrase = input.trigger_phrase ? String(input.trigger_phrase).trim() : null

    if (!name || !description || steps.length === 0) {
      return { success: false, output: null, error: 'name, description, and steps are required' }
    }

    // Upsert by userId + name
    const existing = await this.prisma.userSkill.findFirst({ where: { userId, name } })

    const data = {
      name,
      description,
      steps: JSON.stringify(steps),
      toolsUsed: JSON.stringify(toolsUsed),
      tags: JSON.stringify(tags),
      triggerPhrase,
    }

    let skill: { id: string; name: string }
    if (existing) {
      skill = await this.prisma.userSkill.update({ where: { id: existing.id }, data })
    } else {
      skill = await this.prisma.userSkill.create({ data: { ...data, userId } })
    }

    return {
      success: true,
      output: {
        id: skill.id,
        name: skill.name,
        message: existing ? `Skill "${name}" updated.` : `Skill "${name}" saved to your library.`,
      },
    }
  }
}
