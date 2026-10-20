import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

export interface ExpoTokenRecord {
  token: string
  platform?: 'ios' | 'android' | 'web' | string
  deviceName?: string
  createdAt: string
  lastSeenAt: string
}

const EXPO_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** Stores Expo push tokens per user in data/expo-push/<safeUserId>.json and sends pushes via Expo. */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name)
  private readonly dir = path.resolve(process.env.EXPO_PUSH_DATA_DIR ?? path.join(process.cwd(), 'data', 'expo-push'))

  private file(userId: string) {
    return path.join(this.dir, `${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
  }

  async list(userId: string): Promise<ExpoTokenRecord[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file(userId), 'utf8'))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private async write(userId: string, items: ExpoTokenRecord[]) {
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.file(userId), JSON.stringify(items, null, 2), 'utf8')
  }

  async register(userId: string, body: { token: string; platform?: string; deviceName?: string }) {
    const token = (body?.token ?? '').trim()
    if (!EXPO_TOKEN_RE.test(token)) throw new BadRequestException('Invalid Expo push token')
    const now = new Date().toISOString()
    const items = await this.list(userId)
    const existing = items.find((t) => t.token === token)
    if (existing) {
      existing.lastSeenAt = now
      existing.platform = body.platform ?? existing.platform
      existing.deviceName = body.deviceName?.slice(0, 100) ?? existing.deviceName
    } else {
      items.push({ token, platform: body.platform, deviceName: body.deviceName?.slice(0, 100), createdAt: now, lastSeenAt: now })
    }
    await this.write(userId, items.slice(-20))
    return { ok: true, count: Math.min(items.length, 20) }
  }

  async unregister(userId: string, token: string) {
    const items = await this.list(userId)
    await this.write(userId, items.filter((t) => t.token !== token))
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
      if (dead.size) await this.write(userId, tokens.filter((t) => !dead.has(t.token)))
      return { sent: tokens.length - dead.size }
    } catch (err: any) {
      this.logger.warn(`Expo push failed: ${err?.message ?? err}`)
      return { sent: 0, error: 'Expo push request failed' }
    }
  }
}
