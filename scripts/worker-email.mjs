// Transactional email via Resend (optional) + email verification flow.

const APP_URL = 'https://openagents.us'

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** Sends an email. Returns true if delivered to Resend; logs (without content) and returns false otherwise. */
export async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY not set; skipped "${subject}"`)
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || 'OpenAgents <noreply@openagents.us>', to: [to], subject, html }),
  }).catch((e) => {
    console.error('[email] send failed', e)
    return null
  })
  if (res && !res.ok) console.error('[email] Resend HTTP', res.status)
  return Boolean(res && res.ok)
}

function layout(title, bodyHtml) {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0f172a">
<h2 style="margin:0 0 16px">${escapeHtml(title)}</h2>${bodyHtml}
<p style="color:#64748b;font-size:12px;margin-top:32px">OpenAgents · ${APP_URL}</p></div>`
}

export function passwordResetEmail(link) {
  return layout(
    'Reset your password',
    `<p>Someone requested a password reset for your OpenAgents account.</p>
<p><a href="${escapeHtml(link)}" style="background:#e11d48;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset your password</a></p>
<p>This link is valid for 30 minutes. If this wasn't you, ignore this email.</p>`,
  )
}

let schemaReady = false
async function ensureSchema(env) {
  if (schemaReady) return
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS email_verifications (
       tokenHash TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       expiresAt INTEGER NOT NULL
     )`,
  ).run()
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS email_verified (
       userId TEXT PRIMARY KEY,
       verifiedAt TEXT NOT NULL
     )`,
  ).run()
  schemaReady = true
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken() {
  const raw = new Uint8Array(32)
  crypto.getRandomValues(raw)
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function isEmailVerified(env, userId) {
  await ensureSchema(env)
  const row = await env.DB.prepare('SELECT verifiedAt FROM email_verified WHERE userId = ?').bind(userId).first()
  return row?.verifiedAt || null
}

/** Creates a fresh token and emails it. Never returns the token. */
export async function sendVerificationEmail(env, user) {
  await ensureSchema(env)
  const token = randomToken()
  await env.DB.prepare('DELETE FROM email_verifications WHERE userId = ?').bind(user.id).run()
  await env.DB.prepare('INSERT INTO email_verifications (tokenHash, userId, expiresAt) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), user.id, Date.now() + 48 * 60 * 60 * 1000)
    .run()
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`
  return sendEmail(
    env,
    user.email,
    'Verify your OpenAgents email',
    layout(
      'Confirm your email',
      `<p>Welcome to OpenAgents! Please confirm this is your email address.</p>
<p><a href="${escapeHtml(link)}" style="background:#e11d48;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify email</a></p>
<p>This link is valid for 48 hours.</p>`,
    ),
  )
}

/**
 * Handles verification routes. Returns Response or null.
 * GET /api/v1/auth/verify-email?token=  (public)
 * POST /api/v1/auth/resend-verification (auth)
 * GET /api/v1/auth/verification-status (auth)
 */
export async function handleEmailRoutes({ request, env, url, path, method, origin, user, h }) {
  const json = (d, s = 200) => h.jsonResponse(d, s, origin)
  if (path === '/api/v1/auth/verify-email' && (method === 'GET' || method === 'POST')) {
    await ensureSchema(env)
    let token = url.searchParams.get('token') || ''
    if (!token && method === 'POST') token = String((await request.json().catch(() => ({}))).token || '')
    if (!token || token.length > 200) return json({ statusCode: 400, message: 'Invalid verification link.' }, 400)
    const tokenHash = await sha256Hex(token)
    const row = await env.DB.prepare('SELECT userId, expiresAt FROM email_verifications WHERE tokenHash = ?').bind(tokenHash).first()
    if (!row || Number(row.expiresAt) < Date.now()) {
      return json({ statusCode: 400, message: 'This verification link is invalid or has expired. Request a new one from your dashboard.' }, 400)
    }
    await env.DB.prepare('INSERT OR REPLACE INTO email_verified (userId, verifiedAt) VALUES (?, ?)').bind(row.userId, new Date().toISOString()).run()
    await env.DB.prepare('DELETE FROM email_verifications WHERE userId = ?').bind(row.userId).run()
    return json({ ok: true, verified: true })
  }
  if (!user) return null
  if (path === '/api/v1/auth/verification-status' && method === 'GET') {
    const verifiedAt = await isEmailVerified(env, user.id)
    return json({ verified: Boolean(verifiedAt), verifiedAt, emailConfigured: Boolean(env.RESEND_API_KEY) })
  }
  if (path === '/api/v1/auth/resend-verification' && method === 'POST') {
    if (await isEmailVerified(env, user.id)) return json({ ok: true, verified: true })
    if (await h.hitRateLimit(env, `verify-resend:${user.id}`, 3, 60 * 60 * 1000)) {
      return json({ statusCode: 429, message: 'Too many verification emails. Please try again in an hour.' }, 429)
    }
    await sendVerificationEmail(env, user)
    return json({ ok: true, message: 'If email delivery is configured, a verification link is on its way.' })
  }
  return null
}
