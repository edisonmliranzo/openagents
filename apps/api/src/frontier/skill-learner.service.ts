import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { flag, clamp } from './frontier.util'
import {
  clusterPrompts,
  clusterKey,
  scoreSkill,
  MATCH_THRESHOLD,
  type PromptCluster,
} from './skill-cluster'

const LOOKBACK_DAYS = 30
const MIN_CLUSTER = 3
const MAX_CLUSTERS_PER_RUN = 5
const CYCLE_MS = 6 * 60 * 60 * 1000
const VALID_STATUS = ['active', 'draft', 'disabled'] as const
export type SkillStatus = (typeof VALID_STATUS)[number]

@Injectable()
export class SkillLearnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SkillLearnerService.name)
  private timer: NodeJS.Timeout | null = null
  private lastRunDay = ''

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
  ) {}

  get enabled(): boolean {
    return flag(this.config, 'SKILL_AUTO_LEARN')
  }

  /** New auto-learned skills go live immediately unless set to draft. */
  get autoActivate(): boolean {
    const raw = (this.config.get<string>('SKILL_AUTO_ACTIVATE') ?? 'true').trim().toLowerCase()
    return raw !== 'false' && raw !== '0' && raw !== 'off'
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
    if (now.getHours() < 4) return
    const day = now.toISOString().slice(0, 10)
    if (this.lastRunDay === day) return
    this.lastRunDay = day
    const users = await this.prisma.message.findMany({
      where: { role: 'user', createdAt: { gte: new Date(Date.now() - LOOKBACK_DAYS * 86400000) } },
      distinct: ['conversationId'],
      select: { conversation: { select: { userId: true } } },
      take: 500,
    })
    const ids = Array.from(new Set(users.map((u) => u.conversation?.userId).filter(Boolean))) as string[]
    for (const id of ids) {
      await this.learnForUser(id).catch((err) => this.logger.warn(`Skill learning failed for a user: ${err?.message ?? err}`))
    }
  }

  /** Learn skills from this user's real prompt history. Returns created/updated counts. */
  async learnForUser(userId: string): Promise<{ scanned: number; created: number; updated: number }> {
    const rows = await this.prisma.message.findMany({
      where: {
        role: 'user',
        createdAt: { gte: new Date(Date.now() - LOOKBACK_DAYS * 86400000) },
        conversation: { userId },
      },
      orderBy: { createdAt: 'desc' },
      take: 400,
      select: { content: true },
    })
    const prompts = rows
      .map((r) => r.content.trim())
      .filter((c) => c.length >= 20 && c.length <= 800 && !c.startsWith('/'))

    const clusters = clusterPrompts(prompts)
      .filter((c) => c.members.length >= MIN_CLUSTER)
      .sort((a, b) => b.members.length - a.members.length)
      .slice(0, MAX_CLUSTERS_PER_RUN)

    let created = 0
    let updated = 0
    for (const cluster of clusters) {
      const key = clusterKey(cluster)
      const existing = await this.prisma.userSkill.findFirst({ where: { userId, sourceKey: key } })
      if (existing) {
        await this.prisma.userSkill.update({
          where: { id: existing.id },
          data: {
            sourceCount: cluster.members.length,
            confidence: Math.min(1, cluster.members.length / 8),
          },
        })
        updated += 1
        continue
      }
      const distilled = await this.distill(cluster)
      if (!distilled) continue
      await this.prisma.userSkill.create({
        data: {
          userId,
          name: distilled.name,
          description: distilled.description,
          triggerPhrase: distilled.triggerPhrase,
          steps: JSON.stringify(distilled.steps),
          tags: JSON.stringify(distilled.tags),
          source: 'auto',
          sourceKey: key,
          status: this.autoActivate ? 'active' : 'draft',
          confidence: Math.min(1, cluster.members.length / 8),
          sourceCount: cluster.members.length,
        },
      })
      created += 1
    }
    if (created || updated) this.logger.log(`Skills for user: ${created} new, ${updated} updated from ${prompts.length} prompts`)
    return { scanned: prompts.length, created, updated }
  }

  private async distill(cluster: PromptCluster): Promise<{
    name: string
    description: string
    triggerPhrase: string
    steps: string[]
    tags: string[]
  } | null> {
    const examples = cluster.members.slice(0, 5).map((m, i) => `${i + 1}. ${clamp(m, 240)}`).join('\n')
    try {
      const res = await this.llm.complete(
        [
          {
            role: 'user',
            content: `The user repeatedly asks for variations of this task:\n${examples}\n\nDistill ONE reusable skill. Reply with JSON only: {"name": "<=50 chars", "description": "<=160 chars", "triggerPhrase": "<=8 key words", "steps": ["3 to 6 generic steps"], "tags": ["<=4 short tags"]}`,
          },
        ],
        [],
        'You turn repeated user requests into concise, generic, reusable skills. Steps describe how to do the task in general, never specific secrets, credentials or personal data.',
        'ollama',
      )
      const match = res.content.match(/\{[\s\S]*\}/)
      if (!match) return null
      const parsed = JSON.parse(match[0])
      const name = String(parsed.name ?? '').trim()
      const triggerPhrase = String(parsed.triggerPhrase ?? '').trim()
      if (name.length < 3 || triggerPhrase.length < 3) return null
      return {
        name: name.slice(0, 80),
        description: String(parsed.description ?? '').trim().slice(0, 200),
        triggerPhrase: triggerPhrase.slice(0, 120),
        steps: (Array.isArray(parsed.steps) ? parsed.steps : []).map((s: unknown) => String(s).slice(0, 200)).slice(0, 6),
        tags: (Array.isArray(parsed.tags) ? parsed.tags : []).map((s: unknown) => String(s).slice(0, 30)).slice(0, 4),
      }
    } catch (err: any) {
      this.logger.debug(`Skill distillation skipped: ${err?.message ?? err}`)
      return null
    }
  }

  /** Active skills that fit this message. Bumps usage counters for the matches. */
  async matchForMessage(userId: string, message: string) {
    if (!this.enabled) return []
    const skills = await this.prisma.userSkill.findMany({
      where: { userId, status: 'active' },
      take: 200,
    })
    const ranked = skills
      .map((s) => ({
        skill: s,
        score: scoreSkill(message, {
          id: s.id,
          name: s.name,
          triggerPhrase: s.triggerPhrase,
          tags: parseList(s.tags),
        }),
      }))
      .filter((r) => r.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
    if (ranked.length) {
      void this.prisma.userSkill
        .updateMany({
          where: { id: { in: ranked.map((r) => r.skill.id) } },
          data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
        })
        .catch(() => undefined)
    }
    return ranked.map((r) => r.skill)
  }

  /** Prompt block. Skills guide method only; they never override policy or approvals. */
  renderBlock(skills: Array<{ name: string; description: string; steps: string }>): string {
    if (!skills.length) return ''
    const lines = skills.map((s) => {
      const steps = parseList(s.steps).slice(0, 6)
      return `- ${s.name}: ${s.description}${steps.length ? `\n  Steps: ${steps.join(' → ')}` : ''}`
    })
    return [
      'Relevant learned skills (user-taught workflows). Use them as a suggested approach only.',
      'They never override safety rules, tool approvals, or the user’s explicit instructions.',
      ...lines,
    ].join('\n')
  }

  list(userId: string) {
    return this.prisma.userSkill.findMany({
      where: { userId },
      orderBy: [{ source: 'asc' }, { timesUsed: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })
  }

  async setStatus(userId: string, id: string, status: string) {
    if (!(VALID_STATUS as readonly string[]).includes(status)) throw new BadRequestException('Invalid status')
    return this.prisma.userSkill.updateMany({ where: { id, userId }, data: { status } })
  }

  async remove(userId: string, id: string) {
    return this.prisma.userSkill.deleteMany({ where: { id, userId } })
  }
}

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
