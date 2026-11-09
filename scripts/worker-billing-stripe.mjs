// Stripe billing for the Cloudflare Worker (env-optional).
//  • POST /api/v1/billing/checkout   (auth)  → Stripe Checkout Session URL
//  • POST /api/v1/billing/portal     (auth)  → Stripe Billing Portal URL
//  • GET  /api/v1/billing/plan       (auth)  → current plan + limits + plan catalogue
//  • GET  /api/v1/billing/usage      (auth)  → avatar / storage usage vs limits
//  • POST /api/v1/stripe/webhook     (public, verified via Stripe-Signature HMAC)
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM
// If Stripe is not configured, checkout/portal/webhook return 503 {message:'Billing not configured yet'}.

const MB = 1024 * 1024

export const PLAN_LIMITS = {
  free: { storageBytes: 500 * MB, avatars: 5 },
  pro: { storageBytes: 5 * 1024 * MB, avatars: 25 },
  team: { storageBytes: 20 * 1024 * MB, avatars: 100 },
}

const PLAN_CATALOGUE = [
  { id: 'free', name: 'Free', priceLabel: '$0 / month', features: ['500 MB avatar storage', 'Up to 5 realistic avatars', 'Bring your own AI keys'] },
  { id: 'pro', name: 'Pro', priceLabel: 'Pro', features: ['5 GB avatar storage', 'Up to 25 realistic avatars', 'Shareable public avatar pages', 'Priority support'] },
  { id: 'team', name: 'Team', priceLabel: 'Team', features: ['20 GB avatar storage', 'Up to 100 realistic avatars', 'Everything in Pro', 'Team workspaces'] },
]

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

let billingSchemaReady = false
async function ensureBillingSchema(env) {
  if (billingSchemaReady || !env.DB) return
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS subscriptions (
       user_id TEXT PRIMARY KEY,
       plan TEXT NOT NULL DEFAULT 'free',
       status TEXT,
       stripe_customer_id TEXT,
       stripe_subscription_id TEXT,
       current_period_end TEXT,
       updated_at TEXT NOT NULL
     )`,
  ).run()
  billingSchemaReady = true
}

export function stripeConfigured(env) {
  return Boolean(env.STRIPE_SECRET_KEY && (env.STRIPE_PRICE_PRO || env.STRIPE_PRICE_TEAM))
}

function toLimitsDto(limits) {
  return {
    storageBytes: limits.storageBytes,
    storageMB: Math.round(limits.storageBytes / MB),
    avatars: limits.avatars,
    // Legacy keys expected by the billing page (no metering in the cloud worker → unlimited)
    messages: -1,
    researchJobs: -1,
    agents: -1,
    voiceMinutes: -1,
  }
}

/** Returns { plan, status, limits:{storageBytes, avatars}, ... } for a user. Safe to call from other modules. */
export async function getUserPlanLimits(env, userId) {
  await ensureBillingSchema(env)
  const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).first().catch(() => null)
  let plan = 'free'
  if (row && PLAN_LIMITS[row.plan] && ACTIVE_STATUSES.has(String(row.status || ''))) plan = row.plan
  return {
    plan,
    status: row?.status || null,
    currentPeriodEnd: row?.current_period_end || null,
    stripeCustomerId: row?.stripe_customer_id || null,
    limits: { ...PLAN_LIMITS[plan] },
  }
}

async function stripeRequest(env, path, params) {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) body.append(k, String(v))
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Stripe HTTP ${res.status}`), { status: res.status })
  return json
}

async function upsertSubscription(env, userId, fields) {
  const cur = await env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).first()
  const next = {
    plan: fields.plan ?? cur?.plan ?? 'free',
    status: fields.status ?? cur?.status ?? null,
    stripe_customer_id: fields.stripe_customer_id ?? cur?.stripe_customer_id ?? null,
    stripe_subscription_id: fields.stripe_subscription_id ?? cur?.stripe_subscription_id ?? null,
    current_period_end: fields.current_period_end ?? cur?.current_period_end ?? null,
  }
  await env.DB.prepare(
    `INSERT OR REPLACE INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, next.plan, next.status, next.stripe_customer_id, next.stripe_subscription_id, next.current_period_end, new Date().toISOString())
    .run()
}

function planFromPrice(env, priceId) {
  if (priceId && priceId === env.STRIPE_PRICE_TEAM) return 'team'
  if (priceId && priceId === env.STRIPE_PRICE_PRO) return 'pro'
  return null
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

/** Verifies a Stripe-Signature header (t=...,v1=...) with WebCrypto. Tolerance 5 min. */
export async function verifyStripeSignature(secret, header, payload, toleranceSec = 300) {
  if (!secret || !header) return false
  const parts = Object.create(null)
  const v1 = []
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=')
    if (k === 'v1') v1.push(v)
    else parts[k] = v
  }
  const t = Number(parts.t)
  if (!t || v1.length === 0) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  for (const sig of v1) {
    if (!/^[0-9a-f]{64}$/i.test(sig || '')) continue
    // crypto.subtle.verify is constant-time
    if (await crypto.subtle.verify('HMAC', key, hexToBytes(sig), new TextEncoder().encode(`${t}.${payload}`))) return true
  }
  return false
}

async function storageUsedBytes(env, userId) {
  if (!env.AVATARS) return 0
  let total = 0
  let cursor
  for (let i = 0; i < 20; i++) {
    const page = await env.AVATARS.list({ prefix: `users/${userId}/`, cursor })
    for (const o of page.objects) total += o.size || 0
    if (!page.truncated) break
    cursor = page.cursor
  }
  return total
}

/**
 * ctx: { request, env, url, path, method, origin, user|null, h:{jsonResponse} }
 * Returns a Response when handled, otherwise null.
 */
export async function handleBillingRoutes(ctx) {
  const { request, env, url, path, method, origin, user, h } = ctx
  if (!path.startsWith('/api/v1/billing') && path !== '/api/v1/stripe/webhook') return null
  const json = (data, status = 200) => h.jsonResponse(data, status, origin)
  const notConfigured = () => json({ statusCode: 503, message: 'Billing not configured yet' }, 503)
  await ensureBillingSchema(env)

  // ── Webhook (public) ──
  if (path === '/api/v1/stripe/webhook') {
    if (method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return notConfigured()
    const payload = await request.text()
    if (payload.length > 512 * 1024) return json({ statusCode: 413, message: 'Payload too large' }, 413)
    const ok = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, request.headers.get('stripe-signature') || '', payload)
    if (!ok) return json({ statusCode: 400, message: 'Invalid signature' }, 400)
    let event
    try {
      event = JSON.parse(payload)
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON' }, 400)
    }
    const obj = event?.data?.object || {}
    if (event.type === 'checkout.session.completed') {
      const userId = obj.client_reference_id || obj.metadata?.userId
      if (userId) {
        await upsertSubscription(env, userId, {
          plan: PLAN_LIMITS[obj.metadata?.plan] ? obj.metadata.plan : undefined,
          status: 'active',
          stripe_customer_id: obj.customer || undefined,
          stripe_subscription_id: obj.subscription || undefined,
        })
      }
    } else if (event.type?.startsWith('customer.subscription.')) {
      let userId = obj.metadata?.userId
      if (!userId && obj.customer) {
        const r = await env.DB.prepare('SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?').bind(obj.customer).first()
        userId = r?.user_id
      }
      if (userId) {
        const priceId = obj.items?.data?.[0]?.price?.id
        const deleted = event.type === 'customer.subscription.deleted'
        const periodEnd = obj.current_period_end || obj.items?.data?.[0]?.current_period_end
        await upsertSubscription(env, userId, {
          plan: deleted ? 'free' : planFromPrice(env, priceId) || obj.metadata?.plan || undefined,
          status: deleted ? 'canceled' : obj.status || undefined,
          stripe_customer_id: obj.customer || undefined,
          stripe_subscription_id: obj.id || undefined,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined,
        })
      }
    }
    return json({ received: true })
  }

  if (!user) return null

  if (path === '/api/v1/billing/plan' && method === 'GET') {
    const p = await getUserPlanLimits(env, user.id)
    const configured = stripeConfigured(env)
    return json({
      configured,
      plan: p.plan,
      unlimited: false,
      limits: toLimitsDto(p.limits),
      subscriptionStatus: p.status,
      currentPeriodEnd: p.currentPeriodEnd,
      hasCustomer: Boolean(p.stripeCustomerId),
      plans: PLAN_CATALOGUE.map((c) => ({
        ...c,
        limits: toLimitsDto(PLAN_LIMITS[c.id]),
        purchasable: c.id !== 'free' && configured && Boolean(c.id === 'pro' ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_TEAM),
      })),
    })
  }

  if (path === '/api/v1/billing/usage' && method === 'GET') {
    const p = await getUserPlanLimits(env, user.id)
    const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM avatars WHERE userId = ?').bind(user.id).first().catch(() => null)
    const used = await storageUsedBytes(env, user.id).catch(() => 0)
    return json({
      configured: stripeConfigured(env),
      plan: p.plan,
      unlimited: false,
      metrics: [
        { metric: 'avatars', period: 'absolute', used: Number(countRow?.n || 0), limit: p.limits.avatars },
        { metric: 'storageMB', period: 'absolute', used: Math.round((used / MB) * 10) / 10, limit: Math.round(p.limits.storageBytes / MB) },
      ],
    })
  }

  if (path === '/api/v1/billing/checkout' && method === 'POST') {
    if (!stripeConfigured(env)) return notConfigured()
    const body = await request.json().catch(() => ({}))
    const plan = body.plan === 'team' ? 'team' : 'pro'
    const price = plan === 'team' ? env.STRIPE_PRICE_TEAM : env.STRIPE_PRICE_PRO
    if (!price) return notConfigured()
    const p = await getUserPlanLimits(env, user.id)
    const base = `https://${url.host}`
    try {
      const session = await stripeRequest(env, 'checkout/sessions', {
        mode: 'subscription',
        'line_items[0][price]': price,
        'line_items[0][quantity]': 1,
        client_reference_id: user.id,
        customer: p.stripeCustomerId || undefined,
        customer_email: p.stripeCustomerId ? undefined : user.email,
        'metadata[userId]': user.id,
        'metadata[plan]': plan,
        'subscription_data[metadata][userId]': user.id,
        'subscription_data[metadata][plan]': plan,
        allow_promotion_codes: 'true',
        success_url: `${base}/billing?checkout=success`,
        cancel_url: `${base}/billing?checkout=cancel`,
      })
      return json({ id: session.id, url: session.url })
    } catch (e) {
      return json({ statusCode: 502, message: `Stripe error: ${e.message}` }, 502)
    }
  }

  if (path === '/api/v1/billing/portal' && method === 'POST') {
    if (!env.STRIPE_SECRET_KEY) return notConfigured()
    const p = await getUserPlanLimits(env, user.id)
    if (!p.stripeCustomerId) return json({ statusCode: 400, message: 'No billing account yet — upgrade first.' }, 400)
    try {
      const session = await stripeRequest(env, 'billing_portal/sessions', {
        customer: p.stripeCustomerId,
        return_url: `https://${url.host}/billing`,
      })
      return json({ url: session.url })
    } catch (e) {
      return json({ statusCode: 502, message: `Stripe error: ${e.message}` }, 502)
    }
  }

  return null
}
