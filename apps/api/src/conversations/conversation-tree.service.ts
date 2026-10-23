import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { DocumentStore } from '../prisma/document-store.service'
import { ConversationsService } from './conversations.service'

interface BranchLink {
  parentId: string
  fromMessageId: string
  createdAt: string
}

export interface ConversationTreeNode {
  id: string
  title: string | null
  parentId: string | null
  fromMessageId: string | null
  messageCount: number
  createdAt: string
  lastMessageAt: string | null
  children: ConversationTreeNode[]
}

/**
 * Time-travel branching. Branch links live in a JSON store
 * (data/conversation-tree/<safeUserId>.json) so no schema migration is needed.
 */
const KIND = 'conversation_tree'

@Injectable()
export class ConversationTreeService {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly documents: DocumentStore,
  ) {}

  private async readLinks(userId: string): Promise<Record<string, BranchLink>> {
    const parsed = await this.documents.read<{ links?: Record<string, BranchLink> }>(userId, KIND, () => ({}))
    return parsed.links ?? {}
  }

  private writeLink(userId: string, childId: string, link: BranchLink) {
    const run = async () => {
      const links = await this.readLinks(userId)
      links[childId] = link
      await this.documents.write(userId, KIND, { links })
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }

  async branch(userId: string, conversationId: string, fromMessageId: string) {
    const parent = await this.conversations.get(conversationId, userId)
    const anchor = await this.prisma.message.findFirst({
      where: { id: fromMessageId, conversationId },
      select: { createdAt: true },
    })
    if (!anchor) throw new NotFoundException('Message not found')

    const history = await this.prisma.message.findMany({
      where: { conversationId, createdAt: { lte: anchor.createdAt } },
      orderBy: { createdAt: 'asc' },
    })

    const baseTitle = parent.title?.trim() || 'Conversation'
    const created = await this.prisma.conversation.create({
      data: {
        userId,
        title: `${baseTitle.replace(/( \(branch\))+$/, '')} (branch)`.slice(0, 200),
        model: parent.model,
        modelProvider: parent.modelProvider,
        personality: parent.personality,
        thinkingLevel: parent.thinkingLevel,
        reasoningLevel: parent.reasoningLevel,
        verboseLevel: parent.verboseLevel,
        lastMessageAt: history.length ? history[history.length - 1].createdAt : new Date(),
      },
    })

    if (history.length) {
      await this.prisma.message.createMany({
        data: history.map((m) => ({
          conversationId: created.id,
          role: m.role,
          content: m.content,
          status: m.status === 'pending' || m.status === 'streaming' ? 'done' : m.status,
          toolCallJson: m.toolCallJson,
          toolResultJson: m.toolResultJson,
          metadata: m.metadata,
          createdAt: m.createdAt,
        })),
      })
    }

    await this.writeLink(userId, created.id, { parentId: conversationId, fromMessageId, createdAt: new Date().toISOString() })
    return { conversation: created, parentId: conversationId, fromMessageId, copiedMessages: history.length }
  }

  /** Returns the whole tree (root + all descendants) that contains the conversation. */
  async tree(userId: string, conversationId: string) {
    await this.conversations.get(conversationId, userId)
    const links = await this.readLinks(userId)

    let rootId = conversationId
    const seen = new Set<string>([rootId])
    while (links[rootId] && !seen.has(links[rootId].parentId)) {
      rootId = links[rootId].parentId
      seen.add(rootId)
    }

    const childrenOf = new Map<string, string[]>()
    for (const [child, link] of Object.entries(links)) {
      const arr = childrenOf.get(link.parentId) ?? []
      arr.push(child)
      childrenOf.set(link.parentId, arr)
    }
    const ids = new Set<string>()
    const stack = [rootId]
    while (stack.length) {
      const id = stack.pop()!
      if (ids.has(id)) continue
      ids.add(id)
      stack.push(...(childrenOf.get(id) ?? []))
    }

    const rows = await this.prisma.conversation.findMany({
      where: { id: { in: [...ids] }, userId },
      select: { id: true, title: true, createdAt: true, lastMessageAt: true, _count: { select: { messages: true } } },
    })
    const byId = new Map(rows.map((r) => [r.id, r]))
    const build = (id: string, depth = 0): ConversationTreeNode | null => {
      const row = byId.get(id)
      if (!row || depth > 50) return null
      return {
        id,
        title: row.title,
        parentId: links[id]?.parentId ?? null,
        fromMessageId: links[id]?.fromMessageId ?? null,
        messageCount: row._count.messages,
        createdAt: row.createdAt.toISOString(),
        lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
        children: (childrenOf.get(id) ?? [])
          .map((c) => build(c, depth + 1))
          .filter((n): n is ConversationTreeNode => Boolean(n))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }
    }
    return { rootId, currentId: conversationId, root: build(rootId) }
  }
}
