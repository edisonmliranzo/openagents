import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface ExpoTokenRecord {
  token: string
  platform?: 'ios' | 'android' | 'web' | string
  deviceName?: string
  createdAt: string
  lastSeenAt: string
}

const EXPO_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const MAX_TOKENS = 20

/** Stores Expo push tokens per user in Postgres and sends pushes via Expo. */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name)

  constructor(private prisma: PrismaService) {}

  async list(userId: string): Promise<ExpoTokenRecord[]> {
    const rows = await this.prisma.expoPushToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((row) => ({
      token: row.token,
      platform: row.platform ?? undefined,
      deviceName: row.deviceName ?? undefined,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
    }))
  }

  async register(userId: string, body: { token: string; platform?: string; deviceName?: string }) {
    const token = (body?.token ?? '').trim()
    if (!EXPO_TOKEN_RE.test(token)) throw new BadRequestException('Invalid Expo push token')
    const now = new Date()

    const existing = await this.prisma.expoPushToken.findUnique({
      where: { userId_token: { userId, token } },
    })

    if (existing) {
      await this.prisma.expoPushToken.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          platform: body.platform ?? existing.platform,
          deviceName: body.deviceName?.slice(0, 100) ?? existing.deviceName,
        },
      })
    } else {
      const count = await this.prisma.expoPushToken.count({ where: { userId } })
      if (count >= MAX_TOKENS) {
        const oldest = await this.prisma.expoPushToken.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        })
        if (oldest) await this.prisma.expoPushToken.delete({ where: { id: oldest.id } })
      }
      await this.prisma.expoPushToken.create({
        data: {
          userId,
          token,
          platform: body.platform ?? null,
          deviceName: body.deviceName?.slice(0, 100) ?? null,
        },
      })
    }

    const total = await this.prisma.expoPushToken.count({ where: { userId } })
    return { ok: true, count: total }
  }

  async unregister(userId: string, token: string) {
    await this.prisma.expoPushToken.deleteMany({ where: { userId, token } })
    return { ok: true }
  }

  async sendToUser(userId: string, msg: { title: string; body: string; data?: Record<string, unknown> }) {
    const tokens = await this.list(userId)
    if (!tokens.length) return { sent: 0 }
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: 'default' }))),
      })
      const json: any = await res.json().catch(() => ({}))
      // Prune tokens Expo reports as no longer registered.
      const dead = new Set<string>()
      ;(json?.data ?? []).forEach((r: any, i: number) => {
        if (r?.details?.error === 'DeviceNotRegistered' && tokens[i]) dead.add(tokens[i].token)
      })
      if (dead.size) {
        await this.prisma.expoPushToken.deleteMany({
          where: { userId, token: { in: [...dead] } },
        })
      }
      return { sent: tokens.length - dead.size }
    } catch (err: any) {
      this.logger.warn(`Expo push failed: ${err?.message ?? err}`)
      return { sent: 0, error: 'Expo push request failed' }
    }
  }
}
