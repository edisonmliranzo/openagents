// PayPal billing for the Cloudflare Worker (env-optional).
//
// Model: one-time payment that grants a plan for a fixed period. PayPal
// Subscriptions would require pre-created billing plans in the dashboard;
// Orders + a period grant keeps setup to two secrets.
//
//   GET  /api/v1/billing/paypal/status   (auth)  -> configured? env? prices?
//   POST /api/v1/billing/paypal/order    (auth)  -> { id, approveUrl }
//   POST /api/v1/billing/paypal/capture  (auth)  -> capture + grant plan
//   POST /api/v1/paypal/webhook          (public, signature verified)
//
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET (required)
//      PAYPAL_ENV=live|sandbox (default sandbox)
//      PAYPAL_CURRENCY (default USD)
//      PAYPAL_PRICE_PRO_USD (default 20), PAYPAL_PRICE_TEAM_USD (default 50)
//      PAYPAL_PERIOD_DAYS (default 30)
//      PAYPAL_WEBHOOK_ID (optional; webhook verification is skipped without it)
//
// Secrets never leave the Worker: the client only ever sees an order id and
// the PayPal-hosted approval URL.

const PLANS = {
  pro: { name: 'OpenAgents Pro', envPrice: 'PAYPAL_PRICE_PRO_USD', defaultUsd: 20 },
  team: { name: 'OpenAgents Team', envPrice: 'PAYPAL_PRICE_TEAM_USD', defaultUsd: 50 },
}

function baseUrl(env) {
  return String(env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

export function paypalConfigured(env) {
  return Boolean(String(env.PAYPAL_CLIENT_ID || '').trim() && String(env.PAYPAL_CLIENT_SECRET || '').trim())
}

function priceFor(env, plan) {
  const def = PLANS[plan]
  if (!def) return null
  const raw = Number(env[def.envPrice])
  const usd = Number.isFinite(raw) && raw > 0 ? raw : def.defaultUsd
  return { amount: usd.toFixed(2), currency: String(env.PAYPAL_CURRENCY || 'USD').toUpperCase() }
}

function periodDays(env) {
  const raw = Number(env.PAYPAL_PERIOD_DAYS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30
}

// Access tokens are valid ~9h; cache per isolate to avoid a token call per request.
let tokenCache = { key: '', token: '', expiresAt: 0 }

async function paypalToken(env) {
  const key = `${baseUrl(env)}|${env.PAYPAL_CLIENT_ID}`
  if (tokenCache.key === key && tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token
  }
  const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)
  const res = await fetch(`${baseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.access_token) {
    throw Object.assign(new Error(json?.error_description || `PayPal auth failed (${res.status})`), { status: 502 })
  }
  tokenCache = { key, token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 }
  return tokenCache.token
}

async function paypalFetch(env, path, init = {}) {
  const token = await paypalToken(env)
  const res = await fetch(`${baseUrl(env)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

async function ensurePaypalSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS paypal_orders (
       order_id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       plan TEXT NOT NULL,
       amount TEXT,
       currency TEXT,
       status TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
  ).run()
}

async function grantPlan(env, userId, plan, days, orderId) {
  const cur = await env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).first().catch(() => null)
  // Extend rather than reset when the user pays again before expiry.
  const existingEnd = cur?.current_period_end ? Date.parse(cur.current_period_end) : 0
  const base = Number.isFinite(existingEnd) && existingEnd > Date.now() ? existingEnd : Date.now()
  const periodEnd = new Date(base + days * 24 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare(
    `INSERT OR REPLACE INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
     VALUES (?, ?, 'active', ?, ?, ?, ?)`,
  )
    .bind(
      userId,
      plan,
      cur?.stripe_customer_id ?? null,
      orderId ? `paypal:${orderId}` : (cur?.stripe_subscription_id ?? null),
      periodEnd,
      new Date().toISOString(),
    )
    .run()
  return periodEnd
}

function approvalLink(order) {
  const links = Array.isArray(order?.links) ? order.links : []
  const approve = links.find((l) => l?.rel === 'approve' || l?.rel === 'payer-action')
  return approve?.href || null
}

/** Captured amount must match the plan price; never trust the client. */
function capturedAmount(order) {
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0]
  return {
    status: capture?.status || order?.status || null,
    value: capture?.amount?.value ?? null,
    currency: String(capture?.amount?.currency_code || '').toUpperCase() || null,
  }
}

/**
 * ctx: { request, env, url, path, method, origin, user|null, h:{jsonResponse} }
 * Returns a Response when handled, otherwise null.
 */
export async function handlePayPalRoutes(ctx) {
  const { request, env, url, path, method, origin, user, h } = ctx
  const isPublicWebhook = path === '/api/v1/paypal/webhook'
  if (!isPublicWebhook && !path.startsWith('/api/v1/billing/paypal')) return null

  const json = (data, status = 200) => h.jsonResponse(data, status, origin)
  if (!env.DB) return json({ statusCode: 503, message: 'Billing storage unavailable' }, 503)
  await ensurePaypalSchema(env)

  if (isPublicWebhook) {
    if (method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    if (!paypalConfigured(env) || !env.PAYPAL_WEBHOOK_ID) return json({ received: true, verified: false })
    const raw = await request.text()
    if (raw.length > 512 * 1024) return json({ statusCode: 413, message: 'Payload too large' }, 413)

    let event
    try {
      event = JSON.parse(raw)
    } catch {
      return json({ statusCode: 400, message: 'Invalid JSON' }, 400)
    }

    const verify = await paypalFetch(env, '/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: request.headers.get('paypal-auth-algo') || '',
        cert_url: request.headers.get('paypal-cert-url') || '',
        transmission_id: request.headers.get('paypal-transmission-id') || '',
        transmission_sig: request.headers.get('paypal-transmission-sig') || '',
        transmission_time: request.headers.get('paypal-transmission-time') || '',
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      }),
    }).catch(() => ({ ok: false, json: {} }))

    if (!verify.ok || verify.json?.verification_status !== 'SUCCESS') {
      return json({ statusCode: 400, message: 'Invalid webhook signature' }, 400)
    }

    // Safety net for captures that completed on PayPal's side but whose
    // client-side capture call never reached us.
    if (event?.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = event?.resource?.supplementary_data?.related_ids?.order_id
      if (orderId) {
        const known = await env.DB.prepare('SELECT * FROM paypal_orders WHERE order_id = ?').bind(orderId).first()
        if (!known || known.status !== 'completed') {
          const detail = await paypalFetch(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}`)
          const custom = detail.json?.purchase_units?.[0]?.custom_id || ''
          const [userId, plan] = String(custom).split(':')
          const price = priceFor(env, plan)
          const captured = capturedAmount(detail.json)
          if (
            detail.ok &&
            userId &&
            price &&
            captured.status === 'COMPLETED' &&
            captured.value === price.amount &&
            captured.currency === price.currency
          ) {
            await grantPlan(env, userId, plan, periodDays(env), orderId)
            await env.DB.prepare(
              `INSERT OR REPLACE INTO paypal_orders (order_id, user_id, plan, amount, currency, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`,
            )
              .bind(orderId, userId, plan, price.amount, price.currency, new Date().toISOString(), new Date().toISOString())
              .run()
          }
        }
      }
    }
    return json({ received: true })
  }

  // Defer to the authenticated pass; the outer handler returns 401 if no user.
  if (!user) return null

  if (path === '/api/v1/billing/paypal/status' && method === 'GET') {
    const configured = paypalConfigured(env)
    return json({
      configured,
      mode: String(env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox',
      currency: String(env.PAYPAL_CURRENCY || 'USD').toUpperCase(),
      periodDays: periodDays(env),
      webhookConfigured: Boolean(env.PAYPAL_WEBHOOK_ID),
      plans: Object.entries(PLANS).map(([id, def]) => {
        const price = priceFor(env, id)
        return { id, name: def.name, amount: price.amount, currency: price.currency }
      }),
    })
  }

  if (path === '/api/v1/billing/paypal/order' && method === 'POST') {
    if (!paypalConfigured(env)) return json({ statusCode: 503, message: 'PayPal not configured yet' }, 503)
    const body = await request.json().catch(() => ({}))
    const plan = String(body.plan || '').toLowerCase()
    const price = priceFor(env, plan)
    if (!price) return json({ statusCode: 400, message: 'Unknown plan' }, 400)

    const orderRes = await paypalFetch(env, '/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: plan,
            custom_id: `${user.id}:${plan}`,
            description: `${PLANS[plan].name} — ${periodDays(env)} days`,
            amount: { currency_code: price.currency, value: price.amount },
          },
        ],
        application_context: {
          brand_name: 'OpenAgents',
          user_action: 'PAY_NOW',
          return_url: `${url.origin}/billing?paypal=return`,
          cancel_url: `${url.origin}/billing?paypal=cancel`,
        },
      }),
    }).catch((err) => ({ ok: false, status: 502, json: { message: String(err?.message || err) } }))

    if (!orderRes.ok || !orderRes.json?.id) {
      return json({ statusCode: 502, message: orderRes.json?.message || 'PayPal order creation failed' }, 502)
    }

    const nowIso = new Date().toISOString()
    await env.DB.prepare(
      `INSERT OR REPLACE INTO paypal_orders (order_id, user_id, plan, amount, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'created', ?, ?)`,
    )
      .bind(orderRes.json.id, user.id, plan, price.amount, price.currency, nowIso, nowIso)
      .run()

    return json({
      id: orderRes.json.id,
      approveUrl: approvalLink(orderRes.json),
      amount: price.amount,
      currency: price.currency,
      plan,
    })
  }

  if (path === '/api/v1/billing/paypal/capture' && method === 'POST') {
    if (!paypalConfigured(env)) return json({ statusCode: 503, message: 'PayPal not configured yet' }, 503)
    const body = await request.json().catch(() => ({}))
    const orderId = String(body.orderId || '').trim().slice(0, 64)
    if (!orderId) return json({ statusCode: 400, message: 'orderId is required' }, 400)

    // Only the owner may capture their own order.
    const known = await env.DB.prepare('SELECT * FROM paypal_orders WHERE order_id = ?').bind(orderId).first()
    if (!known || known.user_id !== user.id) return json({ statusCode: 404, message: 'Order not found' }, 404)
    if (known.status === 'completed') return json({ ok: true, plan: known.plan, alreadyCaptured: true })

    const captured = await paypalFetch(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      body: '{}',
    }).catch((err) => ({ ok: false, status: 502, json: { message: String(err?.message || err) } }))

    if (!captured.ok) {
      const issue = captured.json?.details?.[0]?.issue
      // ORDER_ALREADY_CAPTURED is safe to treat as success after re-check.
      if (issue !== 'ORDER_ALREADY_CAPTURED') {
        return json({ statusCode: 502, message: captured.json?.message || 'PayPal capture failed' }, 502)
      }
    }

    const detail = await paypalFetch(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}`)
    const price = priceFor(env, known.plan)
    const amount = capturedAmount(detail.json)
    if (!price || !detail.ok) return json({ statusCode: 502, message: 'Could not verify order' }, 502)
    if (amount.status !== 'COMPLETED' || amount.value !== price.amount || amount.currency !== price.currency) {
      return json({ statusCode: 409, message: 'Captured amount did not match the plan price' }, 409)
    }

    const periodEnd = await grantPlan(env, user.id, known.plan, periodDays(env), orderId)
    await env.DB.prepare('UPDATE paypal_orders SET status = ?, updated_at = ? WHERE order_id = ?')
      .bind('completed', new Date().toISOString(), orderId)
      .run()

    return json({ ok: true, plan: known.plan, currentPeriodEnd: periodEnd })
  }

  return null
}
