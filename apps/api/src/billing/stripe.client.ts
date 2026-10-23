import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { verifyStripeSignature } from './stripe-signature'

const STRIPE_API = 'https://api.stripe.com/v1'

/** Flatten nested objects to Stripe's form encoding: a[b][0][c]=v */
function encodeForm(data: Record<string, unknown>, prefix = '', out: string[] = []) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (typeof value === 'object') {
      encodeForm(value as Record<string, unknown>, name, out)
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
    }
  }
  return out
}

/** Minimal Stripe REST client using fetch (no SDK dependency). */
@Injectable()
export class StripeClient {
  private readonly logger = new Logger(StripeClient.name)

  get secretKey() {
    return process.env.STRIPE_SECRET_KEY?.trim() || ''
  }

  get configured() {
    return Boolean(this.secretKey)
  }

  async request<T = any>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    if (!this.configured) throw new ServiceUnavailableException('Billing is not configured.')
    const form = body ? encodeForm(body).join('&') : undefined
    const url = method === 'GET' && form ? `${STRIPE_API}${path}?${form}` : `${STRIPE_API}${path}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: method === 'POST' ? form : undefined,
    })
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = json?.error?.message ?? `Stripe request failed (${res.status})`
      this.logger.warn(`Stripe ${method} ${path}: ${message}`)
      throw new ServiceUnavailableException(message)
    }
    return json as T
  }

  /**
   * Verify a Stripe-Signature header (t=...,v1=...) against the raw request body.
   * Returns the parsed event or throws.
   */
  verifyWebhook(rawBody: Buffer | string, header: string | undefined, secret: string, nowSec = Date.now() / 1000) {
    return verifyStripeSignature(rawBody, header, secret, nowSec)
  }
}
