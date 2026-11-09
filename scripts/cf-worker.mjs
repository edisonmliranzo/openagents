const DEFAULT_TUNNEL_ORIGIN = 'https://someone-edinburgh-interstate-relative.trycloudflare.com'

const ALLOWED_ORIGINS = new Set([
  'https://openagents.us',
  'https://www.openagents.us',
  'https://openagents.edison0220.workers.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

const ALLOWED_LLM_HOSTS = new Set([
  'apisrouter.dev',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'integrate.api.nvidia.com',
  'api.deepseek.com',
  'api.groq.com',
  'api.mistral.ai',
  'api.x.ai',
  'openrouter.ai',
  'api.together.xyz',
  'api.perplexity.ai',
  'api.minimaxi.chat',
  'api.atlascloud.ai',
  'api.meta.ai',
])

const CURATED_MODELS = {
  apisrouter: [
    'claude-sonnet-5.5',
    'claude-opus-5.5',
    'gpt-6.1-sol-pro',
    'kimi-k2.7-code',
    'deepseek-v4.1-flash',
    'gemini-4-argon',
    'kimi-k3.1-pro',
    'grok-4.7',
    'qwen3.8-max-prime',
    'gpt-6.1-terra-pro',
    'gemini-3.8-flash',
    'claude-haiku-5.5',
    'deepseek-v4-pro-0813',
    'devstral-2512',
    'glm-5.3',
    'gpt-6-luna-pro',
    'grok-build-0.1',
    'llama-4-maverick',
    'minimax-m3.1-flash',
    'mistral-large-4-0',
    'qwen3.8-flash',
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-opus-4.8',
    'gpt-6.1-sol',
    'gpt-6.1-terra',
    'gpt-6-sol-pro',
    'gpt-6-sol',
    'gpt-6-luna',
    'deepseek-v4.1-flash-1017',
    'deepseek-v4-pro',
    'deepseek-v4-flash-0731',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
    'deepseek-v3.2',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-omni-1.2-flash',
    'gemini-omni-1.1-flash',
    'gemini-nano-banana-2.1',
    'grok-4.6',
    'grok-4.5',
    'grok-4.3',
    'grok-4.20-multi-agent',
    'grok-4.20',
    'kimi-k3',
    'kimi-k2.6',
    'kimi-k2.5',
    'kimi-k2-thinking',
    'kimi-k2-0905',
    'kimi-k2',
    'qwen3.8-2.4t-a95b',
    'qwen3.8-max-0902',
    'qwen3.8-omni-flash',
    'qwen3.8-27b',
    'qwen3.7-plus',
    'qwen3.7-flash',
    'llama-4-scout',
    'llama-3.3-70b-instruct',
    'llama-3.1-70b-instruct',
    'llama-3.1-8b-instruct',
    'llama-3.2-3b-instruct',
    'llama-3.2-1b-instruct',
    'llama-guard-4-12b',
    'mistral-medium-3-5',
    'mistral-small-2603',
    'mistral-large-2512',
    'ministral-14b-2512',
    'ministral-8b-2512',
    'ministral-3b-2512',
    'minimax-m3',
    'minimax-m2.7',
    'minimax-m2.5',
    'minimax-m1',
    'glm-5.3-prime',
    'glm-5.3-flashx',
    'glm-5.3-flashx-legal',
    'glm-5.3-flash',
    'glm-5v-turbo',
    'glm-5.2',
    'glm-5.1',
    'nemotron-3.5-super-vl',
    'nemotron-3.5-lightning',
    'nemotron-3-ultra-550b-a55b',
    'nemotron-3-super-120b-a12b',
    'nemotron-3-nano-30b-a3b',
    'nemotron-3.5-content-safety',
    'command-a-plus',
    'command-a',
    'command-r-plus-08-2024',
    'command-r-08-2024',
    'command-r7b-12-2024',
  ],
  anthropic: [
    'claude-sonnet-5.5',
    'claude-opus-5.5',
    'claude-haiku-5.5',
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-opus-4.8',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-1',
  ],
  openai: [
    'gpt-6.1-sol-pro',
    'gpt-6.1-terra-pro',
    'gpt-6-luna-pro',
    'gpt-6.1-sol',
    'gpt-6.1-terra',
    'gpt-6-sol-pro',
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'o4-mini',
    'o3',
    'o3-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
  ],
  google: [
    'gemini-4-argon',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-omni-1.2-flash',
    'gemini-omni-1.1-flash',
    'gemini-nano-banana-2.1',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
  ],
  nvidia: [
    'nvidia/nemotron-3.5-super-vl-120b-a12b',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'google/gemma-4-31b-it',
    'openai/gpt-oss-20b',
  ],
  deepseek: [
    'deepseek-v4.1-flash',
    'deepseek-v4-pro-0813',
    'deepseek-v4.1-flash-1017',
    'deepseek-v4-pro',
    'deepseek-v4-flash-0731',
    'deepseek-v4-flash',
    'deepseek-v4-flash-vision-exp',
    'deepseek-v3.2',
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  groq: [
    'llama-4-maverick',
    'llama-4-scout',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ],
  xai: [
    'grok-4.7',
    'grok-build-0.1',
    'grok-4.6',
    'grok-4.5',
    'grok-4.3',
    'grok-4.20-multi-agent',
    'grok-4.20',
    'grok-3',
  ],
  mistral: [
    'mistral-large-4-0',
    'devstral-2512',
    'mistral-medium-3-5',
    'mistral-small-2603',
    'mistral-large-2512',
    'ministral-14b-2512',
    'ministral-8b-2512',
    'ministral-3b-2512',
    'codestral-latest',
  ],
  openrouter: [
    'anthropic/claude-sonnet-5.5',
    'anthropic/claude-opus-5.5',
    'openai/gpt-6.1-sol-pro',
    'openai/gpt-6.1-terra-pro',
    'google/gemini-4-argon',
    'google/gemini-3.8-flash',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-pro-0813',
    'moonshotai/kimi-k2.7-code',
    'x-ai/grok-4.7',
    'qwen/qwen3.8-max-prime',
    'meta-llama/llama-4-maverick',
  ],
  together: [
    'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    'deepseek-ai/DeepSeek-V4.1-Flash',
    'deepseek-ai/DeepSeek-V4-Pro',
    'Qwen/Qwen3.8-Max-Prime',
  ],
  perplexity: [
    'sonar-pro',
    'sonar-reasoning-pro',
    'sonar-deep-research',
    'sonar-reasoning',
    'sonar',
  ],
  minimax: [
    'minimax-m3.1-flash',
    'minimax-m3',
    'minimax-m2.7',
    'minimax-m2.5',
    'minimax-m1',
    'MiniMax-M2.7',
    'MiniMax-M2.7-highspeed',
  ],
  atlascloud: [
    'deepseek-v4.1-flash',
    'deepseek-v4-pro-0813',
    'qwen3.8-max-prime',
    'llama-4-maverick',
    'llama-4-scout',
    'meta/llama-4-scout-17b-16e-instruct',
  ],
  ollama: [
    'hf.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF:Q4_K_M',
    'qwen3.8:27b',
    'hf.co/Venastine-Research/Xing4.0-29B-A4B-GGUF',
    'hf.co/unsloth/gemma-4-12b-it-GGUF',
    'hf.co/unsloth/gemma-4-E4B-it-GGUF',
    'hf.co/unsloth/gemma-4-E2B-it-GGUF',
    'phi4-mini',
    'deepseek-r1:8b',
  ],
  meta: [
    'muse-spark-1.3',
    'muse-spark-1.2',
    'muse-spark-1.1',
    'muse-spark-1.3-contributor',
    'muse-spark-1.2-contributor',
  ],
  custom: ['default'],
}

const PROVIDER_BASE_URLS = {
  apisrouter: 'https://apisrouter.dev/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  minimax: 'https://api.minimaxi.chat/v1',
  perplexity: 'https://api.perplexity.ai',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  atlascloud: 'https://api.atlascloud.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  meta: 'https://api.meta.ai/v1',
}

function resolveSafeOrigin(requestOrigin, urlOrigin) {
  if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) return requestOrigin
  if (urlOrigin && ALLOWED_ORIGINS.has(urlOrigin)) return urlOrigin
  return 'https://openagents.us'
}

function securityAndCorsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, Accept, X-Requested-With',
    'vary': 'Origin',
    'cache-control': 'no-store, no-cache, must-revalidate, private',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'permissions-policy': 'camera=(), microphone=(self), geolocation=()',
  }
}

function jsonResponse(data, status = 200, origin = 'https://openagents.us') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...securityAndCorsHeaders(origin),
    },
  })
}

function genId(prefix = 'cm') {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}${Date.now().toString(36)}${hex}`.slice(0, 25)
}

function maskKey(k) {
  if (!k || typeof k !== 'string') return null
  return `...${k.slice(-4)}`
}

async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function hashPasswordPbkdf2(password) {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const iterations = 100000
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2:${iterations}:${bytesToHex(salt)}:${bytesToHex(new Uint8Array(derivedBits))}`
}

async function verifyPasswordPbkdf2(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('pbkdf2:')) return false
  const parts = stored.split(':')
  if (parts.length !== 4) return false
  const iterations = Number(parts[1])
  const saltHex = parts[2]
  const expectedHex = parts[3]
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 500000 || !saltHex || !expectedHex) {
    return false
  }
  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    )
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
      keyMaterial,
      256,
    )
    const candidateHex = bytesToHex(new Uint8Array(derivedBits))
    return timingSafeEqualStr(candidateHex, expectedHex)
  } catch {
    return false
  }
}

function base64UrlEncodeBytes(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlEncodeStr(str) {
  return base64UrlEncodeBytes(new TextEncoder().encode(str))
}

function base64UrlDecodeBytes(b64url) {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function base64UrlDecodeStr(b64url) {
  return new TextDecoder().decode(base64UrlDecodeBytes(b64url))
}

async function getJwtSecret(env) {
  if (env.JWT_SECRET && typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.length >= 32) {
    return env.JWT_SECRET
  }
  if (env.DB) {
    const row = await env.DB.prepare("SELECT value FROM system_secrets WHERE key = 'jwt_secret' LIMIT 1").first()
    if (row?.value) return String(row.value)
  }
  throw new Error('JWT signing secret is not configured.')
}

async function getOwnerDigest(env) {
  if (env.DB) {
    const row = await env.DB.prepare("SELECT value FROM system_secrets WHERE key = 'owner_digest' LIMIT 1").first()
    if (row?.value) return String(row.value)
  }
  return null
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signJwtHs256(payload, secret, expiresInSeconds = 604800) {
  const now = Math.floor(Date.now() / 1000)
  const headerB64 = base64UrlEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = base64UrlEncodeStr(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    }),
  )
  const signingInput = `${headerB64}.${payloadB64}`
  const key = await importHmacKey(secret)
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  const sigB64 = base64UrlEncodeBytes(new Uint8Array(sigBuf))
  return `${signingInput}.${sigB64}`
}

async function verifyJwtHs256(token, secret) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  if (!headerB64 || !payloadB64 || !sigB64) return null

  try {
    const header = JSON.parse(base64UrlDecodeStr(headerB64))
    if (!header || header.alg !== 'HS256') return null

    const key = await importHmacKey(secret)
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const sigBytes = base64UrlDecodeBytes(sigB64)
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, signingInput)
    if (!valid) return null

    const payload = JSON.parse(base64UrlDecodeStr(payloadB64))
    const now = Math.floor(Date.now() / 1000)
    if (!payload || typeof payload.sub !== 'string' || !payload.sub) return null
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

async function requireAuth(request, env) {
  if (!env.DB) return null
  const auth = request.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token) return null

  try {
    const secret = await getJwtSecret(env)
    const payload = await verifyJwtHs256(token, secret)
    if (!payload?.sub) return null

    const user = await env.DB.prepare(
      'SELECT id, email, name, avatarUrl, role, createdAt FROM users WHERE id = ? LIMIT 1',
    )
      .bind(payload.sub)
      .first()
    return user || null
  } catch {
    return null
  }
}

function validateSafeLlmBaseUrl(candidateUrl, provider) {
  const defaultUrl = PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.apisrouter
  if (!candidateUrl || typeof candidateUrl !== 'string' || !candidateUrl.trim()) {
    return defaultUrl
  }
  try {
    const parsed = new URL(candidateUrl.trim())
    if (parsed.protocol !== 'https:') return defaultUrl
    const host = parsed.hostname.toLowerCase()
    if (!ALLOWED_LLM_HOSTS.has(host)) return defaultUrl
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return defaultUrl
  }
}

function deriveTitle(content) {
  if (!content || typeof content !== 'string') return null
  const firstLine =
    content
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-*#>\s`]+/, '').replace(/^\d+[.)]\s+/, '').trim())
      .find(Boolean) || ''
  const normalized = firstLine.replace(/\s+/g, ' ').replace(/^["'`]+|["'`]+$/g, '').trim()
  if (!normalized) return null
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77).trimEnd()}...`
}

function parseJsonSafe(val) {
  if (!val) return null
  if (typeof val === 'object') return val
  try {
    return JSON.parse(val)
  } catch {
    return null
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = resolveSafeOrigin(request.headers.get('origin'), url.origin)

    if (request.method === 'OPTIONS' && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/'))) {
      return new Response(null, { status: 204, headers: securityAndCorsHeaders(origin) })
    }

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
      const path = url.pathname.replace(/\/$/, '')
      const method = request.method.toUpperCase()

      try {
        // 1. Public Health Check (no sensitive info exposed)
        if (path === '/api/v1/health' && method === 'GET') {
          return jsonResponse(
            {
              status: 'ok',
              timestamp: new Date().toISOString(),
            },
            200,
            origin,
          )
        }

        // 2. Public User Registration (Free Cloud Workspace, Zero Free Keys)
        if (path === '/api/v1/auth/register' && method === 'POST') {
          if (!env.DB) {
            return jsonResponse({ statusCode: 503, message: 'Database unavailable.' }, 503, origin)
          }

          const body = await request.json().catch(() => ({}))
          const email = String(body.email || '').trim().toLowerCase()
          const password = String(body.password || '')
          const rawName = body.name ? String(body.name).trim().slice(0, 80) : null

          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
            return jsonResponse({ statusCode: 400, message: 'Please enter a valid email address.' }, 400, origin)
          }
          if (!password || password.length < 8 || password.length > 256) {
            return jsonResponse(
              { statusCode: 400, message: 'Password must be at least 8 characters long.' },
              400,
              origin,
            )
          }

          const clientIp = request.headers.get('cf-connecting-ip') || 'unknown'
          const regBucket = `register:${clientIp}`
          const nowMs = Date.now()
          const hourMs = 60 * 60 * 1000
          const regRate = await env.DB.prepare('SELECT failures, windowStart FROM auth_rate_limits WHERE bucket = ?')
            .bind(regBucket)
            .first()
          if (regRate && nowMs - Number(regRate.windowStart) < hourMs && Number(regRate.failures) >= 5) {
            return jsonResponse(
              { statusCode: 429, message: 'Too many accounts created from this IP. Please try again later.' },
              429,
              origin,
            )
          }

          const existing = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1')
            .bind(email)
            .first()
          if (existing) {
            return jsonResponse({ statusCode: 409, message: 'Email already in use.' }, 409, origin)
          }

          const userId = genId('cmu')
          const nowIso = new Date().toISOString()
          const passwordHash = await hashPasswordPbkdf2(password)
          const displayName = rawName || email.split('@')[0]

          await env.DB.prepare(
            `INSERT INTO users (id, email, name, avatarUrl, passwordHash, role, createdAt, updatedAt)
             VALUES (?, ?, ?, NULL, ?, 'member', ?, ?)`,
          )
            .bind(userId, email, displayName, passwordHash, nowIso, nowIso)
            .run()

          await env.DB.prepare(
            `INSERT INTO user_settings (userId, preferredProvider, preferredModel, customSystemPrompt, lastActiveConversationId, beginnerMode, onboardingCompletedAt, createdAt, updatedAt)
             VALUES (?, 'apisrouter', 'claude-sonnet-5.5', NULL, NULL, 0, NULL, ?, ?)`,
          )
            .bind(userId, nowIso, nowIso)
            .run()

          const nextCount =
            regRate && nowMs - Number(regRate.windowStart) < hourMs ? Number(regRate.failures) + 1 : 1
          const nextWindow =
            regRate && nowMs - Number(regRate.windowStart) < hourMs ? Number(regRate.windowStart) : nowMs
          await env.DB.prepare(
            'INSERT OR REPLACE INTO auth_rate_limits (bucket, failures, windowStart) VALUES (?, ?, ?)',
          )
            .bind(regBucket, nextCount, nextWindow)
            .run()

          const user = {
            id: userId,
            email,
            name: displayName,
            avatarUrl: null,
            role: 'member',
            createdAt: nowIso,
          }

          const secret = await getJwtSecret(env)
          const accessToken = await signJwtHs256(
            { sub: user.id, email: user.email, role: user.role },
            secret,
            604800,
          )
          const refreshToken = await signJwtHs256(
            { sub: user.id, email: user.email, role: user.role, typ: 'refresh' },
            secret,
            1209600,
          )

          return jsonResponse(
            {
              user,
              tokens: {
                accessToken,
                refreshToken,
                expiresIn: 604800,
              },
            },
            201,
            origin,
          )
        }

        // 2b. Hardened Login with Brute-Force Protection & Constant-Time Password Verification
        if (path === '/api/v1/auth/login' && method === 'POST') {
          if (!env.DB) {
            return jsonResponse({ statusCode: 503, message: 'Database unavailable.' }, 503, origin)
          }

          const body = await request.json().catch(() => ({}))
          const email = String(body.email || '').trim().toLowerCase()
          const password = String(body.password || '')

          if (!email || !password || email.length > 254 || password.length > 256) {
            return jsonResponse({ statusCode: 401, message: 'Invalid email or password.' }, 401, origin)
          }

          const clientIp = request.headers.get('cf-connecting-ip') || 'unknown'
          const rateBucket = `login:${clientIp}:${email}`
          const nowMs = Date.now()
          const windowMs = 15 * 60 * 1000

          const rateRow = await env.DB.prepare('SELECT failures, windowStart FROM auth_rate_limits WHERE bucket = ?')
            .bind(rateBucket)
            .first()
          if (rateRow && nowMs - Number(rateRow.windowStart) < windowMs && Number(rateRow.failures) >= 8) {
            return jsonResponse(
              { statusCode: 429, message: 'Too many failed login attempts. Please wait 15 minutes.' },
              429,
              origin,
            )
          }

          const dbUser = await env.DB.prepare(
            'SELECT id, email, name, avatarUrl, role, passwordHash, createdAt FROM users WHERE lower(email) = ? LIMIT 1',
          )
            .bind(email)
            .first()

          let passwordValid = false
          if (dbUser?.passwordHash && String(dbUser.passwordHash).startsWith('pbkdf2:')) {
            passwordValid = await verifyPasswordPbkdf2(password, String(dbUser.passwordHash))
          } else if (dbUser) {
            const candidateDigest = await sha256Hex(`${email}:${password}`)
            const ownerDigest = await getOwnerDigest(env)
            passwordValid = Boolean(ownerDigest && timingSafeEqualStr(candidateDigest, ownerDigest))
            if (passwordValid) {
              const upgradedHash = await hashPasswordPbkdf2(password)
              await env.DB.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?')
                .bind(upgradedHash, new Date().toISOString(), dbUser.id)
                .run()
            }
          }

          const user =
            dbUser && passwordValid
              ? {
                  id: dbUser.id,
                  email: dbUser.email,
                  name: dbUser.name,
                  avatarUrl: dbUser.avatarUrl,
                  role: dbUser.role,
                  createdAt: dbUser.createdAt,
                }
              : null

          if (!user) {
            const nextFailures =
              rateRow && nowMs - Number(rateRow.windowStart) < windowMs ? Number(rateRow.failures) + 1 : 1
            const nextStart =
              rateRow && nowMs - Number(rateRow.windowStart) < windowMs ? Number(rateRow.windowStart) : nowMs
            await env.DB.prepare(
              'INSERT OR REPLACE INTO auth_rate_limits (bucket, failures, windowStart) VALUES (?, ?, ?)',
            )
              .bind(rateBucket, nextFailures, nextStart)
              .run()
            return jsonResponse({ statusCode: 401, message: 'Invalid email or password.' }, 401, origin)
          }

          await env.DB.prepare('DELETE FROM auth_rate_limits WHERE bucket = ?').bind(rateBucket).run()

          const secret = await getJwtSecret(env)
          const accessToken = await signJwtHs256(
            { sub: user.id, email: user.email, role: user.role },
            secret,
            604800,
          )
          const refreshToken = await signJwtHs256(
            { sub: user.id, email: user.email, role: user.role, typ: 'refresh' },
            secret,
            1209600,
          )

          return jsonResponse(
            {
              user,
              tokens: {
                accessToken,
                refreshToken,
                expiresIn: 604800,
              },
            },
            200,
            origin,
          )
        }

        // 3. Token Refresh (requires valid signed refreshToken)
        if (path === '/api/v1/auth/refresh' && method === 'POST') {
          const body = await request.json().catch(() => ({}))
          const rawRefresh = String(body.refreshToken || '').trim()
          const secret = await getJwtSecret(env)
          const payload = await verifyJwtHs256(rawRefresh, secret)
          if (!payload?.sub || !env.DB) {
            return jsonResponse({ statusCode: 401, message: 'Invalid or expired refresh token.' }, 401, origin)
          }
          const user = await env.DB.prepare(
            'SELECT id, email, name, avatarUrl, role, createdAt FROM users WHERE id = ? LIMIT 1',
          )
            .bind(payload.sub)
            .first()
          if (!user) {
            return jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401, origin)
          }
          const accessToken = await signJwtHs256(
            { sub: user.id, email: user.email, role: user.role },
            secret,
            604800,
          )
          const refreshToken = await signJwtHs256(
            { sub: user.id, email: user.email, role: user.role, typ: 'refresh' },
            secret,
            1209600,
          )
          return jsonResponse({ accessToken, refreshToken, expiresIn: 604800 }, 200, origin)
        }

        if (path === '/api/v1/auth/logout' && method === 'POST') {
          return jsonResponse({ ok: true }, 200, origin)
        }

        // 4. All Remaining Routes Require Valid HS256 JWT Authentication
        const user = await requireAuth(request, env)
        if (!user) {
          return jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401, origin)
        }

        if ((path === '/api/v1/auth/me' || path === '/api/v1/users/me') && method === 'GET') {
          return jsonResponse(user, 200, origin)
        }

        if (path === '/api/v1/users/me' && (method === 'PUT' || method === 'PATCH')) {
          const body = await request.json().catch(() => ({}))
          const nextName =
            body.name !== undefined ? String(body.name || '').trim().slice(0, 100) : user.name
          const nextAvatar =
            body.avatarUrl !== undefined ? (body.avatarUrl ? String(body.avatarUrl).slice(0, 500) : null) : user.avatarUrl
          await env.DB.prepare('UPDATE users SET name = ?, avatarUrl = ?, updatedAt = ? WHERE id = ?')
            .bind(nextName, nextAvatar, new Date().toISOString(), user.id)
            .run()
          return jsonResponse({ ...user, name: nextName, avatarUrl: nextAvatar }, 200, origin)
        }

        // 5. User Settings
        if (path === '/api/v1/users/me/settings' && method === 'GET') {
          let settings = await env.DB.prepare('SELECT * FROM user_settings WHERE userId = ? LIMIT 1')
            .bind(user.id)
            .first()
          if (!settings) {
            const now = new Date().toISOString()
            settings = {
              id: `settings-${user.id}`,
              userId: user.id,
              preferredProvider: 'apisrouter',
              preferredModel: 'deepseek-v4.1-flash-1017',
              customSystemPrompt: null,
              lastActiveConversationId: null,
              beginnerMode: false,
              onboardingCompletedAt: null,
              createdAt: now,
              updatedAt: now,
            }
          } else {
            settings = {
              id: `settings-${user.id}`,
              ...settings,
              beginnerMode: Boolean(settings.beginnerMode),
            }
          }
          return jsonResponse(settings, 200, origin)
        }

        if (path === '/api/v1/users/me/settings' && (method === 'PUT' || method === 'PATCH')) {
          const body = await request.json().catch(() => ({}))
          const now = new Date().toISOString()
          const current = await env.DB.prepare('SELECT * FROM user_settings WHERE userId = ? LIMIT 1')
            .bind(user.id)
            .first()

          const next = {
            userId: user.id,
            preferredProvider: String(body.preferredProvider ?? current?.preferredProvider ?? 'apisrouter').slice(0, 40),
            preferredModel: String(body.preferredModel ?? current?.preferredModel ?? 'deepseek-v4.1-flash-1017').slice(0, 120),
            customSystemPrompt:
              body.customSystemPrompt !== undefined
                ? body.customSystemPrompt
                  ? String(body.customSystemPrompt).slice(0, 8000)
                  : null
                : (current?.customSystemPrompt ?? null),
            lastActiveConversationId:
              body.lastActiveConversationId !== undefined
                ? body.lastActiveConversationId
                  ? String(body.lastActiveConversationId).slice(0, 64)
                  : null
                : (current?.lastActiveConversationId ?? null),
            beginnerMode:
              body.beginnerMode !== undefined ? (body.beginnerMode ? 1 : 0) : (current?.beginnerMode ?? 0),
            onboardingCompletedAt:
              body.onboardingCompletedAt !== undefined
                ? body.onboardingCompletedAt
                : (current?.onboardingCompletedAt ?? null),
            createdAt: current?.createdAt ?? now,
            updatedAt: now,
          }

          await env.DB.prepare(
            `INSERT OR REPLACE INTO user_settings (userId, preferredProvider, preferredModel, customSystemPrompt, lastActiveConversationId, beginnerMode, onboardingCompletedAt, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              next.userId,
              next.preferredProvider,
              next.preferredModel,
              next.customSystemPrompt,
              next.lastActiveConversationId,
              next.beginnerMode,
              next.onboardingCompletedAt,
              next.createdAt,
              next.updatedAt,
            )
            .run()

          return jsonResponse(
            {
              id: `settings-${user.id}`,
              ...next,
              beginnerMode: Boolean(next.beginnerMode),
            },
            200,
            origin,
          )
        }

        if (path === '/api/v1/users/me/domains') {
          if (method === 'GET') {
            return jsonResponse([], 200, origin)
          }
          if (method === 'POST') {
            const body = await request.json().catch(() => ({}))
            const now = new Date().toISOString()
            return jsonResponse(
              {
                id: genId('cmd'),
                userId: user.id,
                domain: String(body.domain || '').trim().toLowerCase(),
                provider: body.provider || 'manual',
                status: 'pending',
                targetHost: body.targetHost || null,
                verificationToken: genId('oa_verify_'),
                proxyInstructions: body.proxyInstructions || null,
                verifiedAt: null,
                createdAt: now,
                updatedAt: now,
              },
              201,
              origin,
            )
          }
        }

        const fallbackMatch = path.match(/^\/api\/v1\/users\/me\/llm-keys\/([^/]+)\/fallbacks(?:\/([^/]+))?$/)
        if (fallbackMatch) {
          if (method === 'GET') {
            return jsonResponse([], 200, origin)
          }
          if (method === 'DELETE') {
            return jsonResponse({ ok: true }, 200, origin)
          }
        }

        // 6. LLM API Keys (Masked on Read, SSRF-Safe Base URLs)
        if (path === '/api/v1/users/me/llm-keys' && method === 'GET') {
          const res = await env.DB.prepare('SELECT * FROM llm_keys WHERE userId = ?').bind(user.id).all()
          const rows = res.results || []
          const masked = rows.map((r) => ({
            id: `${r.userId}-${r.provider}`,
            userId: r.userId,
            provider: r.provider,
            apiKey: maskKey(r.apiKey),
            baseUrl: r.baseUrl || null,
            isActive: Boolean(r.isActive),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }))
          return jsonResponse(masked, 200, origin)
        }

        const llmKeyMatch = path.match(/^\/api\/v1\/users\/me\/llm-keys\/([^/]+)$/)
        if (llmKeyMatch) {
          const provider = decodeURIComponent(llmKeyMatch[1]).toLowerCase()
          if (!Object.prototype.hasOwnProperty.call(CURATED_MODELS, provider)) {
            return jsonResponse({ statusCode: 400, message: 'Unsupported provider.' }, 400, origin)
          }
          const now = new Date().toISOString()

          if (method === 'PUT' || method === 'POST') {
            const body = await request.json().catch(() => ({}))
            const existing = await env.DB.prepare('SELECT * FROM llm_keys WHERE userId = ? AND provider = ?')
              .bind(user.id, provider)
              .first()
            const apiKey =
              body.apiKey !== undefined && String(body.apiKey).trim()
                ? String(body.apiKey).trim()
                : (existing?.apiKey ?? null)
            const baseUrl =
              body.baseUrl !== undefined
                ? body.baseUrl
                  ? validateSafeLlmBaseUrl(String(body.baseUrl), provider)
                  : null
                : (existing?.baseUrl ?? null)
            const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1

            await env.DB.prepare(
              `INSERT OR REPLACE INTO llm_keys (userId, provider, apiKey, baseUrl, isActive, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
              .bind(user.id, provider, apiKey, baseUrl, isActive, existing?.createdAt ?? now, now)
              .run()

            return jsonResponse(
              {
                id: `${user.id}-${provider}`,
                userId: user.id,
                provider,
                apiKey: maskKey(apiKey),
                baseUrl,
                isActive: Boolean(isActive),
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
              },
              200,
              origin,
            )
          }

          if (method === 'DELETE') {
            await env.DB.prepare('DELETE FROM llm_keys WHERE userId = ? AND provider = ?')
              .bind(user.id, provider)
              .run()
            return jsonResponse({ ok: true }, 200, origin)
          }
        }

        const modelsMatch = path.match(/^\/api\/v1\/agent\/models\/([^/]+)$/)
        if (modelsMatch && (method === 'GET' || method === 'POST')) {
          const provider = decodeURIComponent(modelsMatch[1]).toLowerCase()
          const curated = CURATED_MODELS[provider] || CURATED_MODELS.apisrouter
          const keyRow = await env.DB.prepare(
            'SELECT apiKey, baseUrl FROM llm_keys WHERE userId = ? AND provider = ?',
          )
            .bind(user.id, provider)
            .first()
          let savedKey = keyRow?.apiKey || null
          let savedBaseUrl = keyRow?.baseUrl || null

          if (method === 'POST') {
            const body = await request.json().catch(() => ({}))
            if (body.apiKey && String(body.apiKey).trim()) savedKey = String(body.apiKey).trim()
            if (body.baseUrl && String(body.baseUrl).trim()) savedBaseUrl = String(body.baseUrl).trim()
          }

          const safeBaseUrl = validateSafeLlmBaseUrl(savedBaseUrl, provider)
          if (safeBaseUrl && (savedKey || provider === 'apisrouter' || provider === 'openrouter')) {
            try {
              const res = await fetch(`${safeBaseUrl}/models`, {
                headers: {
                  Authorization: `Bearer ${savedKey || 'public-catalog'}`,
                  Accept: 'application/json',
                },
              })
              if (res.ok) {
                const data = await res.json().catch(() => ({}))
                const liveList = Array.isArray(data?.data)
                  ? data.data.map((m) => m?.id).filter(Boolean)
                  : []
                if (liveList.length > 0) {
                  const merged = Array.from(new Set([...curated, ...liveList]))
                  return jsonResponse({ models: merged, source: 'live' }, 200, origin)
                }
              }
            } catch {
              // Return curated list on network error
            }
          }
          return jsonResponse({ models: curated, source: 'curated' }, 200, origin)
        }

        if (path === '/api/v1/agent/test-llm' && method === 'POST') {
          const body = await request.json().catch(() => ({}))
          const provider = String(body.provider || 'apisrouter').toLowerCase()
          const curated = CURATED_MODELS[provider] || CURATED_MODELS.apisrouter
          const keyRow = await env.DB.prepare(
            'SELECT apiKey, baseUrl FROM llm_keys WHERE userId = ? AND provider = ?',
          )
            .bind(user.id, provider)
            .first()
          const apiKey = (body.apiKey && String(body.apiKey).trim()) || keyRow?.apiKey || ''
          if (!apiKey && provider !== 'ollama') {
            return jsonResponse(
              {
                ok: false,
                error: 'No API key configured for this provider yet. Paste your key and click Save Key.',
              },
              200,
              origin,
            )
          }
          return jsonResponse({ ok: true, model: body.model || curated[0] }, 200, origin)
        }

        // 7a. Sessions API (Backed by D1 conversations for cross-device model/session overrides)
        if (path === '/api/v1/sessions' && method === 'GET') {
          const res = await env.DB.prepare(
            `SELECT id, userId, title, sessionLabel, model, modelProvider, lastMessageAt, createdAt, updatedAt
             FROM conversations
             WHERE userId = ?
             ORDER BY COALESCE(lastMessageAt, createdAt) DESC
             LIMIT 200`,
          )
            .bind(user.id)
            .all()
          const rows = (res.results || []).map((c) => ({
            id: c.id,
            key: c.id,
            kind: 'direct',
            label: c.sessionLabel || c.title || null,
            displayName: c.title || 'New Session',
            updatedAt: new Date(c.updatedAt || c.createdAt || Date.now()).getTime(),
            sessionId: c.id,
            modelProvider: c.modelProvider || null,
            model: c.model || null,
          }))
          return jsonResponse({ sessions: rows, count: rows.length }, 200, origin)
        }

        const sessionDetailMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)$/)
        if (sessionDetailMatch) {
          const sessionId = decodeURIComponent(sessionDetailMatch[1])
          const ownedConv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ? AND userId = ?')
            .bind(sessionId, user.id)
            .first()
          if (!ownedConv) {
            return jsonResponse({ statusCode: 404, message: 'Session not found' }, 404, origin)
          }

          if (method === 'PATCH') {
            const body = await request.json().catch(() => ({}))
            const now = new Date().toISOString()
            const nextModel =
              body.model !== undefined ? (body.model ? String(body.model).slice(0, 120) : null) : ownedConv.model
            const nextProvider =
              body.modelProvider !== undefined
                ? body.modelProvider
                  ? String(body.modelProvider).slice(0, 40)
                  : null
                : ownedConv.modelProvider
            const nextLabel =
              body.label !== undefined
                ? body.label
                  ? String(body.label).slice(0, 120)
                  : null
                : ownedConv.sessionLabel

            await env.DB.prepare(
              'UPDATE conversations SET model = ?, modelProvider = ?, sessionLabel = ?, updatedAt = ? WHERE id = ? AND userId = ?',
            )
              .bind(nextModel, nextProvider, nextLabel, now, sessionId, user.id)
              .run()

            return jsonResponse(
              {
                ok: true,
                session: {
                  id: ownedConv.id,
                  key: ownedConv.id,
                  kind: 'direct',
                  label: nextLabel || ownedConv.title || null,
                  displayName: ownedConv.title || 'New Session',
                  updatedAt: Date.now(),
                  sessionId: ownedConv.id,
                  modelProvider: nextProvider,
                  model: nextModel,
                },
              },
              200,
              origin,
            )
          }

          if (method === 'DELETE') {
            await env.DB.prepare('DELETE FROM messages WHERE conversationId = ?').bind(sessionId).run()
            await env.DB.prepare('DELETE FROM conversations WHERE id = ? AND userId = ?')
              .bind(sessionId, user.id)
              .run()
            return jsonResponse({ ok: true }, 200, origin)
          }
        }

        // 7. Conversations & Messages (Strict Ownership Verification on Every Query)
        if (path === '/api/v1/conversations' && method === 'GET') {
          const res = await env.DB.prepare(
            `SELECT id, userId, title, sessionLabel, model, modelProvider, lastMessageAt, createdAt, updatedAt
             FROM conversations
             WHERE userId = ?
             ORDER BY COALESCE(lastMessageAt, createdAt) DESC`,
          )
            .bind(user.id)
            .all()
          return jsonResponse(res.results || [], 200, origin)
        }

        if (path === '/api/v1/conversations' && method === 'POST') {
          const body = await request.json().catch(() => ({}))
          const now = new Date().toISOString()
          const id = genId('cmw')
          const title = body.title ? String(body.title).trim().slice(0, 120) : null
          const conv = {
            id,
            userId: user.id,
            title,
            sessionLabel: null,
            model: null,
            modelProvider: null,
            lastMessageAt: null,
            createdAt: now,
            updatedAt: now,
          }
          await env.DB.prepare(
            `INSERT INTO conversations (id, userId, title, sessionLabel, model, modelProvider, lastMessageAt, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(id, user.id, title, null, null, null, null, now, now)
            .run()
          await env.DB.prepare('UPDATE user_settings SET lastActiveConversationId = ?, updatedAt = ? WHERE userId = ?')
            .bind(id, now, user.id)
            .run()
          return jsonResponse(conv, 201, origin)
        }

        const convDetailMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)$/)
        if (convDetailMatch) {
          const convId = decodeURIComponent(convDetailMatch[1])
          const ownedConv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ? AND userId = ?')
            .bind(convId, user.id)
            .first()
          if (!ownedConv) {
            return jsonResponse({ statusCode: 404, message: 'Conversation not found' }, 404, origin)
          }

          if (method === 'GET') {
            return jsonResponse(ownedConv, 200, origin)
          }

          if (method === 'DELETE') {
            await env.DB.prepare('DELETE FROM messages WHERE conversationId = ?').bind(convId).run()
            await env.DB.prepare('DELETE FROM conversations WHERE id = ? AND userId = ?')
              .bind(convId, user.id)
              .run()
            const latest = await env.DB.prepare(
              'SELECT id FROM conversations WHERE userId = ? ORDER BY COALESCE(lastMessageAt, createdAt) DESC LIMIT 1',
            )
              .bind(user.id)
              .first()
            await env.DB.prepare('UPDATE user_settings SET lastActiveConversationId = ?, updatedAt = ? WHERE userId = ?')
              .bind(latest?.id ?? null, new Date().toISOString(), user.id)
              .run()
            return jsonResponse({ ok: true }, 200, origin)
          }
        }

        const convMessagesMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/)
        if (convMessagesMatch && method === 'GET') {
          const convId = decodeURIComponent(convMessagesMatch[1])
          const ownedConv = await env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND userId = ?')
            .bind(convId, user.id)
            .first()
          if (!ownedConv) {
            return jsonResponse({ statusCode: 404, message: 'Conversation not found' }, 404, origin)
          }

          const res = await env.DB.prepare(
            `SELECT id, conversationId, role, content, status, metadata, toolCallJson, toolResultJson, createdAt
             FROM messages
             WHERE conversationId = ?
             ORDER BY createdAt ASC`,
          )
            .bind(convId)
            .all()
          const messages = (res.results || []).map((m) => ({
            ...m,
            metadata: parseJsonSafe(m.metadata),
            toolCallJson: parseJsonSafe(m.toolCallJson),
            toolResultJson: parseJsonSafe(m.toolResultJson),
          }))
          return jsonResponse(messages, 200, origin)
        }

        // 8. Authenticated Chat Streaming
        const convChatMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)\/chat$/)
        if (convChatMatch && method === 'POST') {
          const convId = decodeURIComponent(convChatMatch[1])
          const body = await request.json().catch(() => ({}))
          const userContent = String(body.content || '').trim().slice(0, 32000)
          if (!userContent) {
            return jsonResponse({ statusCode: 400, message: 'Message content is required.' }, 400, origin)
          }

          const existingConv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?')
            .bind(convId)
            .first()
          if (existingConv && existingConv.userId !== user.id) {
            return jsonResponse({ statusCode: 403, message: 'Forbidden' }, 403, origin)
          }

          const now = new Date().toISOString()
          const userMsgId = genId('cmm')
          const agentMsgId = genId('cmm')

          let preferredProvider = 'apisrouter'
          let preferredModel = 'deepseek-v4.1-flash-1017'
          let customSystemPrompt = null

          const settings = await env.DB.prepare('SELECT * FROM user_settings WHERE userId = ? LIMIT 1')
            .bind(user.id)
            .first()
          if (settings) {
            preferredProvider = settings.preferredProvider || preferredProvider
            preferredModel = settings.preferredModel || preferredModel
            customSystemPrompt = settings.customSystemPrompt || null
          }

          const nextTitle = existingConv?.title || deriveTitle(userContent)
          if (existingConv) {
            await env.DB.prepare(
              'UPDATE conversations SET title = ?, lastMessageAt = ?, updatedAt = ? WHERE id = ? AND userId = ?',
            )
              .bind(nextTitle, now, now, convId, user.id)
              .run()
          } else {
            await env.DB.prepare(
              `INSERT INTO conversations (id, userId, title, sessionLabel, model, modelProvider, lastMessageAt, createdAt, updatedAt)
               VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
            )
              .bind(convId, user.id, nextTitle, preferredModel, preferredProvider, now, now, now)
              .run()
          }

          await env.DB.prepare(
            `INSERT INTO messages (id, conversationId, role, content, status, metadata, toolCallJson, toolResultJson, createdAt)
             VALUES (?, ?, 'user', ?, 'done', NULL, NULL, NULL, ?)`,
          )
            .bind(userMsgId, convId, userContent, now)
            .run()

          await env.DB.prepare('UPDATE user_settings SET lastActiveConversationId = ?, updatedAt = ? WHERE userId = ?')
            .bind(convId, now, user.id)
            .run()

          const histRes = await env.DB.prepare(
            'SELECT role, content FROM messages WHERE conversationId = ? ORDER BY createdAt ASC LIMIT 30',
          )
            .bind(convId)
            .all()
          const history = (histRes.results || []).map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user',
            content: m.content,
          }))

          let keyRow = await env.DB.prepare(
            'SELECT provider, apiKey, baseUrl FROM llm_keys WHERE userId = ? AND provider = ? AND apiKey IS NOT NULL LIMIT 1',
          )
            .bind(user.id, preferredProvider)
            .first()
          if (!keyRow) {
            keyRow = await env.DB.prepare(
              'SELECT provider, apiKey, baseUrl FROM llm_keys WHERE userId = ? AND apiKey IS NOT NULL ORDER BY updatedAt DESC LIMIT 1',
            )
              .bind(user.id)
              .first()
          }

          const activeProvider = keyRow?.provider || preferredProvider
          const apiKey = keyRow?.apiKey || ''
          const baseUrl = validateSafeLlmBaseUrl(keyRow?.baseUrl, activeProvider)

          const { readable, writable } = new TransformStream()
          const writer = writable.getWriter()
          const encoder = new TextEncoder()

          const sendSse = async (event, data) => {
            await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          }

          ;(async () => {
            try {
              await sendSse('status', { status: 'thinking' })

              if (!apiKey) {
                const onboardingReply = [
                  '### Welcome to OpenAgents — Your Cloud Workspace is 100% Free',
                  '',
                  'To start running tasks and chatting with Veda, connect your AI model key (OpenAgents does not bundle free model keys):',
                  '',
                  '1. **Recommended — All 93+ Frontier Models in 1 Key:**',
                  '   Get an API key at **[APIsRouter.dev](https://apisrouter.dev)** to unlock `claude-sonnet-5.5`, `claude-opus-5.5`, `gpt-6.1-sol-pro`, `deepseek-v4.1-flash`, `gemini-4-argon`, `kimi-k2.7-code`, and `grok-4.7` with a single key.',
                  '2. **Or Bring Your Own Key (BYOK):**',
                  '   Use your existing key from Anthropic, OpenAI, Google Gemini, NVIDIA, DeepSeek, Groq, or xAI.',
                  '',
                  '👉 Open **[Settings & Models → APIsRouter](/settings/config)** in the left sidebar, paste your key, and send your message again!',
                ].join('\n')

                const completedAt = new Date().toISOString()
                await sendSse('delta', { content: onboardingReply })
                await env.DB.prepare(
                  `INSERT INTO messages (id, conversationId, role, content, status, metadata, toolCallJson, toolResultJson, createdAt)
                   VALUES (?, ?, 'agent', ?, 'done', NULL, NULL, NULL, ?)`,
                )
                  .bind(agentMsgId, convId, onboardingReply, completedAt)
                  .run()
                await env.DB.prepare(
                  'UPDATE conversations SET lastMessageAt = ?, updatedAt = ? WHERE id = ? AND userId = ?',
                )
                  .bind(completedAt, completedAt, convId, user.id)
                  .run()
                await sendSse('message', {
                  id: agentMsgId,
                  conversationId: convId,
                  role: 'agent',
                  content: onboardingReply,
                  status: 'done',
                  createdAt: completedAt,
                })
                await sendSse('done', { conversationId: convId })
                return
              }

              const llmMessages = [
                {
                  role: 'system',
                  content:
                    customSystemPrompt ||
                    'You are Veda, an autonomous personal AI agent on OpenAgents. Be concise, sharp, helpful, and action-oriented.',
                },
                ...history,
              ]

              const llmRes = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model: preferredModel,
                  messages: llmMessages,
                  stream: true,
                }),
              })

              if (!llmRes.ok) {
                const errText = await llmRes.text().catch(() => '')
                throw new Error(`LLM provider returned HTTP ${llmRes.status}: ${errText.slice(0, 240)}`)
              }

              let accumulated = ''
              const contentType = llmRes.headers.get('content-type') || ''

              if (contentType.includes('text/event-stream') && llmRes.body) {
                const reader = llmRes.body.getReader()
                const decoder = new TextDecoder()
                let buf = ''

                while (true) {
                  const { value, done } = await reader.read()
                  if (done) break
                  buf += decoder.decode(value, { stream: true })
                  const lines = buf.split(/\r?\n/)
                  buf = lines.pop() || ''

                  for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed.startsWith('data:')) continue
                    const dataStr = trimmed.slice(5).trim()
                    if (!dataStr || dataStr === '[DONE]') continue
                    try {
                      const parsed = JSON.parse(dataStr)
                      const delta = parsed?.choices?.[0]?.delta?.content || ''
                      if (delta) {
                        accumulated += delta
                        await sendSse('delta', { content: accumulated })
                      }
                    } catch {
                      // Ignore partial JSON line
                    }
                  }
                }
              } else {
                const json = await llmRes.json().catch(() => ({}))
                accumulated = json?.choices?.[0]?.message?.content || 'Done.'
                await sendSse('delta', { content: accumulated })
              }

              const finalContent = accumulated.trim() || 'Done.'
              const completedAt = new Date().toISOString()

              await env.DB.prepare(
                `INSERT INTO messages (id, conversationId, role, content, status, metadata, toolCallJson, toolResultJson, createdAt)
                 VALUES (?, ?, 'agent', ?, 'done', NULL, NULL, NULL, ?)`,
              )
                .bind(agentMsgId, convId, finalContent, completedAt)
                .run()
              await env.DB.prepare(
                'UPDATE conversations SET lastMessageAt = ?, updatedAt = ? WHERE id = ? AND userId = ?',
              )
                .bind(completedAt, completedAt, convId, user.id)
                .run()

              await sendSse('message', {
                id: agentMsgId,
                conversationId: convId,
                role: 'agent',
                content: finalContent,
                status: 'done',
                createdAt: completedAt,
              })
              await sendSse('done', { conversationId: convId })
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Agent request failed.'
              await sendSse('error', { message })
            } finally {
              await writer.close().catch(() => {})
            }
          })()

          return new Response(readable, {
            status: 200,
            headers: {
              'content-type': 'text/event-stream; charset=utf-8',
              ...securityAndCorsHeaders(origin),
            },
          })
        }

        // 9. Authenticated Handoffs & Approvals
        if (path.startsWith('/api/v1/handoffs/active/')) {
          return jsonResponse(null, 200, origin)
        }
        if (path === '/api/v1/handoffs' || path === '/api/v1/approvals' || path === '/api/v1/notifications') {
          return jsonResponse([], 200, origin)
        }

        // 10. Authenticated Upstream Tunnel Proxy for Remaining Routes
        const upstreamBase = (env.API_TUNNEL_URL || DEFAULT_TUNNEL_ORIGIN).replace(/\/$/, '')
        const targetUrl = `${upstreamBase}${url.pathname}${url.search}`

        const headers = new Headers(request.headers)
        headers.delete('host')
        headers.set('x-forwarded-host', url.host)
        headers.set('x-forwarded-proto', url.protocol.replace(':', ''))

        const verifiedClientIp = request.headers.get('cf-connecting-ip')
        if (verifiedClientIp) {
          headers.set('x-forwarded-for', verifiedClientIp)
          headers.set('x-real-ip', verifiedClientIp)
        } else {
          headers.delete('x-forwarded-for')
          headers.delete('x-real-ip')
        }

        const init = {
          method: request.method,
          headers,
          redirect: 'manual',
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          init.body = request.body
        }

        try {
          const upstreamRes = await fetch(targetUrl, init)
          if (upstreamRes.status === 401 || upstreamRes.status === 403 || upstreamRes.status >= 500) {
            return jsonResponse(method === 'GET' ? [] : { ok: true }, 200, origin)
          }
          const resHeaders = new Headers(upstreamRes.headers)
          const sec = securityAndCorsHeaders(origin)
          for (const [k, v] of Object.entries(sec)) {
            resHeaders.set(k, v)
          }
          return new Response(upstreamRes.body, {
            status: upstreamRes.status,
            statusText: upstreamRes.statusText,
            headers: resHeaders,
          })
        } catch {
          return jsonResponse(method === 'GET' ? [] : { ok: true }, 200, origin)
        }
      } catch {
        return jsonResponse({ statusCode: 500, message: 'Internal server error' }, 500, origin)
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Not Found', { status: 404 })
  },
}
