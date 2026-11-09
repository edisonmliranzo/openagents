// Per-user quotas, client error intake and server-side error reporting (Sentry, optional).
import { getUserPlanLimits } from './worker-billing-stripe.mjs'

export const LIMITS = {
  storageBytes: 500 * 1024 * 1024, // 500 MB per user in R2
  avatarGenPerDay: 20,
  ttsPerMinute: 30,
  maxAvatars: 5,
  clientErrorsPerHour: 30,
}

let limitsSchemaReady = false
export async function ensureLimitsSchema(env) {
  if (limitsSchemaReady || !env.DB) return
  const stmts = [
    `CREATE TABLE IF NOT EXISTS storage_objects (
       key TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       bytes INTEGER NOT NULL DEFAULT 0,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_storage_objects_user ON storage_objects(userId)`,
    `CREATE TABLE IF NOT EXISTS quota_counters (
       bucket TEXT PRIMARY KEY,
       count INTEGER NOT NULL DEFAULT 0,
       windowStart INTEGER NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS client_errors (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       userId TEXT,
       ip TEXT,
       message TEXT NOT NULL,
       stack TEXT,
       url TEXT,
       userAgent TEXT,
       createdAt TEXT NOT NULL
     )`,
  ]
  for (const sql of stmts) await env.DB.prepare(sql).run()
  limitsSchemaReady = true
}

export function quotaResponse(h, origin, message) {
  return h.jsonResponse({ statusCode: 429, message }, 429, origin)
}

/** Fixed-window counter. Returns true when the limit is exceeded (and does not count the request). */
export async function overQuota(env, bucket, limit, windowMs) {
  await ensureLimitsSchema(env)
  const now = Date.now()
  const row = await env.DB.prepare('SELECT count, windowStart FROM quota_counters WHERE bucket = ?').bind(bucket).first()
  if (row && now - Number(row.windowStart) < windowMs) {
    if (Number(row.count) >= limit) return true
    await env.DB.prepare('UPDATE quota_counters SET count = count + 1 WHERE bucket = ?').bind(bucket).run()
    return false
  }
  await env.DB.prepare('INSERT OR REPLACE INTO quota_counters (bucket, count, windowStart) VALUES (?, 1, ?)').bind(bucket, now).run()
  return false
}

export async function checkTtsQuota(env, userId) {
  return (await overQuota(env, `tts:${userId}`, LIMITS.ttsPerMinute, 60 * 1000))
    ? `You've hit the voice limit (${LIMITS.ttsPerMinute} requests per minute). Give it a moment and try again.`
    : null
}

export async function checkAvatarGenQuota(env, userId) {
  return (await overQuota(env, `avatar-gen:${userId}`, LIMITS.avatarGenPerDay, 24 * 60 * 60 * 1000))
    ? `You've reached today's limit of ${LIMITS.avatarGenPerDay} avatar video generations. It resets within 24 hours.`
    : null
}

async function planLimits(env, userId) {
  try {
    const p = await getUserPlanLimits(env, userId)
    return {
      storageBytes: Number(p?.limits?.storageBytes) || LIMITS.storageBytes,
      avatars: Number(p?.limits?.avatars) || LIMITS.maxAvatars,
    }
  } catch {
    return { storageBytes: LIMITS.storageBytes, avatars: LIMITS.maxAvatars }
  }
}

export async function checkAvatarCount(env, userId) {
  const max = (await planLimits(env, userId)).avatars
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM avatars WHERE userId = ?').bind(userId).first()
  return Number(row?.n || 0) >= max
    ? `You can have up to ${max} avatars on your plan. Delete one or upgrade to create another.`
    : null
}

// ── R2 storage accounting ──
export async function getStorageUsage(env, userId) {
  await ensureLimitsSchema(env)
  const row = await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS total FROM storage_objects WHERE userId = ?').bind(userId).first()
  return Number(row?.total || 0)
}

/** Returns a friendly message if adding `extraBytes` would exceed the cap. */
export async function checkStorageQuota(env, userId, extraBytes = 0) {
  const used = await getStorageUsage(env, userId)
  const cap = (await planLimits(env, userId)).storageBytes
  if (used + Math.max(0, extraBytes) > cap) {
    const mb = (n) => Math.round(n / (1024 * 1024))
    return `Storage full: you're using ${mb(used)} MB of your ${mb(cap)} MB. Delete an avatar or clip, or upgrade your plan.`
  }
  return null
}

export async function trackObject(env, userId, key, bytes) {
  await ensureLimitsSchema(env)
  await env.DB.prepare('INSERT OR REPLACE INTO storage_objects (key, userId, bytes, createdAt) VALUES (?, ?, ?, ?)')
    .bind(key, userId, Math.max(0, Number(bytes) || 0), new Date().toISOString())
    .run()
}

export async function untrackObject(env, key) {
  await ensureLimitsSchema(env)
  await env.DB.prepare('DELETE FROM storage_objects WHERE key = ?').bind(key).run()
}

export async function untrackPrefix(env, userId, prefix) {
  await ensureLimitsSchema(env)
  await env.DB.prepare('DELETE FROM storage_objects WHERE userId = ? AND key LIKE ?').bind(userId, `${prefix}%`).run()
}

// ── Client error intake: POST /api/v1/client-errors ──
export async function handleClientError(request, env, user, h, origin) {
  await ensureLimitsSchema(env)
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  if (await overQuota(env, `client-err:${user?.id || ip}`, LIMITS.clientErrorsPerHour, 60 * 60 * 1000)) {
    return h.jsonResponse({ ok: true, dropped: true }, 202, origin)
  }
  const body = await request.json().catch(() => ({}))
  const message = String(body.message || '').slice(0, 1000)
  if (!message) return h.jsonResponse({ statusCode: 400, message: 'message is required' }, 400, origin)
  await env.DB.prepare(
    'INSERT INTO client_errors (userId, ip, message, stack, url, userAgent, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      user?.id || null,
      ip,
      message,
      body.stack ? String(body.stack).slice(0, 4000) : null,
      body.url ? String(body.url).slice(0, 500) : null,
      String(request.headers.get('user-agent') || '').slice(0, 300),
      new Date().toISOString(),
    )
    .run()
  return h.jsonResponse({ ok: true }, 202, origin)
}

// ── Server error reporting (Sentry envelope API, no SDK) ──
export async function reportError(env, err, context = {}) {
  console.error('[worker error]', context.path || '', err?.stack || err)
  const dsn = env?.SENTRY_DSN
  if (!dsn) return
  try {
    const u = new URL(dsn)
    const publicKey = u.username
    const projectId = u.pathname.replace(/^\//, '').split('/').pop()
    const pathPrefix = u.pathname.replace(/\/[^/]*$/, '')
    const endpoint = `${u.protocol}//${u.host}${pathPrefix}/api/${projectId}/envelope/`
    const eventId = crypto.randomUUID().replace(/-/g, '')
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      server_name: 'cloudflare-worker',
      environment: env.SENTRY_ENVIRONMENT || 'production',
      tags: { path: context.path || '', method: context.method || '' },
      exception: {
        values: [
          {
            type: err?.name || 'Error',
            value: String(err?.message || err).slice(0, 2000),
            stacktrace: err?.stack ? { frames: [{ filename: 'worker', function: String(err.stack).slice(0, 1500) }] } : undefined,
          },
        ],
      },
    }
    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }) +
      '\n' +
      JSON.stringify({ type: 'event' }) +
      '\n' +
      JSON.stringify(event)
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=openagents-worker/1.0, sentry_key=${publicKey}`,
      },
      body: envelope,
    })
  } catch (e) {
    console.error('[sentry report failed]', e)
  }
}
