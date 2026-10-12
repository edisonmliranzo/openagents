import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { extractJson } from '../tasks/task-plan'
import { decideByRules, type RuleLike } from './life-logic'

@Injectable()
export class RulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
  ) {}

  list(userId: string) {
    return this.prisma.approvalRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  }

  create(userId: string, input: { toolPattern: string; decision?: string; note?: string }) {
    const pattern = String(input.toolPattern ?? '').trim()
    if (!pattern) throw new BadRequestException('toolPattern is required (e.g. calendar_*)')
    const decision = ['allow', 'deny'].includes(String(input.decision)) ? String(input.decision) : 'allow'
    return this.prisma.approvalRule.create({
      data: { userId, toolPattern: pattern.slice(0, 120), decision, note: String(input.note ?? '').slice(0, 300) },
    })
  }

  async update(userId: string, id: string, patch: { enabled?: boolean; decision?: string }) {
    const rule = await this.prisma.approvalRule.findFirst({ where: { id, userId } })
    if (!rule) throw new NotFoundException('Rule not found')
    const data: Record<string, unknown> = {}
    if (typeof patch.enabled === 'boolean') data.enabled = patch.enabled
    if (['allow', 'deny'].includes(String(patch.decision))) data.decision = patch.decision
    return this.prisma.approvalRule.update({ where: { id }, data: data as any })
  }

  async remove(userId: string, id: string) {
    const rule = await this.prisma.approvalRule.findFirst({ where: { id, userId } })
    if (!rule) throw new NotFoundException('Rule not found')
    await this.prisma.approvalRule.delete({ where: { id } })
    return { ok: true }
  }

  /** Natural-language policy → concrete rules. "always allow calendar, never email". */
  async compile(userId: string, sentence: string) {
    const text = String(sentence ?? '').trim()
    if (text.length < 5) throw new BadRequestException('Describe the policy in a sentence.')
    const connected = await this.prisma.connectedTool.findMany({
      where: { userId },
      select: { toolId: true },
      take: 200,
    })
    const toolIds = connected.map((t) => t.toolId)
    const toolRows = toolIds.length
      ? await this.prisma.tool.findMany({ where: { id: { in: toolIds } }, select: { name: true }, take: 200 })
      : []
    const toolNames = [...new Set(toolRows.map((t) => t.name))].slice(0, 120)
    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Translate this approval policy into rules. Known tools: ${toolNames.join(', ') || '(unknown)'}\nPolicy: "${text}"\n\nReply with JSON only: {"rules":[{"toolPattern":"glob like gmail_*","decision":"allow|deny","note":"short reason"}]}. Use * as wildcard. Prefer specific patterns over bare *. Max 6 rules.`,
        },
      ],
      [],
      'You compile natural language into precise tool rules. Output one JSON object and nothing else.',
      'ollama',
    )
    const parsed = (extractJson(res.content) ?? {}) as { rules?: Array<{ toolPattern?: string; decision?: string; note?: string }> }
    const rules = (parsed.rules ?? [])
      .filter((r) => r?.toolPattern)
      .slice(0, 6)
      .map((r) => ({
        toolPattern: String(r.toolPattern).slice(0, 120),
        decision: r.decision === 'deny' ? 'deny' : 'allow',
        note: String(r.note ?? '').slice(0, 300),
      }))
    if (rules.length === 0) throw new BadRequestException('Could not parse that policy into rules. Try naming tools explicitly.')

    const created = []
    for (const r of rules) created.push(await this.prisma.approvalRule.create({ data: { userId, ...r } }))
    return created
  }

  /** The decision hook the task runtime calls before pausing for approval. */
  async decide(userId: string, tool: string): Promise<'allow' | 'deny' | null> {
    const rules: RuleLike[] = await this.prisma.approvalRule.findMany({
      where: { userId, enabled: true },
      select: { toolPattern: true, decision: true, enabled: true },
    })
    return decideByRules(rules, tool)
  }
}
