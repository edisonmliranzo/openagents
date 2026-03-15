import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import type {
  TelegramChannelHealth,
  TelegramChatLink,
  TelegramPairingSession,
  CreateTelegramPairingInput,
} from '@openagents/shared'
import { AgentService } from '../../agent/agent.service'
import { PrismaService } from '../../prisma/prisma.service'
import { NanobotLoopService } from '../../nanobot/agent/nanobot-loop.service'
import { NanobotConfigService } from '../../nanobot/config/nanobot-config.service'
import { NanobotBusService } from '../../nanobot/bus/nanobot-bus.service'
import { ConnectorsService } from '../../connectors/connectors.service'

export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; username?: string; first_name?: string; last_name?: string }
    chat: { id: number; type: string; title?: string; username?: string }
    text?: string
    date: number
  }
}

const DEFAULT_PAIRING_EXPIRES_MINUTES = 15
const MIN_PAIRING_EXPIRES_MINUTES = 3
const MAX_PAIRING_EXPIRES_MINUTES = 240

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name)

  constructor(
    private prisma: PrismaService,
    private agent: AgentService,
    private nanobotLoop: NanobotLoopService,
    private nanobotConfig: NanobotConfigService,
    private bus: NanobotBusService,
    private connectors: ConnectorsService,
  ) {}

  health(): TelegramChannelHealth {
    return {
      configured: Boolean(this.getBotToken()),
      webhookSecretEnabled: Boolean((process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()),
    }
  }

  async listChats(userId: string): Promise<TelegramChatLink[]> {
    const chats = await this.prisma.telegramChat.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { linkedAt: 'desc' }],
    })
    return chats.map((c) => ({
      id: c.id,
      chatId: c.chatId,
      label: c.label,
      linkedAt: c.linkedAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastSeenAt: c.lastSeenAt ? c.lastSeenAt.toISOString() : null,
      lastConversationId: c.lastConversationId ?? null,
    }))
  }

  async unlinkChat(userId: string, chatRecordId: string) {
    const existing = await this.prisma.telegramChat.findUnique({
      where: { id: chatRecordId },
      select: { id: true, userId: true, chatId: true },
    })
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Telegram chat not found')
    }
    await this.prisma.telegramChat.delete({ where: { id: chatRecordId } })
    this.bus.publish('run.event', {
      source: 'channels.telegram',
      action: 'chat.unlinked',
      userId,
      chatRecordId,
      chatId: existing.chatId,
    })
  }

  async listPairings(userId: string): Promise<TelegramPairingSession[]> {
    await this.expireStalePairings()
    const pairings = await this.prisma.telegramPairing.findMany({
      where: { userId, status: { in: ['pending', 'linked'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return pairings.map((p) => this.toPairingSession(p))
  }

  async createPairing(userId: string, input: CreateTelegramPairingInput = {}): Promise<TelegramPairingSession> {
    if (!this.getBotToken()) {
      throw new BadRequestException('Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN in your environment.')
    }
    await this.expireStalePairings()

    const expiresInMinutesRaw = Number.parseInt(`${input.expiresInMinutes ?? DEFAULT_PAIRING_EXPIRES_MINUTES}`, 10)
    const expiresInMinutes = Number.isFinite(expiresInMinutesRaw)
      ? Math.max(MIN_PAIRING_EXPIRES_MINUTES, Math.min(expiresInMinutesRaw, MAX_PAIRING_EXPIRES_MINUTES))
      : DEFAULT_PAIRING_EXPIRES_MINUTES
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)
    const code = await this.generateUniquePairCode()
    const command = `/link ${code}`

    const pairing = await this.prisma.telegramPairing.create({
      data: { userId, code, command, expiresAt },
    })

    this.bus.publish('run.event', {
      source: 'channels.telegram',
      action: 'pairing.created',
      userId,
      pairingId: pairing.id,
      expiresAt: pairing.expiresAt.toISOString(),
    })

    return this.toPairingSession(pairing)
  }

  async registerWebhook(webhookUrl: string): Promise<{ ok: boolean; description?: string }> {
    const token = this.getBotToken()
    if (!token) {
      throw new BadRequestException('Telegram bot token is not configured.')
    }
    const url = `https://api.telegram.org/bot${token}/setWebhook`
    const body: Record<string, unknown> = { url: webhookUrl }
    const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()
    if (secret) body['secret_token'] = secret

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await resp.json() as { ok: boolean; description?: string }
    return json
  }

  async handleUpdate(update: TelegramUpdate) {
    const message = update.message
    if (!message?.text?.trim()) return

    const chatId = String(message.chat.id)
    const text = message.text.trim()
    const from = message.from

    // Pairing command: /link OA-XXXXXX
    if (text.startsWith('/link ') || /\bOA-[A-Z0-9]{6}\b/.test(text.toUpperCase())) {
      const handled = await this.tryLinkChatFromPairingCommand(chatId, text, message)
      if (handled) return
    }

    // Resolve existing chat route
    const chat = await this.prisma.telegramChat.findUnique({
      where: { chatId },
      select: { id: true, userId: true },
    })

    if (!chat) {
      await this.sendMessage(chatId, 'This chat is not linked yet. Generate a pairing code in Channels > Telegram and send /link OA-XXXXXX here.')
      return
    }

    const user = await this.prisma.user.findUnique({ where: { id: chat.userId }, select: { id: true } })
    if (!user) return

    const sessionLabel = `telegram:${chatId}`
    const existing = await this.prisma.conversation.findFirst({
      where: { sessionLabel, userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })

    let conversationId = existing?.id
    if (!conversationId) {
      const title = this.buildChatTitle(message)
      const conversation = await this.prisma.conversation.create({
        data: { userId: user.id, title: title.slice(0, 80), sessionLabel },
        select: { id: true },
      })
      conversationId = conversation.id
    }

    await this.prisma.telegramChat.update({
      where: { id: chat.id },
      data: { lastSeenAt: new Date(), lastConversationId: conversationId },
    }).catch(() => {})

    this.bus.publish('run.event', {
      source: 'channels.telegram',
      direction: 'inbound',
      chatId,
      conversationId,
      userId: user.id,
    })

    let assistantReply = ''
    const emit = (event: string, data: unknown) => {
      if (event !== 'message' || !data || typeof data !== 'object') return
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
      this.logger.error(`Telegram agent run failed for chat ${chatId}`, error)
      await this.sendMessage(chatId, 'I hit an internal error. Please try again in a moment.')
      this.bus.publish('run.event', {
        source: 'channels.telegram',
        direction: 'error',
        chatId,
        conversationId,
        userId: user.id,
        error: error?.message ?? 'Unknown error',
      })
      return
    }

    const outbound = assistantReply || 'Done.'
    await this.sendMessage(chatId, outbound)
    this.bus.publish('run.event', {
      source: 'channels.telegram',
      direction: 'outbound',
      chatId,
      conversationId,
      userId: user.id,
      hasReply: Boolean(assistantReply),
    })
  }

  private async tryLinkChatFromPairingCommand(
    chatId: string,
    text: string,
    message: NonNullable<TelegramUpdate['message']>,
  ) {
    await this.expireStalePairings()
    const code = this.extractPairingCode(text)
    if (!code) return false

    const pairing = await this.prisma.telegramPairing.findFirst({
      where: { code, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })
    if (!pairing) return false

    if (pairing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.telegramPairing.update({ where: { id: pairing.id }, data: { status: 'expired' } })
      await this.sendMessage(chatId, 'Pairing code expired. Generate a new one from Channels > Telegram.')
      return true
    }

    const from = message.from
    const label = from
      ? [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || null
      : null

    const now = new Date()
    const chatRecord = await this.prisma.telegramChat.upsert({
      where: { chatId },
      update: { userId: pairing.userId, label: label ?? undefined, linkedAt: now, lastSeenAt: now },
      create: { userId: pairing.userId, chatId, label, linkedAt: now, lastSeenAt: now },
    })

    await this.prisma.telegramPairing.update({
      where: { id: pairing.id },
      data: { status: 'linked', chatId, linkedAt: now },
    })

    await this.sendMessage(chatId, 'Chat linked! You can now message here to talk with your OpenAgents assistant.')
    this.bus.publish('run.event', {
      source: 'channels.telegram',
      action: 'pairing.linked',
      pairingId: pairing.id,
      userId: pairing.userId,
      chatId,
      chatRecordId: chatRecord.id,
    })
    return true
  }

  private async sendMessage(chatId: string, text: string) {
    const token = this.getBotToken()
    if (!token) {
      this.logger.warn('Telegram bot token not set, skipping outbound message.')
      return
    }
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      this.logger.error(`Telegram sendMessage failed (${resp.status}): ${body}`)
    }
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
      const exists = await this.prisma.telegramPairing.findUnique({ where: { code }, select: { id: true } })
      if (!exists) return code
    }
    throw new Error('Failed to allocate unique Telegram pairing code.')
  }

  private async expireStalePairings() {
    await this.prisma.telegramPairing.updateMany({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    })
  }

  private buildChatTitle(message: NonNullable<TelegramUpdate['message']>) {
    const chat = message.chat
    if (chat.title) return `Telegram ${chat.title}`
    const from = message.from
    if (from) {
      const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username
      if (name) return `Telegram ${name}`
    }
    return `Telegram ${chat.id}`
  }

  private getBotToken() {
    return (process.env.TELEGRAM_BOT_TOKEN ?? '').trim() || null
  }

  private toPairingSession(pairing: {
    id: string; code: string; command: string; status: string
    chatId: string | null; expiresAt: Date; linkedAt: Date | null
  }): TelegramPairingSession {
    const statusRaw = pairing.status.toLowerCase()
    const status = statusRaw === 'linked' || statusRaw === 'expired' || statusRaw === 'canceled'
      ? statusRaw as TelegramPairingSession['status']
      : 'pending'
    return {
      id: pairing.id,
      code: pairing.code,
      command: pairing.command,
      status,
      chatId: pairing.chatId,
      expiresAt: pairing.expiresAt.toISOString(),
      linkedAt: pairing.linkedAt ? pairing.linkedAt.toISOString() : null,
    }
  }
}
