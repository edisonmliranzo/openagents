import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { ModuleRef } from '@nestjs/core'

const STUDY_INTERVAL_MS = 6 * 60 * 60 * 1000
const MAX_GAPS_PER_CYCLE = 3

@Injectable()
export class StudyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StudyService.name)
  private timer?: NodeJS.Timeout
  private agentService: any

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    try {
      const { AgentService } = await import('../agent/agent.service')
      this.agentService = this.moduleRef.get(AgentService, { strict: false })
    } catch {
      this.logger.warn('AgentService unavailable — study runs disabled')
    }
    this.timer = setInterval(() => void this.runCycle(), STUDY_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private get enabled(): boolean {
    const raw = (this.config.get<string>('STUDY_ENABLED') ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
  }

  /** Record that the agent struggled with a topic. */
  async logGap(userId: string, label: string, evidence = ''): Promise<void> {
    const clean = label.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)
    if (!clean) return
    const topic = clean.replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 6).join('-')
    try {
      await this.prisma.knowledgeGap.upsert({
        where: { userId_topic: { userId, topic } },
        create: { userId, topic, label: clean, evidence: evidence.slice(0, 400) },
        update: { count: { increment: 1 }, evidence: evidence.slice(0, 400), status: 'open' },
      })
    } catch (error: any) {
      this.logger.debug(`Gap log failed: ${error?.message ?? error}`)
    }
  }

  listGaps(userId: string) {
    return this.prisma.knowledgeGap.findMany({
      where: { userId },
      orderBy: [{ count: 'desc' }, { updatedAt: 'desc' }],
      take: 30,
    })
  }

  async runCycle(): Promise<number> {
    if (!this.enabled || !this.agentService) return 0
    const owners = await this.prisma.knowledgeGap.findMany({
      where: { status: 'open', count: { gte: 2 } },
      select: { userId: true },
      distinct: ['userId'],
      take: 5,
    })
    let studied = 0
    for (const owner of owners) {
      const gaps = await this.prisma.knowledgeGap.findMany({
        where: { userId: owner.userId, status: 'open', count: { gte: 2 } },
        orderBy: { count: 'desc' },
        take: MAX_GAPS_PER_CYCLE,
      })
      for (const gap of gaps) {
        await this.prisma.knowledgeGap.update({ where: { id: gap.id }, data: { status: 'studying' } })
        const ok = await this.studyGap(owner.userId, gap.label).catch((error: any) => {
          this.logger.warn(`Study failed for "${gap.label}": ${error?.message ?? error}`)
          return false
        })
        await this.prisma.knowledgeGap.update({
          where: { id: gap.id },
          data: { status: ok ? 'studied' : 'open' },
        })
        if (ok) studied += 1
      }
    }
    if (studied > 0) this.logger.log(`Study cycle completed ${studied} gap(s).`)
    return studied
  }

  /** Research one topic with full tools and save findings to the library. */
  async studyGap(userId: string, topic: string): Promise<boolean> {
    if (!this.agentService) return false
    const conversation = await this.prisma.conversation.findFirst({
      where: { userId, title: 'Study' },
      orderBy: { createdAt: 'desc' },
    })
    const conversationId = conversation?.id
      ?? (await this.prisma.conversation.create({ data: { userId, title: 'Study' }, select: { id: true } })).id

    let saved = false
    await this.agentService.run({
      conversationId,
      userId,
      userMessage: `Study topic: "${topic}". Research it with web_search/web_fetch, then save a concise reference note about it using the library_save tool (title: "${topic} — reference"). Keep the note under 2000 characters, facts and practical guidance only.`,
      emit: (event: string, data: unknown) => {
        if (event === 'tool_result') {
          const row = data as { tool?: string; success?: boolean }
          if (row?.tool === 'library_save' && row.success) saved = true
        }
      },
      systemPromptAppendix: 'This is a background study task. Be efficient: 2-3 searches max, then write the note and save it.',
    })
    return saved
  }
}
