import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

const MAX_SUBSCRIPTIONS_PER_USER = 20

/**
 * Web-push subscriptions live in Postgres now — they used to be a JSON file per
 * user, which meant a browser that re-subscribed after a restart silently
 * stopped receiving notifications.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)
  private readonly warned = new Set<string>()
  private webpush: any | null | undefined

  constructor(private prisma: PrismaService) {}

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return
    this.warned.add(key)
    this.logger.warn(message)
  }

  private async load(userId: string): Promise<PushSubscription[]> {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((row) => ({
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    }))
  }

  async subscribe(userId: string, subscription: PushSubscription) {
    const endpoint = subscription?.endpoint
    const p256dh = subscription?.keys?.p256dh
    const auth = subscription?.keys?.auth
    if (!endpoint || !p256dh || !auth) {
      return { ok: false, total: await this.count(userId) }
    }

    const existing = await this.prisma.pushSubscription.findUnique({
      where: { userId_endpoint: { userId, endpoint } },
    })

    if (existing) {
      await this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { p256dh, auth },
      })
    } else {
      const count = await this.prisma.pushSubscription.count({ where: { userId } })
      if (count >= MAX_SUBSCRIPTIONS_PER_USER) {
        // Drop the oldest so the newest device always wins.
        const oldest = await this.prisma.pushSubscription.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        })
        if (oldest) await this.prisma.pushSubscription.delete({ where: { id: oldest.id } })
      }
      await this.prisma.pushSubscription.create({
        data: { userId, endpoint, p256dh, auth },
      })
    }

    const total = await this.count(userId)
    this.logger.log(`Push subscription registered for user=${userId}`)
    return { ok: true, total }
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } })
    return { ok: true }
  }

  private async count(userId: string) {
    return this.prisma.pushSubscription.count({ where: { userId } })
  }

  /** Lazily loads web-push; returns null (and logs once) when unavailable or not configured. */
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
    const expired: string[] = []

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload))
        sent++
      } catch (err: any) {
        failed++
        const status = Number(err?.statusCode ?? err?.status)
        if (status === 404 || status === 410) expired.push(sub.endpoint)
        this.logger.warn(`Push failed for endpoint ${sub.endpoint.slice(0, 40)} (${status || 'n/a'}): ${err?.message ?? err}`)
      }
    }

    if (expired.length) {
      await this.prisma.pushSubscription.deleteMany({
        where: { userId, endpoint: { in: expired } },
      })
      this.logger.log(`Removed ${expired.length} expired push subscription(s) for user=${userId}`)
    }

    return { sent, failed }
  }

  getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null
  }
}
