import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifyStripeSignature } from './stripe-signature.ts'

const SECRET = 'whsec_test_secret'
const BODY = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' })

function sign(payload: string, timestamp: number, secret = SECRET) {
  const hmac = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  return `t=${timestamp},v1=${hmac}`
}

test('a correctly signed payload is accepted and parsed', () => {
  const timestamp = 1_700_000_000
  const event = verifyStripeSignature(BODY, sign(BODY, timestamp), SECRET, timestamp)
  assert.equal(event.id, 'evt_1')
  assert.equal(event.type, 'checkout.session.completed')
})

test('a raw Buffer body verifies the same way as a string body', () => {
  const timestamp = 1_700_000_000
  const event = verifyStripeSignature(Buffer.from(BODY, 'utf8'), sign(BODY, timestamp), SECRET, timestamp)
  assert.equal(event.id, 'evt_1')
})

test('a tampered payload is rejected', () => {
  const timestamp = 1_700_000_000
  const header = sign(BODY, timestamp)
  assert.throws(
    () => verifyStripeSignature('{"id":"evt_2"}', header, SECRET, timestamp),
    /Invalid Stripe signature/,
  )
})

test('a signature made with a different secret is rejected', () => {
  const timestamp = 1_700_000_000
  const header = sign(BODY, timestamp, 'whsec_other')
  assert.throws(
    () => verifyStripeSignature(BODY, header, SECRET, timestamp),
    /Invalid Stripe signature/,
  )
})

test('a stale timestamp outside the tolerance window is rejected', () => {
  const timestamp = 1_700_000_000
  const header = sign(BODY, timestamp)
  assert.throws(
    () => verifyStripeSignature(BODY, header, SECRET, timestamp + 301),
    /outside tolerance/,
  )
})

test('a missing or malformed header is rejected', () => {
  assert.throws(() => verifyStripeSignature(BODY, undefined, SECRET), /Missing Stripe-Signature header/)
  assert.throws(() => verifyStripeSignature(BODY, 'nonsense', SECRET), /Malformed Stripe-Signature header/)
  assert.throws(() => verifyStripeSignature(BODY, 't=123', SECRET), /Malformed Stripe-Signature header/)
})
