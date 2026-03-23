import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { WebhookEventType, WebhookPayload } from '@openagents/shared'
import * as crypto from 'crypto'

@Injectable()
export class WebhooksService {
  constructor(private prisma: PrismaService) {}

  async create(
    userId: string,
    url: string,
    events: WebhookEventType[],
    secret?: string,
    headers?: Record<string, string>,
  ) {
    return this.prisma.webhook.create({
      data: {
        userId,
        url,
        events: JSON.stringify(events),
        secret,
        headers: headers ? JSON.stringify(headers) : null,
      },
    })
  }

  async list(userId: string) {
    const webhooks = await this.prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { deliveries: true },
        },
      },
    })

    return webhooks.map((w) => ({
      id: w.id,
      userId: w.userId,
      url: w.url,
      events: JSON.parse(w.events) as WebhookEventType[],
      secret: w.secret,
      enabled: w.enabled,
      headers: w.headers ? JSON.parse(w.headers) : undefined,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      deliveryCount: w._count.deliveries,
    }))
  }

  async get(id: string, userId: string) {
    const w = await this.prisma.webhook.findFirst({
      where: { id, userId },
    })
    if (!w) return null

    return {
      id: w.id,
      userId: w.userId,
      url: w.url,
      events: JSON.parse(w.events) as WebhookEventType[],
      secret: w.secret,
      enabled: w.enabled,
      headers: w.headers ? JSON.parse(w.headers) : undefined,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    }
  }

  async update(
    id: string,
    userId: string,
    data: {
      url?: string
      events?: WebhookEventType[]
      secret?: string
      enabled?: boolean
      headers?: Record<string, string>
    },
  ) {
    const updateData: any = {}
    if (data.url !== undefined) updateData.url = data.url
    if (data.events !== undefined) updateData.events = JSON.stringify(data.events)
    if (data.secret !== undefined) updateData.secret = data.secret
    if (data.enabled !== undefined) updateData.enabled = data.enabled
    if (data.headers !== undefined) updateData.headers = JSON.stringify(data.headers)

    const w = await this.prisma.webhook.updateMany({
      where: { id, userId },
      data: updateData,
    })
    return w.count > 0 ? this.get(id, userId) : null
  }

  async delete(id: string, userId: string) {
    return this.prisma.webhook.deleteMany({
      where: { id, userId },
    })
  }

  async getDeliveries(
    webhookId: string,
    userId: string,
    options: { take?: number; status?: string } = {},
  ) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id: webhookId, userId },
    })
    if (!webhook) return []

    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: options.take || 50,
    })

    return deliveries.map((d) => ({
      id: d.id,
      webhookId: d.webhookId,
      event: d.event as WebhookEventType,
      payload: JSON.parse(d.payload) as WebhookPayload,
      status: d.status,
      attempts: d.attempts,
      lastAttemptAt: d.lastAttemptAt?.toISOString(),
      responseStatus: d.responseStatus,
      responseBody: d.responseBody,
      error: d.error,
      createdAt: d.createdAt.toISOString(),
    }))
  }

  async getDeliveryStats(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id: webhookId, userId },
    })
    if (!webhook) return null

    const [total, success, failed, pending] = await Promise.all([
      this.prisma.webhookDelivery.count({ where: { webhookId } }),
      this.prisma.webhookDelivery.count({ where: { webhookId, status: 'success' } }),
      this.prisma.webhookDelivery.count({ where: { webhookId, status: 'failed' } }),
      this.prisma.webhookDelivery.count({ where: { webhookId, status: 'pending' } }),
    ])

    return {
      total,
      success,
      failed,
      pending,
      successRate: total > 0 ? Math.round((success / total) * 100) : 0,
    }
  }

  async triggerEvent(event: WebhookEventType, userId: string, data: Record<string, unknown>) {
    const webhooks = await this.prisma.webhook.findMany({
      where: { userId, enabled: true },
    })

    const matchingWebhooks = webhooks.filter((w) => {
      const events = JSON.parse(w.events) as WebhookEventType[]
      return events.includes(event)
    })

    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      userId,
      data,
    }

    const deliveries = await Promise.all(
      matchingWebhooks.map((w) =>
        this.prisma.webhookDelivery.create({
          data: {
            webhookId: w.id,
            userId: w.userId,
            event,
            payload: JSON.stringify(payload),
            status: 'pending',
          },
        }),
      ),
    )

    // Process deliveries asynchronously
    for (const delivery of deliveries) {
      this.deliverWebhook(delivery.id, matchingWebhooks.find((w) => w.id === delivery.webhookId)!)
    }

    return { triggered: matchingWebhooks.length, deliveries: deliveries.length }
  }

  private async deliverWebhook(deliveryId: string, webhook: any) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    })
    if (!delivery) return

    const payload = JSON.parse(delivery.payload) as WebhookPayload
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': delivery.event,
      'X-Webhook-Delivery-Id': delivery.id,
    }

    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(JSON.stringify(payload))
        .digest('hex')
      headers['X-Webhook-Signature'] = signature
    }

    if (webhook.headers) {
      const customHeaders = JSON.parse(webhook.headers) as Record<string, string>
      Object.assign(headers, customHeaders)
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: response.ok ? 'success' : 'failed',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          responseStatus: response.status,
          responseBody: await response.text().catch(() => null),
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          error: errorMessage,
        },
      })
    }
  }

  async retryDelivery(deliveryId: string, userId: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId },
      include: { webhook: true },
    })

    if (!delivery || delivery.webhook.userId !== userId) {
      return null
    }

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'pending' },
    })

    this.deliverWebhook(deliveryId, delivery.webhook)
    return { retried: true }
  }

  async testWebhook(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id: webhookId, userId },
    })
    if (!webhook) return null

    const testPayload: WebhookPayload = {
      id: crypto.randomUUID(),
      event: 'test' as WebhookEventType,
      timestamp: new Date().toISOString(),
      userId,
      data: { type: 'test', message: 'This is a test webhook delivery' },
    }

    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookId,
        userId,
        event: 'test',
        payload: JSON.stringify(testPayload),
        status: 'pending',
      },
    })

    this.deliverWebhook(delivery.id, webhook)
    return { testDeliveryId: delivery.id }
  }
}
