import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { ModelRouterService } from '../agent/model-router.service'
import { flag, clamp } from './frontier.util'

const CYCLE_MS = 6 * 60 * 60 * 1000

@Injectable()
export class PromptRepairService {
  private readonly logger = new Logger(PromptRepairService.name)
  private timer: NodeJS.Timeout | null = null
  private lastRunDay = ''

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly modelRouter: ModelRouterService,
  ) {}

  get enabled(): boolean {
    return flag(this.config, 'PROMPT_REPAIR')
  }

  onModuleInit() {
    if (!this.enabled) return
    this.timer = setInterval(() => void this.maybeRun(), CYCLE_MS)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private async maybeRun() {
    const now = new Date()
    if (now.getHours() !== 3 || now.getMinutes() > 59) return
    const day = now.toISOString().slice(0, 10)
    if (this.lastRunDay === day) return
    this.lastRunDay = day
    await this.runForAllUsers().catch((err) => this.logger.warn(`Prompt repair cycle failed: ${err?.message ?? err}`))
  }

  async runForAllUsers() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const failures = await this.prisma.routingOutcome.groupBy({
      by: ['userId', 'taskClass'],
      where: { success: false, createdAt: { gte: since } },
      _count: { _all: true },
    })
    const targets = failures.filter((f) => f._count._all >= 3)
    const created: Array<{ userId: string; taskClass: string; rule: string }> = []
    for (const t of targets) {
      const rules = await this.repairFor(t.userId, t.taskClass).catch(() => [])
      created.push(...rules.map((r) => ({ userId: t.userId, taskClass: t.taskClass, rule: r })))
    }
    return { checked: failures.length, repaired: created.length, rules: created }
  }

  async repairFor(userId: string, taskClass: string): Promise<string[]> {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const messages = await this.prisma.message.findMany({
      where: { role: 'user', createdAt: { gte: since }, conversation: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: { content: true },
    })
    const samples = messages
      .map((m) => m.content)
      .filter((c) => this.modelRouter.classify(c) === taskClass)
      .slice(0, 5)
    if (!samples.length) return []

    const res = await this.llm.complete(
      [
        {
          role: 'user',
          content: `Task class: ${taskClass}\nRecent user requests in this class that went poorly:\n${samples.map((s, i) => `${i + 1}. ${clamp(s, 200)}`).join('\n')}\n\nReply with a JSON array (max 2 items) of objects {rule, reason}. Each rule is one imperative instruction (<=160 chars) that would help an assistant avoid failing these. No markdown, JSON only.`,
        },
      ],
      [],
      'You diagnose recurring failures of a personal AI assistant and write minimal system-prompt rules that fix them.',
      'ollama',
    )

    const parsed = this.parseRules(res.content)
    const created: string[] = []
    for (const { rule, reason } of parsed) {
      const exists = await this.prisma.promptPatch.findFirst({ where: { userId, taskClass, rule } })
      if (exists) continue
      await this.prisma.promptPatch.create({ data: { userId, taskClass, rule: rule.slice(0, 300), reason: reason.slice(0, 300), source: 'auto-repair' } })
      const actives = await this.prisma.promptPatch.findMany({ where: { userId, taskClass, active: true }, orderBy: { createdAt: 'desc' } })
      if (actives.length > 3) {
        await this.prisma.promptPatch.updateMany({ where: { id: { in: actives.slice(3).map((a) => a.id) } }, data: { active: false } })
      }
      created.push(rule)
    }
    return created
  }

  private parseRules(raw: string): Array<{ rule: string; reason: string }> {
    try {
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) return []
      const arr = JSON.parse(match[0])
      if (!Array.isArray(arr)) return []
      return arr
        .filter((x: any) => typeof x?.rule === 'string' && x.rule.trim().length > 8)
        .slice(0, 2)
        .map((x: any) => ({ rule: String(x.rule).trim(), reason: String(x.reason ?? '').trim() }))
    } catch {
      return []
    }
  }

  async rulesFor(userId: string, taskClass: string): Promise<string[]> {
    if (!this.enabled) return []
    const patches = await this.prisma.promptPatch.findMany({
      where: { userId, taskClass, active: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    })
    return patches.map((p) => p.rule)
  }

  async list(userId: string) {
    return this.prisma.promptPatch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 })
  }

  async setActive(userId: string, id: string, active: boolean) {
    return this.prisma.promptPatch.updateMany({ where: { id, userId }, data: { active } })
  }

  async remove(userId: string, id: string) {
    return this.prisma.promptPatch.deleteMany({ where: { id, userId } })
  }
}
