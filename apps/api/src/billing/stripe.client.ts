import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'crypto'

const STRIPE_API = 'https://api.stripe.com/v1'
const SIGNATURE_TOLERANCE_SEC = 300

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
    if (!header) throw new Error('Missing Stripe-Signature header')
    const parts = header.split(',').map((p) => p.trim().split('='))
    const timestamp = Number(parts.find(([k]) => k === 't')?.[1])
    const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
    if (!Number.isFinite(timestamp) || signatures.length === 0) throw new Error('Malformed Stripe-Signature header')
    if (Math.abs(nowSec - timestamp) > SIGNATURE_TOLERANCE_SEC) throw new Error('Stripe signature timestamp outside tolerance')

    const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
    const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest()
    const ok = signatures.some((sig) => {
      const given = Buffer.from(sig, 'hex')
      return given.length === expected.length && timingSafeEqual(given, expected)
    })
    if (!ok) throw new Error('Invalid Stripe signature')
    return JSON.parse(payload)
  }
}
