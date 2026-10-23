import { createHmac, timingSafeEqual } from 'node:crypto'

export const STRIPE_SIGNATURE_TOLERANCE_SEC = 300

/**
 * Verifies a Stripe-Signature header (`t=<timestamp>,v1=<hex hmac>`) against the
 * raw request body and returns the parsed event.
 *
 * This is deliberately a standalone function (no Nest decorators) so it can be
 * unit tested without booting the framework.
 */
export function verifyStripeSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  nowSec: number = Date.now() / 1000,
): any {
  if (!header) throw new Error('Missing Stripe-Signature header')

  const parts = header.split(',').map((p) => p.trim().split('='))
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1])
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v)

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error('Malformed Stripe-Signature header')
  }
  if (Math.abs(nowSec - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SEC) {
    throw new Error('Stripe signature timestamp outside tolerance')
  }

  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest()

  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })

  if (!ok) throw new Error('Invalid Stripe signature')

  return JSON.parse(payload)
}
