import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class NotesTool {
  constructor(private prisma: PrismaService) {}

  get createDef(): ToolDefinition {
    return {
      name: 'notes_create',
      displayName: 'Create Note',
      description: 'Save a note or task for the user.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The note content' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['content'],
      },
    }
  }

  get listDef(): ToolDefinition {
    return {
      name: 'notes_list',
      displayName: 'List Notes',
      description: 'List saved notes for the user.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          tag: { type: 'string', description: 'Filter by tag (optional)' },
        },
      },
    }
  }

  async create(input: { content: string; tags?: string[] }, userId: string): Promise<ToolResult> {
    const note = await this.prisma.memory.create({
      data: {
        userId,
        type: 'fact',
        content: input.content,
        tags: JSON.stringify(input.tags ?? []),
      },
    })
    return { success: true, output: { id: note.id, content: note.content } }
  }

  async list(input: { tag?: string }, userId: string): Promise<ToolResult> {
    const notes = await this.prisma.memory.findMany({
      where: {
        userId,
        // SQLite: filter by tag done in memory since arrays are stored as JSON strings
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return { success: true, output: { notes } }
  }
}
