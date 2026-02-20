import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import {
  type CreateWhatsAppPairingInput,
  type WhatsAppChannelHealth,
  type WhatsAppDeviceLink,
  type WhatsAppPairingSession,
} from '@openagents/shared'
import { AgentService } from '../../agent/agent.service'
import { PrismaService } from '../../prisma/prisma.service'
import { NanobotLoopService } from '../../nanobot/agent/nanobot-loop.service'
import { NanobotConfigService } from '../../nanobot/config/nanobot-config.service'
import { NanobotBusService } from '../../nanobot/bus/nanobot-bus.service'

export interface WhatsAppInboundPayload {
  Body?: string
  From?: string
  MessageSid?: string
  ProfileName?: string
  WaId?: string
  [key: string]: unknown
}

interface ConversationRoute {
  conversationId: string
  userId: string
  source: 'linked-device' | 'default-route'
}

interface TwilioConfig {
  accountSid: string
  authToken: string
  from: string
}

const DEFAULT_PAIRING_EXPIRES_MINUTES = 15
const MIN_PAIRING_EXPIRES_MINUTES = 3
const MAX_PAIRING_EXPIRES_MINUTES = 240

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)

  constructor(
    private prisma: PrismaService,
    private agent: AgentService,
    private nanobotLoop: NanobotLoopService,
    private nanobotConfig: NanobotConfigService,
    private bus: NanobotBusService,
  ) {}

  health(): WhatsAppChannelHealth {
    const twilio = this.getTwilioConfig()
    const defaultUserId = this.getDefaultUserId()
    const webhookTokenEnabled = Boolean((process.env.WHATSAPP_WEBHOOK_TOKEN ?? '').trim())
    return {
      configured: Boolean(twilio),
      twilioConfigured: Boolean(twilio),
      defaultRouteConfigured: Boolean(defaultUserId),
      webhookTokenEnabled,
    }
  }

  async listDevices(userId: string): Promise<WhatsAppDeviceLink[]> {
    const devices = await this.prisma.whatsAppDevice.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { linkedAt: 'desc' }],
    })

    return devices.map((device) => ({
      id: device.id,
      phone: device.phone,
      label: device.label,
      linkedAt: device.linkedAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
      lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
      lastConversationId: device.lastConversationId ?? null,
    }))
  }

  async unlinkDevice(userId: string, deviceId: string) {
    const existing = await this.prisma.whatsAppDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, userId: true, phone: true },
    })
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('WhatsApp device not found')
    }

    await this.prisma.whatsAppDevice.delete({ where: { id: deviceId } })
    this.bus.publish('run.event', {
      source: 'channels.whatsapp',
      action: 'device.unlinked',
      userId,
      deviceId,
      phone: existing.phone,
    })
  }

  async listPairings(userId: string): Promise<WhatsAppPairingSession[]> {
    await this.expireStalePairings()
    const twilio = this.getTwilioConfig()
    const pairings = await this.prisma.whatsAppPairing.findMany({
      where: {
        userId,
        status: { in: ['pending', 'linked'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return pairings.map((pairing) => this.toPairingSession(pairing, twilio))
  }

  async createPairing(
    userId: string,
    input: CreateWhatsAppPairingInput = {},
  ): Promise<WhatsAppPairingSession> {
    const twilio = this.getTwilioConfig()
    if (!twilio) {
      throw new BadRequestException('Twilio WhatsApp channel is not configured.')
    }

    await this.expireStalePairings()
    const expiresInMinutesRaw = Number.parseInt(`${input.expiresInMinutes ?? DEFAULT_PAIRING_EXPIRES_MINUTES}`, 10)
    const expiresInMinutes = Number.isFinite(expiresInMinutesRaw)
      ? Math.max(MIN_PAIRING_EXPIRES_MINUTES, Math.min(expiresInMinutesRaw, MAX_PAIRING_EXPIRES_MINUTES))
      : DEFAULT_PAIRING_EXPIRES_MINUTES
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)
    const code = await this.generateUniquePairCode()
    const command = `${this.getPairingCommandPrefix()} ${code}`

    const pairing = await this.prisma.whatsAppPairing.create({
      data: {
        userId,
        code,
        command,
        expiresAt,
      },
    })

    this.bus.publish('run.event', {
      source: 'channels.whatsapp',
      action: 'pairing.created',
      userId,
      pairingId: pairing.id,
      expiresAt: pairing.expiresAt.toISOString(),
    })

    return this.toPairingSession(pairing, twilio)
  }

  async handleInbound(payload: WhatsAppInboundPayload) {
    const from = this.extractSender(payload)
    const userMessage = this.extractBody(payload)
    const messageSid = this.readString(payload, ['MessageSid', 'messageSid']) ?? null

    if (!from) {
      this.logger.warn('Ignoring WhatsApp inbound payload without sender.')
      return
    }

    if (!userMessage) {
      this.logger.debug(`Ignoring empty WhatsApp inbound message from ${from}.`)
      return
    }

    const pairingHandled = await this.tryLinkDeviceFromPairingCommand(from, userMessage, payload, messageSid)
    if (pairingHandled) {
      return
    }

    const route = await this.resolveConversationRoute(from, payload)
    if (!route) {
      await this.sendMessage(
        from,
        'This phone is not linked yet. Open Channels > WhatsApp in OpenAgents and generate a pairing QR/link.',
      )
      return
    }

    this.bus.publish('run.event', {
      source: 'channels.whatsapp',
      direction: 'inbound',
      routeSource: route.source,
      from,
      messageSid,
      conversationId: route.conversationId,
      userId: route.userId,
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
      const isSkillCommand = /^\s*(\/skill\s+|learn\s+skill\s*:|teach\s+skill\s*:|learn\s+skills?\s+(?:of|about|for)\s+)/i
        .test(userMessage)
      const run = this.nanobotConfig.enabled || isSkillCommand
        ? this.nanobotLoop.run.bind(this.nanobotLoop)
        : this.agent.run.bind(this.agent)

      await run({
        conversationId: route.conversationId,
        userId: route.userId,
        userMessage,
        emit,
      })
    } catch (error: any) {
      this.logger.error(`WhatsApp agent run failed for ${from}`, error)
      await this.sendMessage(
        from,
        'I hit an internal error while processing that. Please try again in a moment.',
      )
      this.bus.publish('run.event', {
        source: 'channels.whatsapp',
        direction: 'error',
        from,
        messageSid,
        conversationId: route.conversationId,
        userId: route.userId,
        error: error?.message ?? 'Unknown error',
      })
      return
    }

    const outbound = assistantReply || 'Done.'
    await this.sendMessage(from, outbound)
    this.bus.publish('run.event', {
      source: 'channels.whatsapp',
      direction: 'outbound',
      from,
      messageSid,
      conversationId: route.conversationId,
      userId: route.userId,
      hasReply: Boolean(assistantReply),
    })
  }

  private async tryLinkDeviceFromPairingCommand(
    from: string,
    userMessage: string,
    payload: WhatsAppInboundPayload,
    messageSid: string | null,
  ) {
    await this.expireStalePairings()
    const code = this.extractPairingCode(userMessage)
    if (!code) return false

    const pairing = await this.prisma.whatsAppPairing.findFirst({
      where: {
        code,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!pairing) return false

    if (pairing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.whatsAppPairing.update({
        where: { id: pairing.id },
        data: { status: 'expired' },
      })
      await this.sendMessage(from, 'Pairing code expired. Generate a new one from Channels > WhatsApp.')
      return true
    }

    const profileName = this.readString(payload, ['ProfileName', 'profileName'])
    const label = profileName ? profileName.slice(0, 80) : null
    const now = new Date()
    const device = await this.prisma.whatsAppDevice.upsert({
      where: { phone: from },
      update: {
        userId: pairing.userId,
        label,
        linkedAt: now,
        lastSeenAt: now,
      },
      create: {
        userId: pairing.userId,
        phone: from,
        label,
        linkedAt: now,
        lastSeenAt: now,
      },
    })

    await this.prisma.whatsAppPairing.update({
      where: { id: pairing.id },
      data: {
        status: 'linked',
        phone: from,
        linkedAt: now,
        consumedMessageSid: messageSid ?? undefined,
      },
    })

    await this.sendMessage(
      from,
      'Device linked successfully. You can now message this WhatsApp number to chat with your OpenAgents assistant.',
    )
    this.bus.publish('run.event', {
      source: 'channels.whatsapp',
      action: 'pairing.linked',
      pairingId: pairing.id,
      userId: pairing.userId,
      phone: from,
      deviceId: device.id,
    })
    return true
  }

  private async resolveConversationRoute(
    from: string,
    payload: WhatsAppInboundPayload,
  ): Promise<ConversationRoute | null> {
    const linkedDevice = await this.prisma.whatsAppDevice.findUnique({
      where: { phone: from },
      select: { id: true, userId: true },
    })
    const defaultUserId = this.getDefaultUserId()
    const routeUserId = linkedDevice?.userId ?? defaultUserId
    if (!routeUserId) {
      return null
    }

    const user = await this.prisma.user.findUnique({
      where: { id: routeUserId },
      select: { id: true },
    })
    if (!user) {
      this.logger.warn(`WhatsApp route user ${routeUserId} does not exist.`)
      return null
    }

    const sessionLabel = this.toSessionLabel(from)
    const existing = await this.prisma.conversation.findFirst({
      where: { sessionLabel, userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, userId: true },
    })

    let conversationId = existing?.id
    if (!conversationId) {
      const profileName = this.readString(payload, ['ProfileName', 'profileName'])
      const phoneLabel = from.replace(/^whatsapp:/i, '')
      const title = profileName
        ? `WhatsApp ${profileName}`
        : `WhatsApp ${phoneLabel}`

      const conversation = await this.prisma.conversation.create({
        data: {
          userId: user.id,
          title: title.slice(0, 80),
          sessionLabel,
        },
        select: { id: true },
      })
      conversationId = conversation.id
    }

    if (linkedDevice) {
      await this.prisma.whatsAppDevice.update({
        where: { id: linkedDevice.id },
        data: {
          lastSeenAt: new Date(),
          lastConversationId: conversationId,
        },
      }).catch(() => {})
    }

    return {
      conversationId,
      userId: user.id,
      source: linkedDevice ? 'linked-device' : 'default-route',
    }
  }

  private async sendMessage(to: string, body: string) {
    const twilio = this.getTwilioConfig()
    if (!twilio) {
      this.logger.warn('Twilio is not configured, skipping WhatsApp outbound message.')
      return
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`
    const form = new URLSearchParams({
      From: twilio.from,
      To: to,
      Body: body,
    })
    const auth = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`, 'utf8').toString('base64')

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      this.logger.error(`Twilio send failed (${response.status}): ${text}`)
    }
  }

  private async expireStalePairings() {
    await this.prisma.whatsAppPairing.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'expired' },
    })
  }

  private async generateUniquePairCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const token = randomBytes(4)
        .toString('base64url')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6)
      const code = `OA-${token}`
      const exists = await this.prisma.whatsAppPairing.findUnique({
        where: { code },
        select: { id: true },
      })
      if (!exists) return code
    }
    throw new Error('Failed to allocate unique WhatsApp pairing code.')
  }

  private extractPairingCode(userMessage: string) {
    const upper = userMessage.toUpperCase()
    const preferred = upper.match(/\bOA-[A-Z0-9]{6}\b/)
    if (preferred?.[0]) return preferred[0]

    const prefix = this.getPairingCommandPrefix().toUpperCase()
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const fallback = upper.match(new RegExp(`\\b${escapedPrefix}\\s+([A-Z0-9_-]{4,32})\\b`))
    if (fallback?.[1]) return fallback[1]
    return null
  }

  private extractSender(payload: WhatsAppInboundPayload) {
    const from = this.readString(payload, ['From', 'from'])
    if (from) return this.normalizeAddress(from)

    const waId = this.readString(payload, ['WaId', 'waId'])
    if (!waId) return null
    return this.normalizeAddress(`whatsapp:${waId}`)
  }

  private extractBody(payload: WhatsAppInboundPayload) {
    const body = this.readString(payload, ['Body', 'body'])
    if (!body) return null
    const trimmed = body.trim()
    return trimmed.length ? trimmed : null
  }

  private readString(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = payload[key]
      if (typeof value !== 'string') continue
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
    return null
  }

  private normalizeAddress(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^whatsapp:/i.test(trimmed)) {
      return `whatsapp:${trimmed.slice(9)}`
    }
    return `whatsapp:${trimmed}`
  }

  private toSessionLabel(from: string) {
    return `whatsapp:${from.replace(/^whatsapp:/i, '')}`
  }

  private getDefaultUserId() {
    const userId = (process.env.WHATSAPP_DEFAULT_USER_ID ?? '').trim()
    return userId || null
  }

  private getPairingCommandPrefix() {
    const prefix = (process.env.WHATSAPP_PAIR_COMMAND ?? '').trim()
    return prefix || 'link'
  }

  private toPairingSession(
    pairing: {
      id: string
      code: string
      command: string
      status: string
      phone: string | null
      expiresAt: Date
      linkedAt: Date | null
    },
    twilio: TwilioConfig | null,
  ): WhatsAppPairingSession {
    const waNumber = twilio ? this.toWaNumber(twilio.from) : null
    const linkText = pairing.command
    const linkUrl = waNumber
      ? `https://wa.me/${waNumber}?text=${encodeURIComponent(linkText)}`
      : null
    const qrImageUrl = linkUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(linkUrl)}`
      : null

    const statusRaw = pairing.status.toLowerCase()
    const status =
      statusRaw === 'linked' || statusRaw === 'expired' || statusRaw === 'canceled'
        ? statusRaw
        : 'pending'

    return {
      id: pairing.id,
      code: pairing.code,
      command: pairing.command,
      status,
      phone: pairing.phone,
      expiresAt: pairing.expiresAt.toISOString(),
      linkedAt: pairing.linkedAt ? pairing.linkedAt.toISOString() : null,
      linkText,
      linkUrl,
      qrImageUrl,
    }
  }

  private toWaNumber(from: string) {
    const raw = from.replace(/^whatsapp:/i, '').trim()
    if (!raw) return null
    const digits = raw.replace(/[^\d]/g, '')
    return digits || null
  }

  private getTwilioConfig(): TwilioConfig | null {
    const accountSid = (process.env.TWILIO_ACCOUNT_SID ?? '').trim()
    const authToken = (process.env.TWILIO_AUTH_TOKEN ?? '').trim()
    const rawFrom = (process.env.TWILIO_WHATSAPP_FROM ?? '').trim()

    if (!accountSid || !authToken || !rawFrom) return null
    const from = /^whatsapp:/i.test(rawFrom) ? rawFrom : `whatsapp:${rawFrom}`
    return { accountSid, authToken, from }
  }
}
