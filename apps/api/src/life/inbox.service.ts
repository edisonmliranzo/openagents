import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ToolsService } from '../tools/tools.service'
import { LLMService } from '../agent/llm.service'
import { NotificationsService } from '../notifications/notifications.service'
import { extractJson } from '../tasks/task-plan'

const BUCKETS = ['action', 'waiting', 'read', 'archive'] as const

interface TriagedItem {
  from: string
  subject: string
  bucket: (typeof BUCKETS)[number]
  action: string
  threadId?: string
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolsService,
    private readonly llm: LLMService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Pull the latest inbox via the gmail_search tool, triage with the LLM and
   * store a digest. Never sends anything — replies stay drafts until approved.
   */
  async triage(userId: string, query = 'is:inbox newer_than:7d') {
    const available = await this.tools.getAvailableForUser(userId).catch(() => [] as any[])
    if (!available.some((t: any) => t.name === 'gmail_search')) {
      throw new Error('Gmail is not connected. Add the Gmail connector in Tools first.')
    }

    const search: any = await this.tools.execute('gmail_search', { query, maxResults: 15 }, userId)
    if (search?.success === false) throw new Error(String(search?.error ?? 'gmail_search failed'))
    const messages = Array.isArray(search?.data) ? search.data : Array.isArray(search?.output) ? search.output : []
    if (messages.length === 0) {
      const digest = await this.prisma.inboxDigest.create({
        data: { userId, summary: 'Inbox is clear — nothing needed triage.', items: '[]' },
      })
      return digest
    }

    const lines = messages
      .slice(0, 15)
      .map((m: any, i: number) => `${i + 1}. from=${m.from ?? m.sender ?? '?'} | subject=${m.subject ?? '(no subject)'} | snippet=${String(m.snippet ?? m.body ?? '').slice(0, 160)} | threadId=${m.threadId ?? m.id ?? ''}`)
      .join('\n')

    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Triage these emails for a busy owner. Buckets: action (owner must do something), waiting (waiting on someone else), read (worth reading, no action), archive (noise). For action items add a short suggested action.\n\n${lines}\n\nReply with JSON only: {"items":[{"from":"...","subject":"...","bucket":"action|waiting|read|archive","action":"short suggested action or empty","threadId":"..."}],"summary":"2 sentences on the state of the inbox"}`,
        },
      ],
      [],
      'You triage email precisely. Output one JSON object and nothing else.',
      'ollama',
    )

    const parsed = (extractJson(res.content) ?? {}) as { items?: TriagedItem[]; summary?: string }
    const items = (parsed.items ?? [])
      .filter((i) => i && typeof i.subject === 'string')
      .map((i) => ({ ...i, bucket: (BUCKETS as readonly string[]).includes(i.bucket) ? i.bucket : 'read' }))
      .slice(0, 20)
    const summary = String(parsed.summary ?? 'Digest ready.').slice(0, 600)

    const digest = await this.prisma.inboxDigest.create({
      data: { userId, summary, items: JSON.stringify(items) },
    })

    const actionCount = items.filter((i) => i.bucket === 'action').length
    if (actionCount > 0) {
      await this.notifications
        .create(userId, 'Inbox: needs your action', `${actionCount} email(s) need action. ${summary}`, 'info')
        .catch(() => undefined)
    }
    return digest
  }

  latest(userId: string) {
    return this.prisma.inboxDigest.findFirst({ where: { userId }, orderBy: { triagedAt: 'desc' } })
  }

  list(userId: string) {
    return this.prisma.inboxDigest.findMany({ where: { userId }, orderBy: { triagedAt: 'desc' }, take: 14 })
  }
}
