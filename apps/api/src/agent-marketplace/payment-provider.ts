import { randomUUID } from 'crypto'

export interface ChargeRequest {
  buyerId: string
  amountCents: number
  currency: string
  description: string
  /** Same key => same result (no double charge). */
  idempotencyKey: string
  /** Provider-specific payment method token. The simulated provider accepts `test_card` and `test_decline`. */
  paymentMethod?: string
}

export interface ChargeResult {
  ok: boolean
  reference: string
  status: 'succeeded' | 'declined'
  failureReason?: string
}

export interface PayoutRequest {
  creatorId: string
  amountCents: number
  currency: string
  idempotencyKey: string
}

export interface PayoutResult {
  ok: boolean
  reference: string
  status: 'paid' | 'failed'
}

/** Abstraction over a payment processor. Swap the implementation behind PAYMENT_PROVIDER. */
export interface PaymentProvider {
  readonly name: string
  /** True when no real money moves. Surfaced in the UI so nobody mistakes it for a live processor. */
  readonly simulated: boolean
  charge(req: ChargeRequest): Promise<ChargeResult>
  payout(req: PayoutRequest): Promise<PayoutResult>
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')

/** Test provider: never contacts a processor; deterministic and idempotent in-process. */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = 'simulated'
  readonly simulated = true
  private readonly charges = new Map<string, ChargeResult>()
  private readonly payouts = new Map<string, PayoutResult>()

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const prior = this.charges.get(req.idempotencyKey)
    if (prior) return prior
    const declined = req.paymentMethod === 'test_decline'
    const result: ChargeResult = declined
      ? { ok: false, reference: `sim_ch_${randomUUID()}`, status: 'declined', failureReason: 'Simulated card decline.' }
      : { ok: true, reference: `sim_ch_${randomUUID()}`, status: 'succeeded' }
    this.charges.set(req.idempotencyKey, result)
    return result
  }

  async payout(req: PayoutRequest): Promise<PayoutResult> {
    const prior = this.payouts.get(req.idempotencyKey)
    if (prior) return prior
    const result: PayoutResult = { ok: true, reference: `sim_po_${randomUUID()}`, status: 'paid' }
    this.payouts.set(req.idempotencyKey, result)
    return result
  }
}
