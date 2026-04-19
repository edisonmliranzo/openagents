import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async exportConversations(userId: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
    const conversations = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
    }).catch(() => [])

    if (format === 'json') {
      return JSON.stringify({ exportedAt: new Date().toISOString(), userId, conversations }, null, 2)
    }

    // Markdown format
    const lines: string[] = [
      `# OpenAgents Conversation Export`,
      `Exported: ${new Date().toISOString()}`,
      `Total conversations: ${conversations.length}`,
      '',
    ]

    for (const conv of conversations) {
      lines.push(`---`)
      lines.push(`## Conversation: ${conv.title ?? conv.id}`)
      lines.push(`Created: ${conv.createdAt}`)
      lines.push('')
      for (const msg of conv.messages ?? []) {
        const role = msg.role === 'user' ? '**You**' : '**Agent**'
        lines.push(`${role}: ${msg.content ?? ''}`)
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  async exportMemory(userId: string): Promise<string> {
    const memories = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [])

    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      userId,
      totalEntries: memories.length,
      memories: memories.map((m: any) => ({
        id: m.id,
        content: m.content,
        type: m.type ?? 'fact',
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    }, null, 2)
  }

  async exportWorkflows(userId: string): Promise<string> {
    // Try to fetch workflows; fall back gracefully if table doesn't exist
    let workflows: any[] = []
    try {
      workflows = await (this.prisma as any).workflow?.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }) ?? []
    } catch {
      workflows = []
    }

    // Build YAML manually (no yaml library dependency)
    const lines: string[] = ['# OpenAgents Workflow Export', `# Generated: ${new Date().toISOString()}`, '']
    for (const wf of workflows) {
      lines.push(`- id: "${wf.id}"`)
      lines.push(`  name: "${(wf.name ?? '').replace(/"/g, '\\"')}"`)
      lines.push(`  description: "${(wf.description ?? '').replace(/"/g, '\\"')}"`)
      lines.push(`  status: "${wf.status ?? 'unknown'}"`)
      lines.push(`  createdAt: "${wf.createdAt}"`)
      lines.push(`  steps: ${wf.steps ? JSON.stringify(wf.steps) : '[]'}`)
      lines.push('')
    }
    if (workflows.length === 0) {
      lines.push('# No workflows found')
    }
    return lines.join('\n')
  }
}
