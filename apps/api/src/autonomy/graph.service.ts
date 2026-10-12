import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { extractJson } from '../tasks/task-plan'
import { mergeGraph, type ExtractedEntity, type ExtractedRelation } from './autonomy-logic'

export interface GraphData {
  nodes: Array<{ id: string; name: string; type: string; summary: string; mentions: number }>
  edges: Array<{ from: string; to: string; relation: string; weight: number }>
}

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
  ) {}

  /** Read the graph: top nodes by mentions with their strongest edges. */
  async getGraph(userId: string, limit = 80): Promise<GraphData> {
    const nodes = await this.prisma.entityNode.findMany({
      where: { userId },
      orderBy: [{ mentions: 'desc' }, { updatedAt: 'desc' }],
      take: Math.min(limit, 200),
      select: { id: true, name: true, type: true, summary: true, mentions: true },
    })
    if (nodes.length === 0) return { nodes: [], edges: [] }
    const ids = nodes.map((n) => n.id)
    const edges = await this.prisma.entityEdge.findMany({
      where: { userId, OR: [{ fromId: { in: ids } }, { toId: { in: ids } }] },
      orderBy: { weight: 'desc' },
      take: 300,
      select: { fromId: true, toId: true, relation: true, weight: true },
    })
    const byId = new Map(nodes.map((n) => [n.id, n.name]))
    return {
      nodes,
      edges: edges
        .map((e) => ({ from: byId.get(e.fromId), to: byId.get(e.toId), relation: e.relation, weight: e.weight }))
        .filter((e): e is { from: string; to: string; relation: string; weight: number } => Boolean(e.from && e.to)),
    }
  }

  /**
   * Extract entities/relations from recent conversations and merge them into
   * the graph. Runs on demand and on a nightly cadence (see onModuleInit-less
   * trigger from frontier cron).
   */
  async rebuildFromConversations(userId: string, maxMessages = 60): Promise<{ nodes: number; edges: number }> {
    const conversations = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true },
    })
    if (conversations.length === 0) return { nodes: 0, edges: 0 }

    const messages = await this.prisma.message.findMany({
      where: { conversationId: { in: conversations.map((c) => c.id) }, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'desc' },
      take: maxMessages,
      select: { role: true, content: true },
    })
    if (messages.length === 0) return { nodes: 0, edges: 0 }

    const transcript = messages
      .reverse()
      .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${String(m.content).slice(0, 400)}`)
      .join('\n')
      .slice(0, 24000)

    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Transcript of a user talking with their AI assistant:\n\n${transcript}\n\nExtract the people, companies, projects, topics and places discussed and how they relate. Reply with JSON only: {"entities":[{"name":"...","type":"person|company|project|topic|place|other","summary":"5-15 words"}],"relations":[{"from":"...","to":"...","relation":"verb phrase"}]}. Names must appear in the transcript. No commentary.`,
        },
      ],
      [],
      'You extract structured knowledge from conversations. Output one JSON object and nothing else.',
      'ollama',
    )

    const parsed = (extractJson(res.content) ?? {}) as { entities?: ExtractedEntity[]; relations?: ExtractedRelation[] }
    const { nodes, edges } = mergeGraph(parsed.entities ?? [], parsed.relations ?? [])
    const counts = await this.persist(userId, nodes, edges)
    this.logger.log(`Graph rebuild for ${userId}: +${counts.nodes} nodes, +${counts.edges} edges`)
    return counts
  }

  private async persist(userId: string, nodes: ExtractedEntity[], edges: ExtractedRelation[]) {
    const idByKey = new Map<string, string>()
    for (const node of nodes) {
      const key = `${node.type}:${node.name.toLowerCase()}`
      const row = await this.prisma.entityNode.upsert({
        where: { userId_name_type: { userId, name: node.name, type: node.type } },
        create: { userId, name: node.name, type: node.type, summary: node.summary ?? '', mentions: 1 },
        update: {
          mentions: { increment: 1 },
          ...(node.summary ? { summary: node.summary } : {}),
        },
      })
      idByKey.set(key, row.id)
      idByKey.set(`name:${node.name.toLowerCase()}`, row.id)
    }

    let edgeCount = 0
    for (const edge of edges) {
      const fromId = idByKey.get(`name:${edge.from.toLowerCase()}`)
      const toId = idByKey.get(`name:${edge.to.toLowerCase()}`)
      if (!fromId || !toId) continue
      await this.prisma.entityEdge.upsert({
        where: { userId_fromId_toId_relation: { userId, fromId, toId, relation: edge.relation } },
        create: { userId, fromId, toId, relation: edge.relation, weight: 1 },
        update: { weight: { increment: 1 } },
      })
      edgeCount += 1
    }
    return { nodes: nodes.length, edges: edgeCount }
  }

  async deleteNode(userId: string, id: string) {
    const node = await this.prisma.entityNode.findFirst({ where: { id, userId } })
    if (!node) throw new NotFoundException('Entity not found')
    await this.prisma.entityNode.delete({ where: { id } })
    return { ok: true }
  }

  /** Compact text form for injection into the agent's system prompt. */
  async promptContext(userId: string, maxNodes = 12): Promise<string> {
    const graph = await this.getGraph(userId, maxNodes)
    if (graph.nodes.length === 0) return ''
    const nodeLines = graph.nodes.slice(0, maxNodes).map((n) => `- ${n.name} (${n.type})${n.summary ? `: ${n.summary}` : ''}`)
    const edgeLines = graph.edges.slice(0, 20).map((e) => `- ${e.from} —${e.relation}→ ${e.to}`)
    return `Known entities:\n${nodeLines.join('\n')}\nRelationships:\n${edgeLines.join('\n')}`
  }
}
