import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { randomBytes } from 'node:crypto'
import type {
  SlackChannelHealth,
  SlackWorkspaceLink,
  SlackPairingSession,
  CreateSlackPairingInput,
} from '@openagents/shared'
import { AgentService } from '../../agent/agent.service'
import { PrismaService } from '../../prisma/prisma.service'
import { NanobotLoopService } from '../../nanobot/agent/nanobot-loop.service'
import { NanobotConfigService } from '../../nanobot/config/nanobot-config.service'
import { NanobotBusService } from '../../nanobot/bus/nanobot-bus.service'
import { ConnectorsService } from '../../connectors/connectors.service'
import { ChannelCommandsService } from '../channel-commands.service'

export interface SlackEventPayload {
  type: string
  challenge?: string
  team_id?: string
  event?: {
    type: string
    text?: string
    user?: string
    channel?: string
    team?: string
    bot_id?: string
    subtype?: string
  }
  team?: { id: string; name: string }
}

const DEFAULT_PAIRING_EXPIRES_MINUTES = 15
const MIN_PAIRING_EXPIRES_MINUTES = 3
const MAX_PAIRING_EXPIRES_MINUTES = 240

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name)

  constructor(
    private prisma: PrismaService,
    private agent: AgentService,
    private nanobotLoop: NanobotLoopService,
    private nanobotConfig: NanobotConfigService,
    private bus: NanobotBusService,
    private connectors: ConnectorsService,
    private channelCommands: ChannelCommandsService,
  ) {}

  health(): SlackChannelHealth {
    return {
      configured: Boolean(this.getBotToken()),
      signingSecretEnabled: Boolean((process.env.SLACK_SIGNING_SECRET ?? '').trim()),
    }
  }

  async listWorkspaces(userId: string): Promise<SlackWorkspaceLink[]> {
    const workspaces = await this.prisma.slackWorkspace.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { linkedAt: 'desc' }],
    })
    return workspaces.map((w) => ({
      id: w.id,
      teamId: w.teamId,
      teamName: w.teamName,
      channelId: w.channelId,
      linkedAt: w.linkedAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      lastSeenAt: w.lastSeenAt ? w.lastSeenAt.toISOString() : null,
      lastConversationId: w.lastConversationId ?? null,
    }))
  }

  async unlinkWorkspace(userId: string, workspaceRecordId: string) {
    const existing = await this.prisma.slackWorkspace.findUnique({
      where: { id: workspaceRecordId },
      select: { id: true, userId: true, teamId: true },
    })
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Slack workspace not found')
    }
    await this.prisma.slackWorkspace.delete({ where: { id: workspaceRecordId } })
    this.bus.publish('run.event', {
      source: 'channels.slack',
      action: 'workspace.unlinked',
      userId,
      workspaceRecordId,
      teamId: existing.teamId,
    })
  }

  async listPairings(userId: string): Promise<SlackPairingSession[]> {
    await this.expireStalePairings()
    const pairings = await this.prisma.slackPairing.findMany({
      where: { userId, status: { in: ['pending', 'linked'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return pairings.map((p) => this.toPairingSession(p))
  }

  async createPairing(userId: string, input: CreateSlackPairingInput = {}): Promise<SlackPairingSession> {
    if (!this.getBotToken()) {
      throw new BadRequestException('Slack bot token is not configured. Set SLACK_BOT_TOKEN in your environment.')
    }
    await this.expireStalePairings()

    const expiresInMinutesRaw = Number.parseInt(`${input.expiresInMinutes ?? DEFAULT_PAIRING_EXPIRES_MINUTES}`, 10)
    const expiresInMinutes = Number.isFinite(expiresInMinutesRaw)
      ? Math.max(MIN_PAIRING_EXPIRES_MINUTES, Math.min(expiresInMinutesRaw, MAX_PAIRING_EXPIRES_MINUTES))
      : DEFAULT_PAIRING_EXPIRES_MINUTES
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)
    const code = await this.generateUniquePairCode()
    const command = `/link ${code}`

    const pairing = await this.prisma.slackPairing.create({
      data: { userId, code, command, expiresAt },
    })

    this.bus.publish('run.event', {
      source: 'channels.slack',
      action: 'pairing.created',
      userId,
      pairingId: pairing.id,
      expiresAt: pairing.expiresAt.toISOString(),
    })

    return this.toPairingSession(pairing)
  }

  verifySlackSignature(rawBody: string, timestamp: string, signature: string): boolean {
    const signingSecret = (process.env.SLACK_SIGNING_SECRET ?? '').trim()
    if (!signingSecret) return true // signature check disabled if no secret

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 5 * 60
    if (Number(timestamp) < fiveMinutesAgo) return false

    const baseString = `v0:${timestamp}:${rawBody}`
    const hmac = createHmac('sha256', signingSecret).update(baseString).digest('hex')
    const expected = `v0=${hmac}`

    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    } catch {
      return false
    }
  }

  async handleEvent(payload: SlackEventPayload): Promise<{ challenge?: string }> {
    // URL verification challenge
    if (payload.type === 'url_verification') {
      return { challenge: payload.challenge }
    }

    if (payload.type !== 'event_callback') return {}

    const event = payload.event
    if (!event || event.type !== 'message') return {}
    if (event.bot_id || event.subtype) return {} // ignore bot messages / edits

    const text = event.text?.trim()
    const slackUserId = event.user
    const channelId = event.channel
    const teamId = payload.team_id

    if (!text || !teamId || !channelId || !slackUserId) return {}

    // Pairing command
    if (/\bOA-[A-Z0-9]{6}\b/.test(text.toUpperCase())) {
      const handled = await this.tryLinkWorkspaceFromPairingCommand(teamId, channelId, slackUserId, text)
      if (handled) return {}
    }

    // Resolve workspace
    const workspace = await this.prisma.slackWorkspace.findUnique({
      where: { teamId },
      select: { id: true, userId: true },
    })

    if (!workspace) {
      await this.sendMessage(channelId, 'This workspace is not linked. Generate a pairing code in Channels > Slack and send it here.')
      return {}
    }

    const user = await this.prisma.user.findUnique({ where: { id: workspace.userId }, select: { id: true } })
    if (!user) return {}

    const sessionLabel = `slack:${teamId}:${channelId}`
    const titleHint = `Slack #${channelId}`
    const existing = await this.prisma.conversation.findFirst({
      where: { sessionLabel, userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })

    let conversationId = existing?.id ?? null
    const commandResult = await this.channelCommands.maybeHandleTextCommand(text, {
      userId: user.id,
      sessionLabel,
      channelLabel: 'Slack',
      titleHint,
      conversationId,
    })
    if (commandResult) {
      await this.prisma.slackWorkspace.update({
        where: { id: workspace.id },
        data: {
          lastSeenAt: new Date(),
          lastConversationId: commandResult.conversationId ?? undefined,
          channelId,
        },
      }).catch(() => {})

      const delivered = await this.sendMessage(channelId, commandResult.reply)
      await this.connectors.recordChannelActivity(user.id, 'slack', {
        success: delivered,
        ...(delivered ? {} : { error: 'Slack chat.postMessage failed.' }),
      }).catch(() => {})
      this.bus.publish('run.event', {
        source: 'channels.slack',
        direction: 'command',
        command: commandResult.command,
        teamId,
        channelId,
        conversationId: commandResult.conversationId,
        userId: user.id,
      })
      return {}
    }

    if (!conversationId) {
      const conversation = await this.prisma.conversation.create({
        data: {
          userId: user.id,
          title: titleHint.slice(0, 80),
          sessionLabel,
        },
        select: { id: true },
      })
      conversationId = conversation.id
    }

    await this.prisma.slackWorkspace.update({
      where: { id: workspace.id },
      data: { lastSeenAt: new Date(), lastConversationId: conversationId, channelId },
    }).catch(() => {})

    this.bus.publish('run.event', {
      source: 'channels.slack',
      direction: 'inbound',
      teamId,
      channelId,
      conversationId,
      userId: user.id,
    })

    let assistantReply = ''
    const emit = (ev: string, data: unknown) => {
      if (ev !== 'message' || !data || typeof data !== 'object') return
      const record = data as { role?: unknown; content?: unknown }
      if (record.role === 'agent' && typeof record.content === 'string' && record.content.trim()) {
        assistantReply = record.content.trim()
      }
    }

    try {
      const run = this.nanobotConfig.enabled
        ? this.nanobotLoop.run.bind(this.nanobotLoop)
        : this.agent.run.bind(this.agent)

      await run({ conversationId, userId: user.id, userMessage: text, emit })
    } catch (error: any) {
      this.logger.error(`Slack agent run failed for team ${teamId}`, error)
      await this.sendMessage(channelId, 'I hit an internal error. Please try again in a moment.')
      this.bus.publish('run.event', {
        source: 'channels.slack',
        direction: 'error',
        teamId,
        channelId,
        conversationId,
        userId: user.id,
        error: error?.message ?? 'Unknown error',
      })
      await this.connectors.recordChannelActivity(user.id, 'slack', {
        success: false,
        error: error?.message ?? 'Unknown error',
      }).catch(() => {})
      return {}
    }

    const outbound = assistantReply || 'Done.'
    const delivered = await this.sendMessage(channelId, outbound)
    await this.connectors.recordChannelActivity(user.id, 'slack', {
      success: delivered,
      ...(delivered ? {} : { error: 'Slack chat.postMessage failed.' }),
    }).catch(() => {})
    this.bus.publish('run.event', {
      source: 'channels.slack',
      direction: 'outbound',
      teamId,
      channelId,
      conversationId,
      userId: user.id,
      hasReply: Boolean(assistantReply),
    })
    return {}
  }

  private async tryLinkWorkspaceFromPairingCommand(
    teamId: string,
    channelId: string,
    slackUserId: string,
    text: string,
  ) {
    await this.expireStalePairings()
    const code = this.extractPairingCode(text)
    if (!code) return false

    const pairing = await this.prisma.slackPairing.findFirst({
      where: { code, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })
    if (!pairing) return false

    if (pairing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.slackPairing.update({ where: { id: pairing.id }, data: { status: 'expired' } })
      await this.sendMessage(channelId, 'Pairing code expired. Generate a new one from Channels > Slack.')
      return true
    }

    const now = new Date()
    const workspace = await this.prisma.slackWorkspace.upsert({
      where: { teamId },
      update: { userId: pairing.userId, channelId, linkedAt: now, lastSeenAt: now },
      create: { userId: pairing.userId, teamId, channelId, linkedAt: now, lastSeenAt: now },
    })

    await this.prisma.slackPairing.update({
      where: { id: pairing.id },
      data: { status: 'linked', teamId, linkedAt: now },
    })

    await this.sendMessage(channelId, 'Workspace linked! You can now send messages here to chat with your OpenAgents assistant.')
    this.bus.publish('run.event', {
      source: 'channels.slack',
      action: 'pairing.linked',
      pairingId: pairing.id,
      userId: pairing.userId,
      teamId,
      workspaceId: workspace.id,
    })
    return true
  }

  private async sendMessage(channelId: string, text: string) {
    const token = this.getBotToken()
    if (!token) {
      this.logger.warn('Slack bot token not set, skipping outbound message.')
      return false
    }
    const resp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: channelId, text }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      this.logger.error(`Slack chat.postMessage failed (${resp.status}): ${body}`)
      return false
    }
    return true
  }

  private extractPairingCode(text: string) {
    const upper = text.toUpperCase()
    const match = upper.match(/\bOA-[A-Z0-9]{6}\b/)
    return match?.[0] ?? null
  }

  private async generateUniquePairCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const token = randomBytes(4).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
      const code = `OA-${token}`
      const exists = await this.prisma.slackPairing.findUnique({ where: { code }, select: { id: true } })
      if (!exists) return code
    }
    throw new Error('Failed to allocate unique Slack pairing code.')
  }

  private async expireStalePairings() {
    await this.prisma.slackPairing.updateMany({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    })
  }

  private getBotToken() {
    return (process.env.SLACK_BOT_TOKEN ?? '').trim() || null
  }

  private toPairingSession(pairing: {
    id: string; code: string; command: string; status: string
    teamId: string | null; expiresAt: Date; linkedAt: Date | null
  }): SlackPairingSession {
    const statusRaw = pairing.status.toLowerCase()
    const status = statusRaw === 'linked' || statusRaw === 'expired' || statusRaw === 'canceled'
      ? statusRaw as SlackPairingSession['status']
      : 'pending'
    return {
      id: pairing.id,
      code: pairing.code,
      command: pairing.command,
      status,
      teamId: pairing.teamId,
      expiresAt: pairing.expiresAt.toISOString(),
      linkedAt: pairing.linkedAt ? pairing.linkedAt.toISOString() : null,
    }
  }
}
