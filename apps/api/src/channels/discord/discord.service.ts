import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createVerify } from 'node:crypto'
import { randomBytes } from 'node:crypto'
import type {
  DiscordChannelHealth,
  DiscordServerLink,
  DiscordPairingSession,
  CreateDiscordPairingInput,
} from '@openagents/shared'
import { AgentService } from '../../agent/agent.service'
import { PrismaService } from '../../prisma/prisma.service'
import { NanobotLoopService } from '../../nanobot/agent/nanobot-loop.service'
import { NanobotConfigService } from '../../nanobot/config/nanobot-config.service'
import { NanobotBusService } from '../../nanobot/bus/nanobot-bus.service'
import { ConnectorsService } from '../../connectors/connectors.service'
import { ChannelCommandsService } from '../channel-commands.service'

// Discord interaction types
export const DISCORD_PING = 1
export const DISCORD_APPLICATION_COMMAND = 2
export const DISCORD_MESSAGE_COMPONENT = 3

export interface DiscordInteraction {
  type: number
  id: string
  token?: string
  guild_id?: string
  channel_id?: string
  member?: { user?: { id: string; username?: string } }
  user?: { id: string; username?: string }
  data?: {
    name?: string
    options?: Array<{ name: string; value: string }>
  }
}

const DEFAULT_PAIRING_EXPIRES_MINUTES = 15
const MIN_PAIRING_EXPIRES_MINUTES = 3
const MAX_PAIRING_EXPIRES_MINUTES = 240

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name)

  constructor(
    private prisma: PrismaService,
    private agent: AgentService,
    private nanobotLoop: NanobotLoopService,
    private nanobotConfig: NanobotConfigService,
    private bus: NanobotBusService,
    private connectors: ConnectorsService,
    private channelCommands: ChannelCommandsService,
  ) {}

  health(): DiscordChannelHealth {
    return {
      configured: Boolean(this.getBotToken()),
      publicKeyEnabled: Boolean((process.env.DISCORD_PUBLIC_KEY ?? '').trim()),
    }
  }

  async listServers(userId: string): Promise<DiscordServerLink[]> {
    const servers = await this.prisma.discordServer.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { linkedAt: 'desc' }],
    })
    return servers.map((s) => ({
      id: s.id,
      guildId: s.guildId,
      guildName: s.guildName,
      channelId: s.channelId,
      linkedAt: s.linkedAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
      lastConversationId: s.lastConversationId ?? null,
    }))
  }

  async unlinkServer(userId: string, serverRecordId: string) {
    const existing = await this.prisma.discordServer.findUnique({
      where: { id: serverRecordId },
      select: { id: true, userId: true, guildId: true },
    })
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Discord server not found')
    }
    await this.prisma.discordServer.delete({ where: { id: serverRecordId } })
    this.bus.publish('run.event', {
      source: 'channels.discord',
      action: 'server.unlinked',
      userId,
      serverRecordId,
      guildId: existing.guildId,
    })
  }

  async listPairings(userId: string): Promise<DiscordPairingSession[]> {
    await this.expireStalePairings()
    const pairings = await this.prisma.discordPairing.findMany({
      where: { userId, status: { in: ['pending', 'linked'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return pairings.map((p) => this.toPairingSession(p))
  }

  async createPairing(userId: string, input: CreateDiscordPairingInput = {}): Promise<DiscordPairingSession> {
    if (!this.getBotToken()) {
      throw new BadRequestException('Discord bot token is not configured. Set DISCORD_BOT_TOKEN in your environment.')
    }
    await this.expireStalePairings()

    const expiresInMinutesRaw = Number.parseInt(`${input.expiresInMinutes ?? DEFAULT_PAIRING_EXPIRES_MINUTES}`, 10)
    const expiresInMinutes = Number.isFinite(expiresInMinutesRaw)
      ? Math.max(MIN_PAIRING_EXPIRES_MINUTES, Math.min(expiresInMinutesRaw, MAX_PAIRING_EXPIRES_MINUTES))
      : DEFAULT_PAIRING_EXPIRES_MINUTES
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)
    const code = await this.generateUniquePairCode()
    const command = `/link ${code}`

    const pairing = await this.prisma.discordPairing.create({
      data: { userId, code, command, expiresAt },
    })

    this.bus.publish('run.event', {
      source: 'channels.discord',
      action: 'pairing.created',
      userId,
      pairingId: pairing.id,
      expiresAt: pairing.expiresAt.toISOString(),
    })

    return this.toPairingSession(pairing)
  }

  /**
   * Verify Discord Ed25519 signature.
   * Discord sends X-Signature-Ed25519 and X-Signature-Timestamp headers.
   */
  verifyDiscordSignature(rawBody: string, timestamp: string, signature: string): boolean {
    const publicKey = (process.env.DISCORD_PUBLIC_KEY ?? '').trim()
    if (!publicKey) return true // verification disabled if no public key configured

    try {
      const verifier = createVerify('ed25519')
      verifier.update(timestamp + rawBody)
      return verifier.verify(Buffer.from(publicKey, 'hex'), Buffer.from(signature, 'hex'))
    } catch (err) {
      this.logger.warn('Discord signature verification failed', err)
      return false
    }
  }

  async handleInteraction(interaction: DiscordInteraction): Promise<Record<string, unknown>> {
    // PING — must respond with PONG (type 1)
    if (interaction.type === DISCORD_PING) {
      return { type: 1 }
    }

    if (interaction.type !== DISCORD_APPLICATION_COMMAND) {
      return { type: 1 }
    }

    const commandName = interaction.data?.name?.toLowerCase()
    const guildId = interaction.guild_id
    const channelId = interaction.channel_id
    const user = interaction.member?.user ?? interaction.user

    if (!commandName || !channelId) {
      return this.ephemeralReply('Could not process this command.')
    }

    // /link OA-XXXXXX — pairing command
    if (commandName === 'link') {
      const codeArg = interaction.data?.options?.find((o) => o.name === 'code')?.value ?? ''
      const code = this.extractPairingCode(codeArg)
      if (!code) return this.ephemeralReply('Invalid pairing code. Format: OA-XXXXXX')

      const linked = await this.tryLinkServer(guildId, channelId, user?.username ?? null, code)
      if (linked === 'expired') return this.ephemeralReply('Pairing code expired. Generate a new one from Channels > Discord.')
      if (linked === 'not_found') return this.ephemeralReply('Pairing code not found or already used.')
      return this.ephemeralReply('Server linked! You can now use /ask to chat with your OpenAgents assistant.')
    }

    if (commandName === 'help') {
      return this.ephemeralReply(this.channelCommands.buildHelpReply('Discord'))
    }

    if (commandName === 'new' || commandName === 'status' || commandName === 'models' || commandName === 'memory') {
      const effectiveGuildId = guildId ?? channelId
      const server = await this.prisma.discordServer.findUnique({
        where: { guildId: effectiveGuildId },
        select: { id: true, userId: true, lastConversationId: true },
      })
      if (!server) {
        return this.ephemeralReply('This server is not linked yet. Use /link OA-XXXXXX with a code from Channels > Discord.')
      }

      const commandResult = await this.channelCommands.handleNamedCommand(commandName, {
        userId: server.userId,
        sessionLabel: `discord:${effectiveGuildId}:${channelId}`,
        channelLabel: 'Discord',
        titleHint: `Discord ${effectiveGuildId}`,
        conversationId: server.lastConversationId,
      })
      if (!commandResult) {
        return this.ephemeralReply('Unknown command.')
      }

      await this.prisma.discordServer.update({
        where: { id: server.id },
        data: {
          lastSeenAt: new Date(),
          lastConversationId: commandResult.conversationId ?? undefined,
          channelId,
        },
      }).catch(() => {})
      await this.connectors.recordChannelActivity(server.userId, 'discord', {
        success: true,
      }).catch(() => {})
      this.bus.publish('run.event', {
        source: 'channels.discord',
        direction: 'command',
        command: commandResult.command,
        guildId: effectiveGuildId,
        channelId,
        conversationId: commandResult.conversationId,
        userId: server.userId,
      })
      return this.ephemeralReply(commandResult.reply)
    }

    // /ask or /chat — forward message to agent
    if (commandName === 'ask' || commandName === 'chat') {
      const messageArg = interaction.data?.options?.find((o) => o.name === 'message')?.value ?? ''
      if (!messageArg.trim()) return this.ephemeralReply('Please provide a message.')

      const reply = await this.handleAgentMessage(guildId, channelId, messageArg.trim())
      return { type: 4, data: { content: reply } }
    }

    return this.ephemeralReply('Unknown command.')
  }

  private async tryLinkServer(
    guildId: string | undefined,
    channelId: string,
    username: string | null,
    code: string,
  ): Promise<'linked' | 'expired' | 'not_found'> {
    await this.expireStalePairings()
    const pairing = await this.prisma.discordPairing.findFirst({
      where: { code, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })
    if (!pairing) return 'not_found'

    if (pairing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.discordPairing.update({ where: { id: pairing.id }, data: { status: 'expired' } })
      return 'expired'
    }

    const effectiveGuildId = guildId ?? channelId // fall back to channel for DMs
    const now = new Date()
    const server = await this.prisma.discordServer.upsert({
      where: { guildId: effectiveGuildId },
      update: { userId: pairing.userId, channelId, linkedAt: now, lastSeenAt: now },
      create: {
        userId: pairing.userId,
        guildId: effectiveGuildId,
        guildName: null,
        channelId,
        linkedAt: now,
        lastSeenAt: now,
      },
    })

    await this.prisma.discordPairing.update({
      where: { id: pairing.id },
      data: { status: 'linked', guildId: effectiveGuildId, linkedAt: now },
    })

    this.bus.publish('run.event', {
      source: 'channels.discord',
      action: 'pairing.linked',
      pairingId: pairing.id,
      userId: pairing.userId,
      guildId: effectiveGuildId,
      serverId: server.id,
    })

    return 'linked'
  }

  private async handleAgentMessage(
    guildId: string | undefined,
    channelId: string,
    userMessage: string,
  ): Promise<string> {
    const effectiveGuildId = guildId ?? channelId
    const server = await this.prisma.discordServer.findUnique({
      where: { guildId: effectiveGuildId },
      select: { id: true, userId: true },
    })

    if (!server) {
      return 'This server is not linked yet. Use /link OA-XXXXXX with a code from Channels > Discord.'
    }

    const user = await this.prisma.user.findUnique({ where: { id: server.userId }, select: { id: true } })
    if (!user) return 'Server configuration error.'

    const sessionLabel = `discord:${effectiveGuildId}:${channelId}`
    const existing = await this.prisma.conversation.findFirst({
      where: { sessionLabel, userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })

    let conversationId = existing?.id
    if (!conversationId) {
      const conversation = await this.prisma.conversation.create({
        data: {
          userId: user.id,
          title: `Discord ${effectiveGuildId}`.slice(0, 80),
          sessionLabel,
        },
        select: { id: true },
      })
      conversationId = conversation.id
    }

    await this.prisma.discordServer.update({
      where: { id: server.id },
      data: { lastSeenAt: new Date(), lastConversationId: conversationId, channelId },
    }).catch(() => {})

    this.bus.publish('run.event', {
      source: 'channels.discord',
      direction: 'inbound',
      guildId: effectiveGuildId,
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

      await run({ conversationId, userId: user.id, userMessage, emit })
    } catch (error: any) {
      this.logger.error(`Discord agent run failed for guild ${effectiveGuildId}`, error)
      this.bus.publish('run.event', {
        source: 'channels.discord',
        direction: 'error',
        guildId: effectiveGuildId,
        conversationId,
        userId: user.id,
        error: error?.message ?? 'Unknown error',
      })
      await this.connectors.recordChannelActivity(user.id, 'discord', {
        success: false,
        error: error?.message ?? 'Unknown error',
      }).catch(() => {})
      return 'I hit an internal error. Please try again in a moment.'
    }

    const outbound = assistantReply || 'Done.'
    await this.connectors.recordChannelActivity(user.id, 'discord', {
      success: true,
    }).catch(() => {})
    this.bus.publish('run.event', {
      source: 'channels.discord',
      direction: 'outbound',
      guildId: effectiveGuildId,
      conversationId,
      userId: user.id,
      hasReply: Boolean(assistantReply),
    })
    return outbound
  }

  private ephemeralReply(content: string) {
    return { type: 4, data: { content, flags: 64 } } // flags: 64 = ephemeral
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
      const exists = await this.prisma.discordPairing.findUnique({ where: { code }, select: { id: true } })
      if (!exists) return code
    }
    throw new Error('Failed to allocate unique Discord pairing code.')
  }

  private async expireStalePairings() {
    await this.prisma.discordPairing.updateMany({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    })
  }

  private getBotToken() {
    return (process.env.DISCORD_BOT_TOKEN ?? '').trim() || null
  }

  private toPairingSession(pairing: {
    id: string; code: string; command: string; status: string
    guildId: string | null; expiresAt: Date; linkedAt: Date | null
  }): DiscordPairingSession {
    const statusRaw = pairing.status.toLowerCase()
    const status = statusRaw === 'linked' || statusRaw === 'expired' || statusRaw === 'canceled'
      ? statusRaw as DiscordPairingSession['status']
      : 'pending'
    return {
      id: pairing.id,
      code: pairing.code,
      command: pairing.command,
      status,
      guildId: pairing.guildId,
      expiresAt: pairing.expiresAt.toISOString(),
      linkedAt: pairing.linkedAt ? pairing.linkedAt.toISOString() : null,
    }
  }
}
