import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)
  // In-memory store keyed by userId (persisted via DB ideally, simplified here)
  private subscriptions = new Map<string, PushSubscription[]>()

  constructor(private prisma: PrismaService) {}

  subscribe(userId: string, subscription: PushSubscription) {
    const existing = this.subscriptions.get(userId) ?? []
    // Avoid duplicates by endpoint
    const deduped = existing.filter((s) => s.endpoint !== subscription.endpoint)
    deduped.push(subscription)
    this.subscriptions.set(userId, deduped)
    this.logger.log(`Push subscription registered for user=${userId}`)
    return { ok: true, total: deduped.length }
  }

  unsubscribe(userId: string, endpoint: string) {
    const existing = this.subscriptions.get(userId) ?? []
    this.subscriptions.set(userId, existing.filter((s) => s.endpoint !== endpoint))
    return { ok: true }
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; url?: string; icon?: string },
  ): Promise<{ sent: number; failed: number }> {
    const subs = this.subscriptions.get(userId) ?? []
    if (subs.length === 0) return { sent: 0, failed: 0 }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
    const vapidEmail = process.env.VAPID_EMAIL ?? 'admin@openagents.us'

    if (!vapidPublicKey || !vapidPrivateKey) {
      this.logger.warn('VAPID keys not configured — push notifications disabled')
      return { sent: 0, failed: subs.length }
    }

    // Use web-push if available, otherwise log only
    let webpush: any
    try {
      webpush = require('web-push')
      webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublicKey, vapidPrivateKey)
    } catch {
      this.logger.warn('web-push package not installed — install with: pnpm add web-push')
      return { sent: 0, failed: subs.length }
    }

    let sent = 0
    let failed = 0

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload))
        sent++
      } catch (err: any) {
        failed++
        this.logger.warn(`Push failed for endpoint ${sub.endpoint.slice(0, 40)}: ${err.message}`)
      }
    }

    return { sent, failed }
  }

  getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null
  }
}
