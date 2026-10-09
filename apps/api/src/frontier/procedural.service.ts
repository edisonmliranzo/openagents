import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { PlaybooksService } from '../playbooks/playbooks.service'
import { flag, clamp } from './frontier.util'

interface SequenceHit {
  tools: string[]
  count: number
  exampleTask: string
}

@Injectable()
export class ProceduralService {
  private readonly logger = new Logger(ProceduralService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly moduleRef: ModuleRef,
  ) {}

  get enabled(): boolean {
    return flag(this.config, 'PROCEDURAL_LEARNING')
  }

  // Lazy global lookup: PlaybooksModule -> AgentModule -> FrontierModule would
  // otherwise be a hard module-import cycle at decorator evaluation time.
  private playbooks(): PlaybooksService {
    return this.moduleRef.get(PlaybooksService, { strict: false })
  }

  async mine(userId: string): Promise<{ found: number; created: string[] }> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const runs = await this.prisma.agentRun.findMany({
      where: { status: 'done', startedAt: { gte: since }, conversation: { userId } },
      orderBy: { startedAt: 'desc' },
      take: 300,
      select: { conversationId: true },
    })

    const sequences = new Map<string, SequenceHit>()
    for (const run of runs) {
      const toolMsgs = await this.prisma.message.findMany({
        where: { conversationId: run.conversationId, role: 'tool', createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        take: 12,
        select: { toolCallJson: true },
      })
      const names: string[] = []
      for (const msg of toolMsgs) {
        try {
          const parsed = JSON.parse(msg.toolCallJson ?? '[]')
          const list = Array.isArray(parsed) ? parsed : [parsed]
          for (const call of list) {
            const name = typeof call?.name === 'string' ? call.name : null
            if (name && name !== names[names.length - 1]) names.push(name)
          }
        } catch {
          /* skip malformed */
        }
      }
      if (names.length < 2) continue
      const userMsg = await this.prisma.message.findFirst({
        where: { conversationId: run.conversationId, role: 'user' },
        orderBy: { createdAt: 'asc' },
        select: { content: true },
      })
      for (let len = 2; len <= Math.min(4, names.length); len += 1) {
        for (let start = 0; start + len <= names.length; start += 1) {
          const seq = names.slice(start, start + len)
          const key = seq.join('>')
          const hit = sequences.get(key) ?? { tools: seq, count: 0, exampleTask: userMsg?.content ?? '' }
          hit.count += 1
          sequences.set(key, hit)
        }
      }
    }

    const repeated = [...sequences.values()]
      .filter((s) => s.count >= 2 && s.tools.length >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const created: string[] = []
    for (const seq of repeated) {
      const name = `Routine: ${seq.tools.join(' → ')}`
      const existing = await this.playbooks().list(userId)
      if (existing.some((p: any) => p.name === name)) continue
      const titled = await this.nameRoutine(seq)
      await this.playbooks().create(userId, {
        name: titled.name,
        description: `Auto-mined from ${seq.count} successful runs. Tools: ${seq.tools.join(', ')}.`,
        targetKind: 'agent_prompt',
        parameterSchema: [{ key: 'task', label: 'Task', type: 'text', required: true, description: 'What to accomplish with this routine' }],
        promptTemplate: `Use this proven sequence of steps to accomplish the task: ${seq.tools.join(' → ')}.\n\nTask: {{task}}`,
      })
      created.push(titled.name)
    }
    return { found: repeated.length, created }
  }

  private async nameRoutine(seq: SequenceHit): Promise<{ name: string }> {
    try {
      const res = await this.llm.complete(
        [{ role: 'user', content: `Tool sequence used successfully ${seq.count} times for tasks like: "${clamp(seq.exampleTask, 160)}"\nSequence: ${seq.tools.join(' → ')}\n\nReply JSON only: {"name": "short title <=50 chars"}` }],
        [],
        'You give short human-friendly names to repeated AI action routines.',
        'ollama',
      )
      const match = res.content.match(/\{[\s\S]*\}/)
      const parsed = match ? JSON.parse(match[0]) : null
      const candidate = typeof parsed?.name === 'string' ? parsed.name.trim() : ''
      // Reject prompt echoes and junk ("short title <=50 chars", quotes, markup).
      const looksValid =
        candidate.length >= 3 &&
        candidate.length <= 60 &&
        /^[A-Za-z0-9][A-Za-z0-9 \-&:'().,]+$/.test(candidate) &&
        !/[<>]|chars|title|name/i.test(candidate)
      if (looksValid) return { name: candidate }
    } catch (err: any) {
      this.logger.debug(`Routine naming skipped: ${err?.message ?? err}`)
    }
    return { name: `Routine: ${seq.tools.join(' → ')}` }
  }
}
