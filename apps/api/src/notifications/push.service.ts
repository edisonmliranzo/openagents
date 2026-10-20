import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

const MAX_SUBSCRIPTIONS_PER_USER = 20

function safeUserId(userId: string) {
  return String(userId).replace(/[^A-Za-z0-9_-]/g, '_') || '_'
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)
  /** Subscriptions persisted to data/push/<userId>.json, cached in memory. */
  private subscriptions = new Map<string, PushSubscription[]>()
  private readonly dir = path.resolve(process.env.PUSH_DATA_DIR ?? path.join(process.cwd(), 'data', 'push'))
  private warned = new Set<string>()
  private webpush: any | null | undefined

  constructor(private prisma: PrismaService) {}

  private fileFor(userId: string) {
    return path.join(this.dir, `${safeUserId(userId)}.json`)
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return
    this.warned.add(key)
    this.logger.warn(message)
  }

  private async load(userId: string): Promise<PushSubscription[]> {
    const cached = this.subscriptions.get(userId)
    if (cached) return cached
    let subs: PushSubscription[] = []
    try {
      const parsed = JSON.parse(await fs.readFile(this.fileFor(userId), 'utf8'))
      if (Array.isArray(parsed)) {
        subs = parsed.filter(
          (s: any) => s && typeof s.endpoint === 'string' && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string',
        )
      }
    } catch {
      // missing/corrupt file -> no subscriptions
    }
    this.subscriptions.set(userId, subs)
    return subs
  }

  private async save(userId: string, subs: PushSubscription[]) {
    this.subscriptions.set(userId, subs)
    try {
      await fs.mkdir(this.dir, { recursive: true })
      const file = this.fileFor(userId)
      const tmp = `${file}.tmp`
      await fs.writeFile(tmp, JSON.stringify(subs, null, 2), 'utf8')
      await fs.rename(tmp, file)
    } catch (error: any) {
      this.logger.warn(`Failed to persist push subscriptions for ${userId}: ${error?.message ?? error}`)
    }
  }

  async subscribe(userId: string, subscription: PushSubscription) {
    const existing = await this.load(userId)
    // Avoid duplicates by endpoint
    const deduped = existing.filter((s) => s.endpoint !== subscription.endpoint)
    deduped.push({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys?.p256dh, auth: subscription.keys?.auth } })
    const trimmed = deduped.slice(-MAX_SUBSCRIPTIONS_PER_USER)
    await this.save(userId, trimmed)
    this.logger.log(`Push subscription registered for user=${userId}`)
    return { ok: true, total: trimmed.length }
  }

  async unsubscribe(userId: string, endpoint: string) {
    const existing = await this.load(userId)
    await this.save(userId, existing.filter((s) => s.endpoint !== endpoint))
    return { ok: true }
  }

  /** Lazily loads web-push; returns null (and logs once) when unavailable or VAPID is not configured. */
  private getWebPush(): any | null {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
    if (!vapidPublicKey || !vapidPrivateKey) {
      this.warnOnce('vapid', 'VAPID keys not configured - push notifications disabled')
      return null
    }
    if (this.webpush === undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const wp = require('web-push')
        const vapidEmail = process.env.VAPID_EMAIL ?? 'admin@openagents.us'
        wp.setVapidDetails(vapidEmail.startsWith('mailto:') ? vapidEmail : `mailto:${vapidEmail}`, vapidPublicKey, vapidPrivateKey)
        this.webpush = wp
      } catch (error: any) {
        this.webpush = null
        this.warnOnce('webpush', `web-push unavailable - push notifications disabled (${error?.message ?? error})`)
      }
    }
    return this.webpush ?? null
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; url?: string; icon?: string },
  ): Promise<{ sent: number; failed: number }> {
    const subs = await this.load(userId)
    if (subs.length === 0) return { sent: 0, failed: 0 }

    const webpush = this.getWebPush()
    if (!webpush) return { sent: 0, failed: subs.length }

    let sent = 0
    let failed = 0
    const expired = new Set<string>()

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload))
        sent++
      } catch (err: any) {
        failed++
        const status = Number(err?.statusCode ?? err?.status)
        if (status === 404 || status === 410) expired.add(sub.endpoint)
        this.logger.warn(`Push failed for endpoint ${sub.endpoint.slice(0, 40)} (${status || 'n/a'}): ${err?.message ?? err}`)
      }
    }

    if (expired.size) {
      const current = await this.load(userId)
      await this.save(userId, current.filter((s) => !expired.has(s.endpoint)))
      this.logger.log(`Removed ${expired.size} expired push subscription(s) for user=${userId}`)
    }

    return { sent, failed }
  }

  getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null
  }
}
