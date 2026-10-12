import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'

export interface CrmPerson {
  id: string
  name: string
  summary: string
  mentions: number
  lastSeenAt: Date | null
  daysSince: number | null
  bucket: 'fresh' | 'warm' | 'stale' | 'cold'
}

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
  ) {}

  /**
   * Relationship health from the entity graph + message history. People the
   * agent has seen in conversations, bucketed by recency.
   */
  async roster(userId: string, workspaceId?: string): Promise<CrmPerson[]> {
    const people = await this.prisma.entityNode.findMany({
      where: { userId, type: 'person' },
      orderBy: [{ mentions: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
      select: { id: true, name: true, summary: true, mentions: true },
    })
    if (people.length === 0) return []

    // Workspace merge: combine graphs of all members (owner visibility).
    let userIds = [userId]
    if (workspaceId) {
      const members = await this.prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true },
      })
      if (members.length > 0) {
        const me = await this.prisma.workspaceMember.findFirst({
          where: { workspaceId, userId, role: { in: ['owner', 'admin'] } },
          select: { id: true },
        })
        if (me) userIds = [userId, ...members.map((m) => m.userId).filter((id) => id !== userId)]
      }
    }

    // Last mention per person: scan recent messages for the name.
    const since = new Date(Date.now() - 120 * 86400_000)
    const messages = await this.prisma.message.findMany({
      where: {
        conversation: { userId: { in: userIds } },
        createdAt: { gte: since },
        content: { not: '' },
      },
      orderBy: { createdAt: 'desc' },
      take: 600,
      select: { content: true, createdAt: true },
    })

    const now = Date.now()
    const result: CrmPerson[] = []
    for (const person of people) {
      const needle = person.name.toLowerCase()
      const hit = messages.find((m) => m.content.toLowerCase().includes(needle))
      const daysSince = hit ? Math.floor((now - hit.createdAt.getTime()) / 86400_000) : null
      const bucket: CrmPerson['bucket'] =
        daysSince === null ? 'cold' : daysSince <= 14 ? 'fresh' : daysSince <= 45 ? 'warm' : 'stale'
      result.push({
        id: person.id,
        name: person.name,
        summary: person.summary,
        mentions: person.mentions,
        lastSeenAt: hit?.createdAt ?? null,
        daysSince,
        bucket,
      })
    }
    return result.sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))
  }

  /** Draft a short, warm catch-up message for a stale contact. */
  async draftNudge(userId: string, personId: string) {
    const person = await this.prisma.entityNode.findFirst({
      where: { id: personId, userId },
      select: { name: true, summary: true },
    })
    if (!person) return { draft: `I could not find ${personId} in your contacts.` }
    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Write a 2-3 sentence catch-up message to ${person.name}. Context: ${person.summary || 'a contact'}. Warm, specific, no small-talk clichés, end with a light question. Output only the message text.`,
        },
      ],
      [],
      'You write personal messages that sound like a real person, not a template.',
      'ollama',
    )
    return { draft: res.content.trim() }
  }
}
