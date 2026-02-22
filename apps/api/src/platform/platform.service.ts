import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { SystemService } from '../system/system.service'
import { CronService } from '../cron/cron.service'
import { LabsService } from '../labs/labs.service'
import { WhatsAppService } from '../channels/whatsapp/whatsapp.service'
import { NanobotMarketplaceService } from '../nanobot/marketplace/nanobot-marketplace.service'
import type {
  PlatformAdminDailyPoint,
  PlatformAdminOverviewSnapshot,
  PlatformAdminTopUser,
  ChannelRuntimeStatus,
  PlatformBillingChannelRow,
  PlatformBillingSnapshot,
  PlatformChannelId,
  PlatformEvalRunInput,
  PlatformEvalRunResult,
  PlatformEvalSuite,
  PlatformFeatureGate,
  PlatformFleetNode,
  PlatformFleetSnapshot,
  PlatformInboxSnapshot,
  PlatformInboxThread,
  PlatformPlanId,
  PlatformQuota,
  PlatformSetPlanInput,
  PlatformSubscriptionSnapshot,
  PlatformTemplate,
  PlatformTemplateInstallResult,
  UserRole,
} from '@openagents/shared'

interface PlatformPlanDef {
  id: PlatformPlanId
  label: string
  priceUsdMonthly: number
  quotas: {
    monthlyTokens: number | null
    monthlyToolCalls: number | null
    monthlyEvalRuns: number | null
    activeTemplates: number | null
    channels: number | null
  }
}

interface PlatformTemplateDef {
  id: string
  title: string
  description: string
  category: string
  channels: PlatformChannelId[]
  requiredPlan: PlatformPlanId
  includes: {
    marketplacePacks: string[]
    starterGoals: string[]
    recommendedTools: string[]
  }
}

interface PersistedPlatformState {
  updatedAt: string
  planId: PlatformPlanId
  installedTemplates: Array<{
    templateId: string
    installedAt: string
  }>
  evalRuns: PlatformEvalRunResult[]
}

const PLAN_DEFS: Record<PlatformPlanId, PlatformPlanDef> = {
  free: {
    id: 'free',
    label: 'Free',
    priceUsdMonthly: 0,
    quotas: {
      monthlyTokens: 500_000,
      monthlyToolCalls: 2_000,
      monthlyEvalRuns: 20,
      activeTemplates: 1,
      channels: 2,
    },
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    priceUsdMonthly: 19,
    quotas: {
      monthlyTokens: 5_000_000,
      monthlyToolCalls: 20_000,
      monthlyEvalRuns: 200,
      activeTemplates: 6,
      channels: 5,
    },
  },
  team: {
    id: 'team',
    label: 'Team',
    priceUsdMonthly: 79,
    quotas: {
      monthlyTokens: 25_000_000,
      monthlyToolCalls: 100_000,
      monthlyEvalRuns: 1_000,
      activeTemplates: 25,
      channels: null,
    },
  },
}

const TEMPLATE_DEFS: PlatformTemplateDef[] = [
  {
    id: 'support-inbox',
    title: 'Support Inbox Agent',
    description: 'Omnichannel support triage with concise responses and escalation cues.',
    category: 'support',
    channels: ['web', 'whatsapp', 'telegram', 'discord'],
    requiredPlan: 'free',
    includes: {
      marketplacePacks: ['guardian-sre'],
      starterGoals: [
        'Set SLA response targets for support conversations.',
        'Define escalation policy for high-risk support tickets.',
      ],
      recommendedTools: ['notes', 'web_fetch'],
    },
  },
  {
    id: 'builder-release',
    title: 'Builder Release Agent',
    description: 'Code and release workflow template with patch loop + release checklist.',
    category: 'engineering',
    channels: ['web', 'slack'],
    requiredPlan: 'pro',
    includes: {
      marketplacePacks: ['builder-fastlane'],
      starterGoals: [
        'Define release gates for build, type-check, and smoke tests.',
        'Set rollback communication workflow for failed deployments.',
      ],
      recommendedTools: ['web_fetch', 'notes'],
    },
  },
  {
    id: 'market-intel',
    title: 'Market Intelligence Agent',
    description: 'Market scans, risk checkpoints, and briefing workflows for trading ops.',
    category: 'finance',
    channels: ['web', 'telegram', 'whatsapp'],
    requiredPlan: 'pro',
    includes: {
      marketplacePacks: ['binance-ops'],
      starterGoals: [
        'Define a daily market briefing cadence.',
        'Set risk limits and invalidation criteria in memory.',
      ],
      recommendedTools: ['web_search', 'web_fetch', 'notes'],
    },
  },
  {
    id: 'ops-command',
    title: 'Operations Command Center',
    description: 'Fleet and incident command setup for multi-channel team operations.',
    category: 'operations',
    channels: ['web', 'whatsapp', 'telegram', 'discord', 'slack', 'email'],
    requiredPlan: 'team',
    includes: {
      marketplacePacks: ['guardian-sre', 'builder-fastlane'],
      starterGoals: [
        'Stand up on-call rotations and escalation channels.',
        'Create a daily reliability and cost report cadence.',
      ],
      recommendedTools: ['notes', 'web_fetch', 'web_search'],
    },
  },
]

const EVAL_SUITES: PlatformEvalSuite[] = [
  {
    id: 'core-reasoning-v1',
    title: 'Core Reasoning v1',
    description: 'Structured output, arithmetic accuracy, and concise reasoning checks.',
    provider: 'ollama',
    prompts: 3,
  },
  {
    id: 'speed-quality-v1',
    title: 'Speed vs Quality v1',
    description: 'Latency/quality tradeoff test across selected local models.',
    provider: 'ollama',
    prompts: 3,
  },
]

const CHANNEL_LABELS: Record<PlatformChannelId, string> = {
  web: 'Web',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  email: 'Email',
}

const CHANNEL_MESSAGE_COST_USD: Record<PlatformChannelId, number> = {
  web: 0,
  whatsapp: 0.004,
  telegram: 0,
  discord: 0,
  slack: 0,
  email: 0.0002,
}

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private system: SystemService,
    private cron: CronService,
    private labs: LabsService,
    private whatsapp: WhatsAppService,
    private marketplace: NanobotMarketplaceService,
  ) {}

  async listTemplates(userId: string): Promise<PlatformTemplate[]> {
    const state = await this.load(userId)
    const installedMap = new Map(state.installedTemplates.map((item) => [item.templateId, item.installedAt]))
    return TEMPLATE_DEFS.map((template) => {
      const installedAt = installedMap.get(template.id)
      return {
        ...template,
        installed: Boolean(installedAt),
        ...(installedAt ? { installedAt } : {}),
      }
    })
  }

  async installTemplate(userId: string, templateId: string): Promise<PlatformTemplateInstallResult> {
    const state = await this.load(userId)
    const template = TEMPLATE_DEFS.find((item) => item.id === templateId)
    if (!template) throw new NotFoundException(`Template "${templateId}" not found.`)

    this.assertPlanMeetsRequirement(state.planId, template.requiredPlan)
    await this.assertTemplateQuota(userId, state, templateId)

    const installedPacks: string[] = []
    for (const packId of template.includes.marketplacePacks) {
      await this.marketplace.installPack(userId, packId)
      installedPacks.push(packId)
    }

    const createdGoals: string[] = []
    for (const title of template.includes.starterGoals) {
      const goal = await this.labs.createGoal(userId, {
        title,
        priority: 'high',
      })
      createdGoals.push(goal.id)
    }

    const now = new Date().toISOString()
    state.installedTemplates = [
      ...state.installedTemplates.filter((item) => item.templateId !== template.id),
      { templateId: template.id, installedAt: now },
    ]
    state.updatedAt = now
    await this.save(userId, state)

    return {
      templateId: template.id,
      installedAt: now,
      installedPacks,
      createdGoals,
      subscription: await this.subscription(userId),
    }
  }

  async fleet(userId: string): Promise<PlatformFleetSnapshot> {
    const [usage, cronHealth, pendingApprovals, activeSessions, linkedDevices] = await Promise.all([
      this.system.usage(),
      this.cron.health(userId, 24 * 60),
      this.prisma.approval.count({ where: { userId, status: 'pending' } }),
      this.prisma.conversation.count({
        where: { userId, lastMessageAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } },
      }),
      this.prisma.whatsAppDevice.count({ where: { userId } }),
    ])
    const whatsappHealth = this.whatsapp.health()

    const memoryRatio = usage.memory.systemTotalBytes > 0
      ? usage.memory.systemUsedBytes / usage.memory.systemTotalBytes
      : 0
    const cpuRatio = usage.cpu.logicalCores > 0
      ? usage.cpu.loadAvg1 / usage.cpu.logicalCores
      : usage.cpu.loadAvg1

    const nodes: PlatformFleetNode[] = [
      {
        id: 'gateway-api',
        label: 'Gateway API',
        kind: 'api',
        status: memoryRatio > 0.9 || cpuRatio > 1.3 ? 'degraded' : 'healthy',
        details: `Host ${usage.host.hostname} on ${usage.host.platform}`,
        updatedAt: usage.capturedAt,
        metrics: {
          cpuLoad1: this.round(cpuRatio),
          memoryRatio: this.round(memoryRatio),
          processRssBytes: usage.memory.processRssBytes,
        },
      },
      {
        id: 'agent-runtime',
        label: 'Agent Runtime',
        kind: 'runtime',
        status: pendingApprovals > 20 ? 'degraded' : 'healthy',
        details: `${activeSessions} active sessions`,
        updatedAt: new Date().toISOString(),
        metrics: {
          activeSessions,
          pendingApprovals,
        },
      },
      {
        id: 'scheduler',
        label: 'Scheduler / Cron',
        kind: 'scheduler',
        status: cronHealth.totals.failingJobs > 0 || cronHealth.totals.staleJobs > 0 ? 'degraded' : 'healthy',
        details: `${cronHealth.totals.jobs} jobs`,
        updatedAt: cronHealth.generatedAt,
        metrics: {
          jobs: cronHealth.totals.jobs,
          staleJobs: cronHealth.totals.staleJobs,
          failingJobs: cronHealth.totals.failingJobs,
        },
      },
      {
        id: 'whatsapp-channel',
        label: 'WhatsApp Channel',
        kind: 'channel',
        status: whatsappHealth.twilioConfigured ? 'healthy' : 'offline',
        details: whatsappHealth.twilioConfigured
          ? `${linkedDevices} linked devices`
          : 'Twilio configuration missing',
        updatedAt: new Date().toISOString(),
        metrics: {
          linkedDevices,
          configured: whatsappHealth.twilioConfigured ? 1 : 0,
        },
      },
      {
        id: 'control-plane',
        label: 'Control Plane',
        kind: 'control',
        status: 'healthy',
        details: 'Dashboard, approvals, and automation routes active',
        updatedAt: new Date().toISOString(),
        metrics: {
          nodeVersion: usage.host.nodeVersion,
          uptimeSec: usage.host.uptimeSec,
        },
      },
    ]

    const summary = {
      nodes: nodes.length,
      healthy: nodes.filter((node) => node.status === 'healthy').length,
      degraded: nodes.filter((node) => node.status === 'degraded').length,
      offline: nodes.filter((node) => node.status === 'offline').length,
      activeSessions,
      pendingApprovals,
      staleCronJobs: cronHealth.totals.staleJobs,
      failingCronJobs: cronHealth.totals.failingJobs,
    }

    return {
      generatedAt: new Date().toISOString(),
      summary,
      nodes,
    }
  }

  evalSuites(): PlatformEvalSuite[] {
    return EVAL_SUITES.map((suite) => ({ ...suite }))
  }

  async runEval(userId: string, input: PlatformEvalRunInput): Promise<PlatformEvalRunResult> {
    const state = await this.load(userId)
    const suite = EVAL_SUITES.find((item) => item.id === input.suiteId)
    if (!suite) throw new NotFoundException(`Eval suite "${input.suiteId}" not found.`)

    const subscription = await this.subscription(userId)
    const evalQuota = subscription.quotas.find((quota) => quota.id === 'monthly_eval_runs')
    if (evalQuota && evalQuota.remaining !== null && evalQuota.remaining <= 0) {
      throw new ForbiddenException('Monthly eval quota reached for current plan.')
    }

    const maxRoundsByPlan = state.planId === 'free' ? 1 : 3
    const rounds = Math.max(1, Math.min(input.rounds ?? 1, maxRoundsByPlan))
    const benchmark = await this.system.benchmarkOllama(input.baseUrl, input.models, rounds)
    const ranked = benchmark.models
      .slice()
      .sort((a, b) => b.avgScore - a.avgScore || a.avgLatencyMs - b.avgLatencyMs)
      .map((model, index) => ({
        model: model.model,
        avgScore: this.round(model.avgScore),
        avgLatencyMs: this.round(model.avgLatencyMs),
        p95LatencyMs: this.round(model.p95LatencyMs),
        passRate: this.round(model.passRate),
        errors: model.errors,
        rank: index + 1,
      }))

    const result: PlatformEvalRunResult = {
      runId: randomUUID(),
      suiteId: suite.id,
      generatedAt: benchmark.generatedAt,
      provider: 'ollama',
      baseUrl: benchmark.baseUrl,
      rounds,
      models: ranked,
    }

    state.evalRuns.unshift(result)
    state.evalRuns = state.evalRuns.slice(0, 100)
    state.updatedAt = new Date().toISOString()
    await this.save(userId, state)
    return result
  }

  async billing(userId: string, start?: string, end?: string): Promise<PlatformBillingSnapshot> {
    const { startDate, endDate } = this.resolveRange(start, end)
    const [llmAndTool, messages, subscription] = await Promise.all([
      this.system.costs(userId, startDate.toISOString(), endDate.toISOString()),
      this.prisma.message.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          conversation: { userId },
        },
        select: {
          conversationId: true,
          conversation: {
            select: {
              sessionLabel: true,
            },
          },
        },
      }),
      this.subscription(userId),
    ])

    const channelStats = new Map<PlatformChannelId, { messages: number; conversations: Set<string> }>()
    for (const message of messages) {
      const channelId = this.channelFromSessionLabel(message.conversation.sessionLabel)
      const current = channelStats.get(channelId) ?? { messages: 0, conversations: new Set<string>() }
      current.messages += 1
      current.conversations.add(message.conversationId)
      channelStats.set(channelId, current)
    }

    const channels: PlatformBillingChannelRow[] = (Object.keys(CHANNEL_LABELS) as PlatformChannelId[])
      .map((channelId) => {
        const stats = channelStats.get(channelId)
        const messagesCount = stats?.messages ?? 0
        const conversations = stats?.conversations.size ?? 0
        const estimatedCostUsd = messagesCount * CHANNEL_MESSAGE_COST_USD[channelId]
        return {
          channelId,
          channelLabel: CHANNEL_LABELS[channelId],
          conversations,
          messages: messagesCount,
          estimatedCostUsd: this.round(estimatedCostUsd),
        }
      })
      .filter((row) => row.messages > 0)
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.messages - a.messages)

    const channelTransportUsd = channels.reduce((sum, row) => sum + row.estimatedCostUsd, 0)
    const llmAndToolUsd = llmAndTool.totals.estimatedTotalCostUsd
    const estimatedInvoiceUsd = llmAndToolUsd + channelTransportUsd + PLAN_DEFS[subscription.planId].priceUsdMonthly

    return {
      generatedAt: new Date().toISOString(),
      rangeStart: startDate.toISOString(),
      rangeEnd: endDate.toISOString(),
      llmAndTool,
      channels,
      totals: {
        llmAndToolUsd: this.round(llmAndToolUsd),
        channelTransportUsd: this.round(channelTransportUsd),
        estimatedInvoiceUsd: this.round(estimatedInvoiceUsd),
      },
      subscription,
    }
  }

  async subscription(userId: string): Promise<PlatformSubscriptionSnapshot> {
    const state = await this.load(userId)
    const now = new Date()
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const usage = await this.system.costs(userId, since30d, now.toISOString())
    const plan = PLAN_DEFS[state.planId]

    const evalRuns30d = state.evalRuns.filter((run) => new Date(run.generatedAt).getTime() >= new Date(since30d).getTime()).length
    const activeTemplates = state.installedTemplates.length
    const activeChannels = this.estimateActiveChannels(state)

    const quotas: PlatformQuota[] = [
      this.buildQuota('monthly_tokens', 'Monthly Tokens', 'tokens', plan.quotas.monthlyTokens, usage.totals.inputTokens + usage.totals.outputTokens),
      this.buildQuota('monthly_tool_calls', 'Monthly Tool Calls', 'calls', plan.quotas.monthlyToolCalls, usage.totals.toolCalls),
      this.buildQuota('monthly_eval_runs', 'Monthly Eval Runs', 'runs', plan.quotas.monthlyEvalRuns, evalRuns30d),
      this.buildQuota('active_templates', 'Active Templates', 'templates', plan.quotas.activeTemplates, activeTemplates),
      this.buildQuota('active_channels', 'Active Channels', 'channels', plan.quotas.channels, activeChannels),
    ]

    const featureGates = this.buildFeatureGates(plan.id)
    const renewsAt = plan.priceUsdMonthly > 0 ? this.nextRenewDateIso(now) : null

    return {
      planId: plan.id,
      planLabel: plan.label,
      priceUsdMonthly: plan.priceUsdMonthly,
      currency: 'USD',
      renewsAt,
      updatedAt: state.updatedAt,
      featureGates,
      quotas,
    }
  }

  async setPlan(userId: string, input: PlatformSetPlanInput): Promise<PlatformSubscriptionSnapshot> {
    const state = await this.load(userId)
    if (!PLAN_DEFS[input.planId]) {
      throw new BadRequestException(`Unsupported plan: ${input.planId}`)
    }
    state.planId = input.planId
    state.updatedAt = new Date().toISOString()
    await this.save(userId, state)
    return this.subscription(userId)
  }

  async inbox(userId: string, limit = 80): Promise<PlatformInboxSnapshot> {
    const safeLimit = Math.max(1, Math.min(limit, 240))
    const [conversations, devices] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { userId },
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
        take: safeLimit,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.whatsAppDevice.findMany({
        where: { userId },
        select: {
          lastConversationId: true,
          label: true,
          phone: true,
        },
      }),
    ])
    const whatsappHealth = this.whatsapp.health()

    const deviceLabelByConversation = new Map<string, string>()
    for (const device of devices) {
      if (!device.lastConversationId) continue
      deviceLabelByConversation.set(
        device.lastConversationId,
        device.label?.trim() || device.phone,
      )
    }

    const threads: PlatformInboxThread[] = conversations.map((conversation) => {
      const latest = conversation.messages[0]
      const channelId = this.channelFromSessionLabel(conversation.sessionLabel)
      return {
        conversationId: conversation.id,
        channelId,
        channelLabel: CHANNEL_LABELS[channelId],
        sessionLabel: conversation.sessionLabel ?? null,
        title: (conversation.title?.trim() || conversation.sessionLabel || `Conversation ${conversation.id.slice(0, 8)}`).slice(0, 120),
        lastRole: latest?.role === 'user' || latest?.role === 'agent' || latest?.role === 'tool' || latest?.role === 'system'
          ? latest.role
          : null,
        lastMessagePreview: latest?.content?.trim()
          ? latest.content.trim().replace(/\s+/g, ' ').slice(0, 240)
          : null,
        updatedAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
        linkedDeviceLabel: deviceLabelByConversation.get(conversation.id) ?? null,
      }
    })

    const counts = new Map<PlatformChannelId, number>()
    for (const thread of threads) {
      counts.set(thread.channelId, (counts.get(thread.channelId) ?? 0) + 1)
    }

    const channels = (Object.keys(CHANNEL_LABELS) as PlatformChannelId[]).map((channelId) => ({
      channelId,
      channelLabel: CHANNEL_LABELS[channelId],
      status: this.channelStatus(channelId, whatsappHealth.twilioConfigured),
      threads: counts.get(channelId) ?? 0,
    }))

    return {
      generatedAt: new Date().toISOString(),
      channels,
      threads,
    }
  }

  async adminOverview(
    viewer: { id: string; email: string; role: string },
    days = 30,
    limit = 40,
  ): Promise<PlatformAdminOverviewSnapshot> {
    const now = new Date()
    const safeDays = Math.max(7, Math.min(days, 120))
    const safeLimit = Math.max(5, Math.min(limit, 200))
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const since = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000)

    const [
      totalUsers,
      owners,
      admins,
      members,
      newUsers30d,
      totalConversations,
      totalMessages,
      pendingApprovals,
      trackedDevices,
      newDevices30d,
      activeDevices30d,
      deviceLoginAgg,
      linkedWhatsAppDevices,
      mappedDomains,
      llmKeysConfigured,
      activeUsersByDevice,
      activeUsersByConversation,
      userCreatedRows,
      newDeviceRows,
      activeDeviceRows,
      recentDeviceRows,
      topUserDeviceRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'owner' } }),
      this.prisma.user.count({ where: { role: 'admin' } }),
      this.prisma.user.count({ where: { role: 'member' } }),
      this.prisma.user.count({ where: { createdAt: { gte: since30d } } }),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.approval.count({ where: { status: 'pending' } }),
      this.prisma.deviceInstall.count(),
      this.prisma.deviceInstall.count({ where: { firstSeenAt: { gte: since30d } } }),
      this.prisma.deviceInstall.count({ where: { lastSeenAt: { gte: since30d } } }),
      this.prisma.deviceInstall.aggregate({ _sum: { loginCount: true } }),
      this.prisma.whatsAppDevice.count(),
      this.prisma.userDomain.count(),
      this.prisma.llmApiKey.count({ where: { isActive: true } }),
      this.prisma.deviceInstall.findMany({
        where: { lastSeenAt: { gte: since30d } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.conversation.findMany({
        where: { updatedAt: { gte: since30d } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.deviceInstall.findMany({
        where: { firstSeenAt: { gte: since } },
        select: { firstSeenAt: true },
      }),
      this.prisma.deviceInstall.findMany({
        where: { lastSeenAt: { gte: since } },
        select: { lastSeenAt: true },
      }),
      this.prisma.deviceInstall.findMany({
        orderBy: { lastSeenAt: 'desc' },
        take: safeLimit,
        include: {
          user: {
            select: { id: true, email: true, role: true },
          },
        },
      }),
      this.prisma.deviceInstall.groupBy({
        by: ['userId'],
        _count: { userId: true },
        _sum: { loginCount: true },
        _max: { lastSeenAt: true },
        orderBy: { _count: { userId: 'desc' } },
        take: Math.min(20, safeLimit),
      }),
    ])

    const activeUserIds = new Set<string>()
    for (const row of activeUsersByDevice) activeUserIds.add(row.userId)
    for (const row of activeUsersByConversation) activeUserIds.add(row.userId)
    const activeUsers30d = activeUserIds.size

    const topUserIds = topUserDeviceRows.map((row) => row.userId)
    const topUserProfiles = topUserIds.length > 0
      ? await this.prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, email: true, role: true },
      })
      : []
    const topUserMap = new Map(topUserProfiles.map((row) => [row.id, row]))

    const topUsers: PlatformAdminTopUser[] = topUserDeviceRows.map((row) => {
      const profile = topUserMap.get(row.userId)
      return {
        userId: row.userId,
        email: profile?.email ?? 'unknown',
        role: this.normalizeUserRole(profile?.role ?? 'member'),
        devices: row._count.userId,
        loginEvents: row._sum.loginCount ?? 0,
        lastSeenAt: row._max.lastSeenAt?.toISOString() ?? null,
      }
    })

    const recentDevices = recentDeviceRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      role: this.normalizeUserRole(row.user.role),
      userAgent: row.userAgent ?? null,
      ipAddress: row.ipAddress ?? null,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      loginCount: row.loginCount,
    }))

    const daily = this.buildAdminDailySeries(
      safeDays,
      now,
      userCreatedRows.map((row) => row.createdAt),
      newDeviceRows.map((row) => row.firstSeenAt),
      activeDeviceRows.map((row) => row.lastSeenAt),
    )

    return {
      generatedAt: now.toISOString(),
      viewer: {
        id: viewer.id,
        email: viewer.email,
        role: this.normalizeUserRole(viewer.role),
      },
      totals: {
        totalUsers,
        owners,
        admins,
        members,
        newUsers30d,
        activeUsers30d,
        totalConversations,
        totalMessages,
        pendingApprovals,
        trackedDevices,
        newDevices30d,
        activeDevices30d,
        totalDeviceLoginEvents: deviceLoginAgg._sum.loginCount ?? 0,
        linkedWhatsAppDevices,
        mappedDomains,
        llmKeysConfigured,
      },
      daily,
      topUsers,
      recentDevices,
    }
  }

  private buildFeatureGates(planId: PlatformPlanId): PlatformFeatureGate[] {
    const proOrTeam = planId === 'pro' || planId === 'team'
    const teamOnly = planId === 'team'
    return [
      { id: 'agent_template_marketplace', label: 'Agent Template Marketplace', enabled: true },
      { id: 'managed_fleet_dashboard', label: 'Managed Fleet Dashboard', enabled: true },
      { id: 'built_in_eval_suite', label: 'Built-in Eval Suite', enabled: true },
      { id: 'usage_billing_engine', label: 'Billing Engine by provider/model/tool/channel', enabled: true },
      { id: 'omnichannel_inbox', label: 'Omnichannel Inbox', enabled: true },
      {
        id: 'advanced_templates',
        label: 'Advanced Templates',
        enabled: proOrTeam,
        ...(proOrTeam ? {} : { reason: 'Upgrade to Pro for premium templates.' }),
      },
      {
        id: 'team_workspaces',
        label: 'Team Workspace Controls',
        enabled: teamOnly,
        ...(teamOnly ? {} : { reason: 'Upgrade to Team for workspace-level controls.' }),
      },
    ]
  }

  private buildQuota(id: string, label: string, unit: string, limit: number | null, used: number): PlatformQuota {
    const normalizedUsed = Math.max(0, Math.floor(used))
    if (limit === null) {
      return { id, label, unit, limit: null, used: normalizedUsed, remaining: null }
    }
    return {
      id,
      label,
      unit,
      limit,
      used: normalizedUsed,
      remaining: Math.max(0, limit - normalizedUsed),
    }
  }

  private assertPlanMeetsRequirement(planId: PlatformPlanId, required: PlatformPlanId) {
    const rank = this.planRank(planId)
    const target = this.planRank(required)
    if (rank < target) {
      throw new ForbiddenException(`Template requires ${required.toUpperCase()} plan.`)
    }
  }

  private async assertTemplateQuota(userId: string, state: PersistedPlatformState, templateId: string) {
    if (state.installedTemplates.some((item) => item.templateId === templateId)) return
    const subscription = await this.subscription(userId)
    const quota = subscription.quotas.find((item) => item.id === 'active_templates')
    if (quota && quota.remaining !== null && quota.remaining <= 0) {
      throw new ForbiddenException('Active template quota reached for current plan.')
    }
  }

  private estimateActiveChannels(state: PersistedPlatformState) {
    const channels = new Set<PlatformChannelId>(['web'])
    for (const item of state.installedTemplates) {
      const template = TEMPLATE_DEFS.find((def) => def.id === item.templateId)
      if (!template) continue
      for (const channel of template.channels) channels.add(channel)
    }
    return channels.size
  }

  private nextRenewDateIso(now: Date) {
    const next = new Date(now)
    next.setMonth(next.getMonth() + 1)
    return next.toISOString()
  }

  private planRank(planId: PlatformPlanId) {
    if (planId === 'team') return 3
    if (planId === 'pro') return 2
    return 1
  }

  private resolveRange(start?: string, end?: string) {
    const endDate = end ? new Date(end) : new Date()
    const fallbackEnd = Number.isFinite(endDate.getTime()) ? endDate : new Date()
    const startDate = start ? new Date(start) : new Date(fallbackEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
    const fallbackStart = Number.isFinite(startDate.getTime())
      ? startDate
      : new Date(fallbackEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
    if (fallbackStart.getTime() > fallbackEnd.getTime()) {
      return {
        startDate: fallbackEnd,
        endDate: fallbackStart,
      }
    }
    return {
      startDate: fallbackStart,
      endDate: fallbackEnd,
    }
  }

  private round(value: number) {
    return Math.round(value * 10000) / 10000
  }

  private normalizeUserRole(role: string): UserRole {
    const normalized = role.trim().toLowerCase()
    if (normalized === 'owner' || normalized === 'admin' || normalized === 'member') {
      return normalized
    }
    return 'member'
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10)
  }

  private buildAdminDailySeries(
    days: number,
    now: Date,
    userCreatedAt: Date[],
    deviceFirstSeenAt: Date[],
    deviceLastSeenAt: Date[],
  ): PlatformAdminDailyPoint[] {
    const dateKeys: string[] = []
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)
      dateKeys.push(this.toDateKey(date))
    }

    const usersMap = new Map(dateKeys.map((key) => [key, 0]))
    const newDevicesMap = new Map(dateKeys.map((key) => [key, 0]))
    const activeDevicesMap = new Map(dateKeys.map((key) => [key, 0]))

    for (const date of userCreatedAt) {
      const key = this.toDateKey(date)
      if (usersMap.has(key)) usersMap.set(key, (usersMap.get(key) ?? 0) + 1)
    }
    for (const date of deviceFirstSeenAt) {
      const key = this.toDateKey(date)
      if (newDevicesMap.has(key)) newDevicesMap.set(key, (newDevicesMap.get(key) ?? 0) + 1)
    }
    for (const date of deviceLastSeenAt) {
      const key = this.toDateKey(date)
      if (activeDevicesMap.has(key)) activeDevicesMap.set(key, (activeDevicesMap.get(key) ?? 0) + 1)
    }

    return dateKeys.map((date) => ({
      date,
      newUsers: usersMap.get(date) ?? 0,
      newDevices: newDevicesMap.get(date) ?? 0,
      activeDevices: activeDevicesMap.get(date) ?? 0,
    }))
  }

  private channelFromSessionLabel(sessionLabel: string | null): PlatformChannelId {
    const normalized = (sessionLabel ?? '').trim().toLowerCase()
    if (!normalized) return 'web'
    if (normalized.startsWith('whatsapp:')) return 'whatsapp'
    if (normalized.startsWith('telegram:')) return 'telegram'
    if (normalized.startsWith('discord:')) return 'discord'
    if (normalized.startsWith('slack:')) return 'slack'
    if (normalized.startsWith('email:') || normalized.startsWith('gmail:')) return 'email'
    return 'web'
  }

  private channelStatus(channelId: PlatformChannelId, whatsappConfigured: boolean): ChannelRuntimeStatus {
    if (channelId === 'web') return 'enabled'
    if (channelId === 'whatsapp') return whatsappConfigured ? 'enabled' : 'planned'
    return 'planned'
  }

  private async load(userId: string): Promise<PersistedPlatformState> {
    const fullPath = await this.pathForUser(userId)
    try {
      const raw = await fs.readFile(fullPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedPlatformState>
      return this.normalize(parsed)
    } catch {
      const initial = this.defaultState()
      await this.save(userId, initial)
      return initial
    }
  }

  private normalize(raw: Partial<PersistedPlatformState>): PersistedPlatformState {
    const planId = raw.planId === 'pro' || raw.planId === 'team' ? raw.planId : 'free'
    const installedTemplates = Array.isArray(raw.installedTemplates)
      ? raw.installedTemplates
        .filter((item): item is { templateId: string; installedAt: string } =>
          !!item
          && typeof item === 'object'
          && typeof (item as any).templateId === 'string'
          && typeof (item as any).installedAt === 'string',
        )
        .map((item) => ({
          templateId: item.templateId,
          installedAt: item.installedAt,
        }))
        .slice(0, 50)
      : []

    const evalRuns = Array.isArray(raw.evalRuns)
      ? raw.evalRuns
        .filter((row): row is PlatformEvalRunResult =>
          !!row
          && typeof row === 'object'
          && typeof (row as any).runId === 'string'
          && typeof (row as any).suiteId === 'string'
          && typeof (row as any).generatedAt === 'string',
        )
        .slice(0, 100)
      : []

    return {
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      planId,
      installedTemplates,
      evalRuns,
    }
  }

  private defaultState(): PersistedPlatformState {
    return {
      updatedAt: new Date().toISOString(),
      planId: 'free',
      installedTemplates: [],
      evalRuns: [],
    }
  }

  private async save(userId: string, state: PersistedPlatformState) {
    const fullPath = await this.pathForUser(userId)
    await fs.writeFile(fullPath, JSON.stringify(state, null, 2), 'utf8')
  }

  private async pathForUser(userId: string) {
    const root = path.resolve(process.cwd(), 'data', 'platform')
    await fs.mkdir(root, { recursive: true })
    return path.join(root, `${userId}.json`)
  }
}
