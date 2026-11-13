import { handleMediaRoutes } from './worker-media.mjs'
import { handleShareRoutes } from './worker-share.mjs'
import { handleBillingRoutes } from './worker-billing-stripe.mjs'
import { handlePayPalRoutes } from './worker-billing-paypal.mjs'
import { reportError, handleClientError } from './worker-limits.mjs'
import { sendEmail, passwordResetEmail, sendVerificationEmail, handleEmailRoutes } from './worker-email.mjs'

// Upstream proxying is disabled unless env.UPSTREAM_API_URL (or legacy env.API_TUNNEL_URL) is set.

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
    'muse-ember-1.0',
    'muse-spark-1.2',
    'muse-spark-1.1',
    'muse-spark-1.3-contributor',
    'muse-spark-1.2-contributor',
  ],
  custom: ['default'],
}

const PROVIDER_BASE_URLS = {
  apisrouter: 'https://apisrouter.dev/v1',
  anthropic: 'https://api.anthropic.com/v1',
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

/**
 * Validate a Firebase ID token by asking Google Identity Toolkit to look it up.
 * This runs entirely server-side; the Firebase Web API key is public by design.
 */
async function verifyFirebaseIdToken(env, idToken) {
  const apiKey = String(env.FIREBASE_API_KEY || '').trim()
  if (!apiKey || !idToken || typeof idToken !== 'string' || idToken.length > 8192) return null

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    )
    if (!response.ok) return null
    const payload = await response.json().catch(() => null)
    const account = payload?.users?.[0]
    const providers = Array.isArray(account?.providerUserInfo) ? account.providerUserInfo : []
    const signedInWithGoogle = providers.some((provider) => provider.providerId === 'google.com')
    if (!account?.localId || !account?.email || account.emailVerified !== true || !signedInWithGoogle) {
      return null
    }
    return {
      uid: String(account.localId),
      email: String(account.email).trim().toLowerCase(),
      name: account.displayName ? String(account.displayName).trim().slice(0, 100) : null,
      picture: account.photoUrl ? String(account.photoUrl) : null,
    }
  } catch {
    return null
  }
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

// ── API key encryption at rest (AES-256-GCM) ──────────────────────────────
const ENC_PREFIX = 'enc:v1:'
let cachedEncKey = null
let cachedEncKeySource = null

async function getEncryptionKey(env) {
  const secret = env.KEY_ENCRYPTION_SECRET
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('KEY_ENCRYPTION_SECRET is not configured.')
  }
  if (cachedEncKey && cachedEncKeySource === secret) return cachedEncKey
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  cachedEncKey = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  cachedEncKeySource = secret
  return cachedEncKey
}

async function encryptSecret(env, plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null
  const key = await getEncryptionKey(env)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(plaintext)))
  return `${ENC_PREFIX}${base64UrlEncodeBytes(iv)}:${base64UrlEncodeBytes(new Uint8Array(ct))}`
}

async function decryptSecret(env, stored) {
  if (!stored || typeof stored !== 'string') return null
  if (!stored.startsWith(ENC_PREFIX)) return stored // legacy plaintext; re-encrypted on next write
  try {
    const [ivB64, ctB64] = stored.slice(ENC_PREFIX.length).split(':')
    const key = await getEncryptionKey(env)
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlDecodeBytes(ivB64) },
      key,
      base64UrlDecodeBytes(ctB64),
    )
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

async function maskStoredKey(env, stored) {
  const plain = await decryptSecret(env, stored)
  return maskKey(plain)
}

// ── Friendly provider error messages ──────────────────────────────────────
function friendlyProviderError(status, provider, rawText = '') {
  const label = provider === 'apisrouter' ? 'APIsRouter' : provider
  if (status === 401 || status === 403) {
    return `Your ${label} API key was rejected (invalid, expired, or revoked). Update it in **[Settings → AI Models & Keys](/settings/config)**.`
  }
  if (status === 402) {
    return `Your ${label} account is out of credits. Top up at ${provider === 'apisrouter' ? '**[apisrouter.dev](https://apisrouter.dev/?ref=openagents)**' : 'your provider dashboard'} and try again.`
  }
  if (status === 404) {
    return `The selected model isn't available on ${label}. Pick another model from the model picker.`
  }
  if (status === 429) {
    return `${label} is rate-limiting your key right now. Wait a moment and try again, or add a backup key in Settings.`
  }
  if (status >= 500) {
    return `${label} is having trouble right now (HTTP ${status}). Please try again in a minute.`
  }
  const snippet = String(rawText || '').replace(/sk-[A-Za-z0-9_-]+|apr-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 160)
  return `${label} returned an error (HTTP ${status})${snippet ? `: ${snippet}` : ''}.`
}

// ── Generic fixed-window rate limiter backed by auth_rate_limits ──────────
async function hitRateLimit(env, bucket, limit, windowMs) {
  const now = Date.now()
  const row = await env.DB.prepare('SELECT failures, windowStart FROM auth_rate_limits WHERE bucket = ?')
    .bind(bucket)
    .first()
  const inWindow = row && now - Number(row.windowStart) < windowMs
  const count = inWindow ? Number(row.failures) + 1 : 1
  const start = inWindow ? Number(row.windowStart) : now
  await env.DB.prepare('INSERT OR REPLACE INTO auth_rate_limits (bucket, failures, windowStart) VALUES (?, ?, ?)')
    .bind(bucket, count, start)
    .run()
  return count > limit
}

let schemaEnsured = false
async function ensureSchema(env) {
  if (schemaEnsured || !env.DB) return

  // Firebase Google auth: add the link column safely on existing deployments.
  try {
    const userColumns = await env.DB.prepare('PRAGMA table_info(users)').all()
    const hasFirebaseUid = (userColumns.results || []).some((column) => column.name === 'firebaseUid')
    if (!hasFirebaseUid) {
      await env.DB.prepare('ALTER TABLE users ADD COLUMN firebaseUid TEXT').run()
    }
    await env.DB.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebaseUid ON users(firebaseUid)',
    ).run()
  } catch (error) {
    // Another isolate may have applied the same migration concurrently.
    console.warn('[schema] firebaseUid migration skipped', error)
  }

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS llm_fallback_keys (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       provider TEXT NOT NULL,
       apiKey TEXT NOT NULL,
       label TEXT,
       priority INTEGER NOT NULL DEFAULT 0,
       isActive INTEGER NOT NULL DEFAULT 1,
       createdAt TEXT NOT NULL
     )`,
  ).run()
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS password_resets (
       tokenHash TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       expiresAt INTEGER NOT NULL
     )`,
  ).run()
  // Funnel analytics. Deliberately an append-only log: it powers referral
  // attribution (signup -> key added -> first message) and never blocks a
  // request if the insert fails.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS usage_events (
       id TEXT PRIMARY KEY,
       userId TEXT,
       event TEXT NOT NULL,
       meta TEXT,
       createdAt TEXT NOT NULL
     )`,
  ).run()
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_usage_events_event ON usage_events(event, createdAt)',
  ).run()
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(userId, event)',
  ).run()
  // Lifetime trial counter for platform-key messages. One row per user; the
  // cap is enforced by an atomic increment before the upstream call.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS trial_usage (
       userId TEXT PRIMARY KEY,
       messages INTEGER NOT NULL DEFAULT 0,
       updatedAt TEXT NOT NULL
     )`,
  ).run()
  // Windowed counter used when TRIAL_WINDOW is 'day' or 'month'. Kept separate
  // from trial_usage so switching windows never resets lifetime data.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS trial_period_usage (
       scope TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       period TEXT NOT NULL,
       messages INTEGER NOT NULL DEFAULT 0,
       updatedAt TEXT NOT NULL
     )`,
  ).run()
  // Sign-in log. Powers the Creator Admin device/login analytics with real
  // data instead of placeholders. One row per successful authentication.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS login_events (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       ip TEXT,
       userAgent TEXT,
       createdAt TEXT NOT NULL
     )`,
  ).run()
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(userId, createdAt)',
  ).run()
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS phone_calls (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       direction TEXT NOT NULL DEFAULT 'outbound',
       toNumber TEXT NOT NULL,
       fromNumber TEXT,
       goal TEXT NOT NULL,
       status TEXT NOT NULL,
       transcript TEXT NOT NULL DEFAULT '[]',
       summary TEXT,
       error TEXT,
       twilioSid TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
  ).run()
  schemaEnsured = true
}

// sendEmail lives in ./worker-email.mjs (Resend, optional)

// ── Telephony (Twilio Programmable Voice) ─────────────────────────────────
function telephonyConfigured(env) {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER)
}

function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toSpeakable(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900)
}

async function verifyTwilioSignature(env, request, url, params) {
  const sig = request.headers.get('x-twilio-signature') || ''
  if (!sig || !env.TWILIO_AUTH_TOKEN) return false
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.TWILIO_AUTH_TOKEN),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  let bin = ''
  for (const b of mac) bin += String.fromCharCode(b)
  return timingSafeEqualStr(btoa(bin), sig)
}

function twimlResponse(xml) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  })
}

async function runPhoneLlmTurn(env, userId, goal, transcript) {
  const settings = await env.DB.prepare('SELECT preferredProvider, preferredModel FROM user_settings WHERE userId = ?')
    .bind(userId)
    .first()
  let provider = settings?.preferredProvider || 'apisrouter'
  let model = settings?.preferredModel || 'claude-sonnet-5.5'
  let keys = await getUserApiKeyCandidates(env, userId, provider)
  if (keys.length === 0) {
    const anyRow = await env.DB.prepare(
      'SELECT provider FROM llm_keys WHERE userId = ? AND apiKey IS NOT NULL ORDER BY updatedAt DESC LIMIT 1',
    )
      .bind(userId)
      .first()
    if (anyRow?.provider) {
      provider = anyRow.provider
      keys = await getUserApiKeyCandidates(env, userId, provider)
      model = (CURATED_MODELS[provider] || [model])[0]
    }
  }
  if (keys.length === 0) return null
  const baseUrl = validateSafeLlmBaseUrl(keys[0].baseUrl, provider)
  const messages = [
    {
      role: 'system',
      content:
        `You are an AI phone agent placing a call on behalf of your user. Call goal: "${goal}". ` +
        'Speak naturally in 1-3 short sentences per turn, like a polite human on the phone. ' +
        'Introduce yourself as an AI assistant calling on behalf of your user at the start. ' +
        'Never invent personal data you were not given. When the goal is achieved or the other person wants to end, say goodbye and include the token [END_CALL] at the very end.',
    },
    ...transcript.map((t) => ({ role: t.role === 'agent' ? 'assistant' : 'user', content: t.text })),
  ]
  if (transcript.length === 0) messages.push({ role: 'user', content: '(The call has just been answered. Open the conversation.)' })
  for (const k of keys) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k.apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 220 }),
    }).catch(() => null)
    if (res && res.ok) {
      const json = await res.json().catch(() => ({}))
      return String(json?.choices?.[0]?.message?.content || '').trim() || null
    }
    if (!res || ![401, 402, 403, 429].includes(res.status)) break
  }
  return null
}

function phoneRowToRecord(r) {
  return {
    id: r.id,
    direction: r.direction,
    to: r.toNumber,
    from: r.fromNumber || '',
    goal: r.goal,
    status: r.status,
    transcript: parseJsonSafe(r.transcript) || [],
    summary: r.summary || undefined,
    error: r.error || undefined,
    createdAt: r.createdAt,
  }
}

async function getUserApiKeyCandidates(env, userId, provider) {
  const keys = []
  const primary = await env.DB.prepare(
    'SELECT provider, apiKey, baseUrl FROM llm_keys WHERE userId = ? AND provider = ? AND apiKey IS NOT NULL LIMIT 1',
  )
    .bind(userId, provider)
    .first()
  if (primary) {
    const plain = await decryptSecret(env, primary.apiKey)
    if (plain) keys.push({ provider, apiKey: plain, baseUrl: primary.baseUrl })
  }
  const fb = await env.DB.prepare(
    'SELECT apiKey FROM llm_fallback_keys WHERE userId = ? AND provider = ? AND isActive = 1 ORDER BY priority ASC, createdAt ASC',
  )
    .bind(userId, provider)
    .all()
  for (const row of fb.results || []) {
    const plain = await decryptSecret(env, row.apiKey)
    if (plain) keys.push({ provider, apiKey: plain, baseUrl: primary?.baseUrl || null })
  }
  return keys
}

/**
 * Free tier config for the platform-owned key.
 *
 * Two independent limits matter:
 *  - which MODELS the platform key may ever be used with (cost control), and
 *  - how many messages each account gets per window (spend control).
 *
 * The allow-list is the important safety property: even if a user edits their
 * preferredModel to an expensive one, the platform key only ever calls cheap
 * models. Premium models require the user's own key.
 *
 * Env: PLATFORM_LLM_KEY (required to enable)
 *      TRIAL_WINDOW      lifetime | day | month   (default lifetime)
 *      TRIAL_MESSAGES    cap per window           (default 15)
 *      TRIAL_PROVIDER    provider id              (default apisrouter)
 *      TRIAL_MODELS      comma-separated allow-list
 *      TRIAL_MODEL       optional primary override
 */
const DEFAULT_TRIAL_MODELS = ['deepseek-v4.1-flash', 'gemini-3.8-flash', 'llama-4-scout']

function trialConfig(env) {
  const key = String(env.PLATFORM_LLM_KEY || '').trim()
  const parsed = Number.parseInt(String(env.TRIAL_MESSAGES ?? ''), 10)
  const allowed = new Set(['lifetime', 'day', 'month'])
  const window = String(env.TRIAL_WINDOW || 'lifetime').trim().toLowerCase()

  const listed = String(env.TRIAL_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  const primary = String(env.TRIAL_MODEL || '').trim()
  const models = Array.from(new Set([...(primary ? [primary] : []), ...listed, ...DEFAULT_TRIAL_MODELS]))

  return {
    enabled: Boolean(key),
    key,
    limit: Number.isFinite(parsed) && parsed >= 0 ? parsed : 15,
    window: allowed.has(window) ? window : 'lifetime',
    provider: String(env.TRIAL_PROVIDER || 'apisrouter').trim().toLowerCase(),
    models,
    /** Back-compat: first allowed model. */
    model: models[0],
  }
}

function trialPeriodKey(window, date = new Date()) {
  if (window === 'day') return date.toISOString().slice(0, 10)
  if (window === 'month') return date.toISOString().slice(0, 7)
  return 'all'
}

/** Append a funnel event. Analytics must never break the request. */
async function recordUsageEvent(env, userId, event, meta) {
  try {
    await env.DB.prepare(
      'INSERT INTO usage_events (id, userId, event, meta, createdAt) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        genId('uev'),
        userId || null,
        String(event),
        meta ? JSON.stringify(meta).slice(0, 2000) : null,
        new Date().toISOString(),
      )
      .run()
  } catch {
    // Ignore: the event log is best-effort.
  }
}

/** Record an event at most once per user (used for signup / first message). */
async function recordUsageEventOnce(env, userId, event, meta) {
  try {
    const exists = await env.DB.prepare(
      'SELECT 1 AS ok FROM usage_events WHERE userId = ? AND event = ? LIMIT 1',
    )
      .bind(userId, event)
      .first()
    if (!exists) await recordUsageEvent(env, userId, event, meta)
  } catch {
    // Ignore.
  }
}

async function getTrialState(env, userId) {
  const cfg = trialConfig(env)
  const base = {
    limit: cfg.limit,
    window: cfg.window,
    period: trialPeriodKey(cfg.window),
    provider: cfg.provider,
    models: cfg.models,
    model: cfg.model,
  }
  if (!cfg.enabled) return { enabled: false, used: 0, remaining: 0, ...base }

  let used = 0
  if (cfg.window === 'lifetime') {
    const row = await env.DB.prepare('SELECT messages FROM trial_usage WHERE userId = ?')
      .bind(userId)
      .first()
    used = Number(row?.messages || 0)
  } else {
    const row = await env.DB.prepare('SELECT messages FROM trial_period_usage WHERE scope = ?')
      .bind(`${userId}:${base.period}`)
      .first()
    used = Number(row?.messages || 0)
  }

  return { enabled: true, used, remaining: Math.max(0, cfg.limit - used), ...base }
}

/**
 * Reserve one trial message. The increment happens before the upstream LLM
 * call so parallel requests cannot exceed the cap for the current window.
 */
async function reserveTrialMessage(env, userId) {
  const cfg = trialConfig(env)
  const nowIso = new Date().toISOString()
  if (cfg.window === 'lifetime') {
    await env.DB.prepare(
      `INSERT INTO trial_usage (userId, messages, updatedAt) VALUES (?, 1, ?)
       ON CONFLICT(userId) DO UPDATE SET messages = messages + 1, updatedAt = excluded.updatedAt`,
    )
      .bind(userId, nowIso)
      .run()
    return
  }

  const period = trialPeriodKey(cfg.window)
  await env.DB.prepare(
    `INSERT INTO trial_period_usage (scope, userId, period, messages, updatedAt) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(scope) DO UPDATE SET messages = messages + 1, updatedAt = excluded.updatedAt`,
  )
    .bind(`${userId}:${period}`, userId, period, nowIso)
    .run()
}

/** Record a successful sign-in for device/login analytics. Best-effort. */
async function recordLoginEvent(env, userId, request) {
  if (!env.DB || !userId) return
  try {
    await env.DB.prepare(
      'INSERT INTO login_events (id, userId, ip, userAgent, createdAt) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        genId('lev'),
        userId,
        (request.headers.get('cf-connecting-ip') || '').slice(0, 64) || null,
        (request.headers.get('user-agent') || '').slice(0, 300) || null,
        new Date().toISOString(),
      )
      .run()
  } catch {
    // Never block sign-in on analytics.
  }
}

const mediaHelpers = () => ({ jsonResponse, encryptSecret, decryptSecret, getUserApiKeyCandidates, hitRateLimit, validateSafeLlmBaseUrl, genId, timingSafeEqualStr })
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
          let db = false
          try {
            db = Boolean(env.DB && (await env.DB.prepare('SELECT 1 AS ok').first()))
          } catch {
            db = false
          }
          return jsonResponse({ ok: db, status: db ? 'ok' : 'degraded', time: new Date().toISOString(), db }, db ? 200 : 503, origin)
        }

        // Public referral click tracking. The web app sends one beacon from a
        // global capture listener, so every APIsRouter link is measurable
        // without touching each anchor individually.
        if (path === '/api/v1/track/outbound' && method === 'POST') {
          await ensureSchema(env)
          const trackIp = request.headers.get('cf-connecting-ip') || 'unknown'
          if (await hitRateLimit(env, `track:${trackIp}`, 60, 60 * 60 * 1000)) {
            return jsonResponse({ ok: true }, 200, origin)
          }
          const body = await request.json().catch(() => ({}))
          const target = String(body.target || '').trim().toLowerCase().slice(0, 40)
          const allowedTargets = new Set(['apisrouter', 'openai', 'anthropic', 'google', 'other'])
          await recordUsageEvent(env, null, 'outbound_click', {
            target: allowedTargets.has(target) ? target : 'other',
            path: String(body.path || '').trim().slice(0, 200) || null,
          })
          return jsonResponse({ ok: true }, 200, origin)
        }

        await ensureSchema(env)

        const publicShare = await handleShareRoutes({ request, env, url, path, method, origin, user: null, h: { ...mediaHelpers(), CURATED_MODELS } })
        if (publicShare) return publicShare
        const publicBilling = await handleBillingRoutes({ request, env, url, path, method, origin, user: null, h: mediaHelpers() })
        if (publicBilling) return publicBilling
        const publicPaypal = await handlePayPalRoutes({ request, env, url, path, method, origin, user: null, h: mediaHelpers() })
        if (publicPaypal) return publicPaypal

        const publicMedia = await handleMediaRoutes({ request, env, url, path, method, origin, user: null, h: mediaHelpers() })
        if (publicMedia) return publicMedia

        // 1a. Twilio voice webhooks (public, authenticated by X-Twilio-Signature)
        const twilioMatch = path.match(/^\/api\/v1\/phone\/twilio\/([^/]+)\/(voice|gather|status)$/)
        if (twilioMatch && method === 'POST') {
          const callId = decodeURIComponent(twilioMatch[1])
          const stage = twilioMatch[2]
          const form = await request.formData().catch(() => null)
          const params = {}
          if (form) for (const [k, v] of form.entries()) params[k] = String(v)
          if (!(await verifyTwilioSignature(env, request, request.url, params))) {
            return new Response('Forbidden', { status: 403 })
          }
          const row = await env.DB.prepare('SELECT * FROM phone_calls WHERE id = ?').bind(callId).first()
          if (!row) return twimlResponse('<Hangup/>')
          const transcript = parseJsonSafe(row.transcript) || []
          const nowIso = new Date().toISOString()
          const gatherUrl = `https://${url.host}/api/v1/phone/twilio/${encodeURIComponent(callId)}/gather`

          if (stage === 'status') {
            const cs = params.CallStatus || ''
            const final = ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(cs)
            if (final) {
              const nextStatus = cs === 'completed' ? 'completed' : 'failed'
              const summary =
                transcript.length > 0
                  ? `Call ${cs}. ${transcript.length} turns exchanged.`
                  : `Call ${cs}${cs === 'completed' ? '' : ' — no conversation took place'}.`
              await env.DB.prepare('UPDATE phone_calls SET status = ?, summary = COALESCE(summary, ?), error = ?, updatedAt = ? WHERE id = ?')
                .bind(nextStatus, summary, nextStatus === 'failed' ? `Call ${cs}` : null, nowIso, callId)
                .run()
            } else if (cs === 'in-progress') {
              await env.DB.prepare("UPDATE phone_calls SET status = 'in_progress', updatedAt = ? WHERE id = ?").bind(nowIso, callId).run()
            }
            return new Response('', { status: 204 })
          }

          if (stage === 'gather' && params.SpeechResult) {
            transcript.push({ role: 'caller', text: params.SpeechResult.slice(0, 1000), at: nowIso })
          }
          if (transcript.length > 40) {
            return twimlResponse('<Say voice="Polly.Joanna">Thank you for your time. Goodbye.</Say><Hangup/>')
          }

          const reply = await runPhoneLlmTurn(env, row.userId, row.goal, transcript)
          if (!reply) {
            await env.DB.prepare("UPDATE phone_calls SET status = 'failed', error = ?, updatedAt = ? WHERE id = ?")
              .bind('No working AI model key — add one in AI Models & Keys.', nowIso, callId)
              .run()
            return twimlResponse('<Say voice="Polly.Joanna">Sorry, I am unable to continue this call right now. Goodbye.</Say><Hangup/>')
          }
          const ending = reply.includes('[END_CALL]')
          const spoken = toSpeakable(reply.replace('[END_CALL]', ''))
          transcript.push({ role: 'agent', text: spoken, at: new Date().toISOString() })
          await env.DB.prepare("UPDATE phone_calls SET transcript = ?, status = 'in_progress', updatedAt = ? WHERE id = ?")
            .bind(JSON.stringify(transcript), nowIso, callId)
            .run()

          if (ending) {
            return twimlResponse(`<Say voice="Polly.Joanna">${xmlEscape(spoken)}</Say><Hangup/>`)
          }
          return twimlResponse(
            `<Gather input="speech" speechTimeout="auto" action="${xmlEscape(gatherUrl)}" method="POST">` +
              `<Say voice="Polly.Joanna">${xmlEscape(spoken)}</Say></Gather>` +
              `<Say voice="Polly.Joanna">I didn't catch that. I'll follow up another time. Goodbye.</Say><Hangup/>`,
          )
        }

        // 1b. Password reset (email via Resend when RESEND_API_KEY is configured)
        if (path === '/api/v1/auth/forgot-password' && method === 'POST') {
          const body = await request.json().catch(() => ({}))
          const email = String(body.email || '').trim().toLowerCase()
          const clientIp = request.headers.get('cf-connecting-ip') || 'unknown'
          const limited = await hitRateLimit(env, `forgot:${clientIp}`, 5, 60 * 60 * 1000)
          const generic = { ok: true, message: 'If that email exists, a reset link has been sent.' }
          if (limited || !email || email.length > 254) return jsonResponse(generic, 200, origin)
          const u = await env.DB.prepare('SELECT id, email FROM users WHERE lower(email) = ? LIMIT 1').bind(email).first()
          if (u) {
            const raw = new Uint8Array(32)
            crypto.getRandomValues(raw)
            const token = base64UrlEncodeBytes(raw)
            const tokenHash = await sha256Hex(token)
            await env.DB.prepare('DELETE FROM password_resets WHERE userId = ?').bind(u.id).run()
            await env.DB.prepare('INSERT INTO password_resets (tokenHash, userId, expiresAt) VALUES (?, ?, ?)')
              .bind(tokenHash, u.id, Date.now() + 30 * 60 * 1000)
              .run()
            const link = `https://openagents.us/reset-password?token=${encodeURIComponent(token)}`
            await sendEmail(env, u.email, 'Reset your OpenAgents password', passwordResetEmail(link))
          }
          return jsonResponse(generic, 200, origin)
        }

        if (path === '/api/v1/auth/reset-password' && method === 'POST') {
          const body = await request.json().catch(() => ({}))
          const token = String(body.token || '').trim()
          const newPassword = String(body.password || body.newPassword || '')
          if (!token || newPassword.length < 8 || newPassword.length > 256) {
            return jsonResponse({ statusCode: 400, message: 'Invalid token or password (min 8 characters).' }, 400, origin)
          }
          const tokenHash = await sha256Hex(token)
          const row = await env.DB.prepare('SELECT userId, expiresAt FROM password_resets WHERE tokenHash = ?').bind(tokenHash).first()
          if (!row || Number(row.expiresAt) < Date.now()) {
            return jsonResponse({ statusCode: 400, message: 'This reset link is invalid or has expired.' }, 400, origin)
          }
          const hash = await hashPasswordPbkdf2(newPassword)
          await env.DB.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?')
            .bind(hash, new Date().toISOString(), row.userId)
            .run()
          await env.DB.prepare('DELETE FROM password_resets WHERE userId = ?').bind(row.userId).run()
          return jsonResponse({ ok: true }, 200, origin)
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

          await recordUsageEvent(env, userId, 'signup', { method: 'password' })

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

          // Non-blocking email verification (unverified users can still use the app)
          await sendVerificationEmail(env, { id: userId, email }).catch((e) => console.error('[verify-email]', e))

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
          await recordLoginEvent(env, user.id, request)

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

        // 2c. Google sign-in via Firebase (verified server-side, then normal JWT session)
        if (path === '/api/v1/auth/firebase' && method === 'POST') {
          if (!env.DB) {
            return jsonResponse({ statusCode: 503, message: 'Database unavailable.' }, 503, origin)
          }
          if (!String(env.FIREBASE_API_KEY || '').trim()) {
            return jsonResponse(
              { statusCode: 503, message: 'Google sign-in is not configured.' },
              503,
              origin,
            )
          }

          const body = await request.json().catch(() => ({}))
          const idToken = String(body.idToken || '').trim()
          if (!idToken) {
            return jsonResponse({ statusCode: 401, message: 'Missing Google sign-in token.' }, 401, origin)
          }

          const clientIp = request.headers.get('cf-connecting-ip') || 'unknown'
          const limited = await hitRateLimit(env, `firebase-login:${clientIp}`, 20, 60_000)
          if (limited) {
            return jsonResponse(
              { statusCode: 429, message: 'Too many sign-in attempts. Please try again shortly.' },
              429,
              origin,
            )
          }

          const account = await verifyFirebaseIdToken(env, idToken)
          if (!account) {
            return jsonResponse(
              { statusCode: 401, message: 'Invalid or expired Google sign-in token.' },
              401,
              origin,
            )
          }

          let dbUser = await env.DB.prepare(
            'SELECT id, email, name, avatarUrl, role, createdAt, firebaseUid FROM users WHERE firebaseUid = ? LIMIT 1',
          )
            .bind(account.uid)
            .first()
          if (!dbUser) {
            dbUser = await env.DB.prepare(
              'SELECT id, email, name, avatarUrl, role, createdAt, firebaseUid FROM users WHERE lower(email) = ? LIMIT 1',
            )
              .bind(account.email)
              .first()
          }

          let user
          if (dbUser) {
            if (dbUser.firebaseUid && String(dbUser.firebaseUid) !== account.uid) {
              return jsonResponse(
                { statusCode: 409, message: 'This email is already linked to a different Google account.' },
                409,
                origin,
              )
            }
            const nextName = dbUser.name || account.name || account.email.split('@')[0]
            const nextAvatar = dbUser.avatarUrl || account.picture || null
            await env.DB.prepare(
              'UPDATE users SET firebaseUid = ?, name = ?, avatarUrl = ?, updatedAt = ? WHERE id = ?',
            )
              .bind(account.uid, nextName, nextAvatar, new Date().toISOString(), dbUser.id)
              .run()
            user = {
              id: dbUser.id,
              email: dbUser.email,
              name: nextName,
              avatarUrl: nextAvatar,
              role: dbUser.role,
              createdAt: dbUser.createdAt,
            }
          } else {
            const userId = genId('cmu')
            const nowIso = new Date().toISOString()
            const displayName = account.name || account.email.split('@')[0]
            await env.DB.prepare(
              `INSERT INTO users (id, email, name, avatarUrl, passwordHash, firebaseUid, role, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, NULL, ?, 'member', ?, ?)`,
            )
              .bind(userId, account.email, displayName, account.picture, account.uid, nowIso, nowIso)
              .run()

            await env.DB.prepare(
              `INSERT INTO user_settings (userId, preferredProvider, preferredModel, customSystemPrompt, lastActiveConversationId, beginnerMode, onboardingCompletedAt, createdAt, updatedAt)
               VALUES (?, 'apisrouter', 'claude-sonnet-5.5', NULL, NULL, 0, NULL, ?, ?)`,
            )
              .bind(userId, nowIso, nowIso)
              .run()

            user = {
              id: userId,
              email: account.email,
              name: displayName,
              avatarUrl: account.picture,
              role: 'member',
              createdAt: nowIso,
            }
            await recordUsageEvent(env, userId, 'signup', { method: 'google' })
          }

          await recordLoginEvent(env, user.id, request)

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

        // 3c. Public: email verification link + client error intake (auth optional)
        const publicEmail = await handleEmailRoutes({ request, env, url, path, method, origin, user: null, h: mediaHelpers() })
        if (publicEmail) return publicEmail
        if (path === '/api/v1/client-errors' && method === 'POST') {
          const maybeUser = await requireAuth(request, env).catch(() => null)
          return handleClientError(request, env, maybeUser, mediaHelpers(), origin)
        }

        // 4. All Remaining Routes Require Valid HS256 JWT Authentication
        const user = await requireAuth(request, env)
        if (!user) {
          return jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401, origin)
        }

        const emailRes = await handleEmailRoutes({ request, env, url, path, method, origin, user, h: mediaHelpers() })
        if (emailRes) return emailRes

        const shareRes = await handleShareRoutes({ request, env, url, path, method, origin, user, h: { ...mediaHelpers(), CURATED_MODELS } })
        if (shareRes) return shareRes
        const billingRes = await handleBillingRoutes({ request, env, url, path, method, origin, user, h: mediaHelpers() })
        if (billingRes) return billingRes
        const paypalRes = await handlePayPalRoutes({ request, env, url, path, method, origin, user, h: mediaHelpers() })
        if (paypalRes) return paypalRes
        const mediaRes = await handleMediaRoutes({ request, env, url, path, method, origin, user, h: mediaHelpers() })
        if (mediaRes) return mediaRes

        if ((path === '/api/v1/auth/me' || path === '/api/v1/users/me') && method === 'GET') {
          return jsonResponse(user, 200, origin)
        }

        // Free-trial status for the platform key (BYOK users always have
        // remaining=0 but hasOwnKey=true, so the UI hides the trial banner).
        if (path === '/api/v1/trial' && method === 'GET') {
          const state = await getTrialState(env, user.id)
          const ownKey = await env.DB.prepare(
            'SELECT 1 AS ok FROM llm_keys WHERE userId = ? AND apiKey IS NOT NULL LIMIT 1',
          )
            .bind(user.id)
            .first()
          return jsonResponse({ ...state, hasOwnKey: Boolean(ownKey) }, 200, origin)
        }

        // Creator Admin analytics (owner/admin only). Backed entirely by real
        // D1 rows: users, conversations, messages, llm_keys and login_events.
        if (path === '/api/v1/platform/admin/overview' && method === 'GET') {
          const viewerRole = String(user.role || '').toLowerCase()
          if (viewerRole !== 'owner' && viewerRole !== 'admin') {
            return jsonResponse({ statusCode: 403, message: 'Owner or admin access required.' }, 403, origin)
          }

          const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30))
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60))
          const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

          const one = async (sql, ...args) => {
            const row = await env.DB.prepare(sql)
              .bind(...args)
              .first()
              .catch(() => null)
            return Number(row?.n || 0)
          }

          const [
            totalUsers,
            owners,
            admins,
            members,
            newUsers30d,
            activeUsers30d,
            totalConversations,
            totalMessages,
            llmKeysConfigured,
            trackedDevices,
            totalDeviceLoginEvents,
          ] = await Promise.all([
            one('SELECT COUNT(*) AS n FROM users'),
            one("SELECT COUNT(*) AS n FROM users WHERE lower(role) = 'owner'"),
            one("SELECT COUNT(*) AS n FROM users WHERE lower(role) = 'admin'"),
            one("SELECT COUNT(*) AS n FROM users WHERE lower(role) NOT IN ('owner','admin')"),
            one('SELECT COUNT(*) AS n FROM users WHERE createdAt >= ?', since),
            one('SELECT COUNT(DISTINCT userId) AS n FROM conversations WHERE createdAt >= ?', since),
            one('SELECT COUNT(*) AS n FROM conversations'),
            one('SELECT COUNT(*) AS n FROM messages'),
            one('SELECT COUNT(DISTINCT userId) AS n FROM llm_keys WHERE apiKey IS NOT NULL'),
            one('SELECT COUNT(*) AS n FROM (SELECT DISTINCT userId, ip, userAgent FROM login_events)'),
            one('SELECT COUNT(*) AS n FROM login_events'),
          ])

          const newDevices30d = await one(
            `SELECT COUNT(*) AS n FROM (
               SELECT userId, ip, userAgent, MIN(createdAt) AS firstSeen
               FROM login_events GROUP BY userId, ip, userAgent
             ) WHERE firstSeen >= ?`,
            since,
          )
          const activeDevices30d = await one(
            'SELECT COUNT(*) AS n FROM (SELECT DISTINCT userId, ip, userAgent FROM login_events WHERE createdAt >= ?)',
            since,
          )

          // Daily series: real signups plus real distinct devices per day.
          const userRows = await env.DB.prepare(
            'SELECT substr(createdAt, 1, 10) AS d, COUNT(*) AS n FROM users WHERE createdAt >= ? GROUP BY d',
          )
            .bind(since)
            .all()
            .catch(() => ({ results: [] }))
          const deviceRows = await env.DB.prepare(
            `SELECT substr(createdAt, 1, 10) AS d, COUNT(DISTINCT userId || '|' || COALESCE(ip,'') || '|' || COALESCE(userAgent,'')) AS n
             FROM login_events WHERE createdAt >= ? GROUP BY d`,
          )
            .bind(since)
            .all()
            .catch(() => ({ results: [] }))
          const newDevRows = await env.DB.prepare(
            `SELECT d, COUNT(*) AS n FROM (
               SELECT userId, ip, userAgent, substr(MIN(createdAt), 1, 10) AS d
               FROM login_events WHERE createdAt >= ? GROUP BY userId, ip, userAgent
             ) GROUP BY d`,
          )
            .bind(since)
            .all()
            .catch(() => ({ results: [] }))

          const usersByDay = new Map((userRows.results || []).map((r) => [r.d, Number(r.n || 0)]))
          const devicesByDay = new Map((deviceRows.results || []).map((r) => [r.d, Number(r.n || 0)]))
          const newDevicesByDay = new Map((newDevRows.results || []).map((r) => [r.d, Number(r.n || 0)]))
          const daily = []
          for (let i = days - 1; i >= 0; i -= 1) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            daily.push({
              date: d,
              newUsers: usersByDay.get(d) || 0,
              newDevices: newDevicesByDay.get(d) || 0,
              activeDevices: devicesByDay.get(d) || 0,
            })
          }

          const topRows = await env.DB.prepare(
            `SELECT u.id AS userId, u.email AS email, u.role AS role,
                    COUNT(DISTINCT l.ip || '|' || COALESCE(l.userAgent,'')) AS devices,
                    COUNT(l.id) AS loginEvents,
                    MAX(l.createdAt) AS lastSeenAt
             FROM users u LEFT JOIN login_events l ON l.userId = u.id
             GROUP BY u.id ORDER BY loginEvents DESC, lastSeenAt DESC LIMIT ?`,
          )
            .bind(limit)
            .all()
            .catch(() => ({ results: [] }))

          const recentRows = await env.DB.prepare(
            `SELECT l.id AS id, l.userId AS userId, u.email AS email, u.role AS role,
                    l.userAgent AS userAgent, l.ip AS ipAddress, l.createdAt AS lastSeenAt
             FROM login_events l JOIN users u ON u.id = l.userId
             ORDER BY l.createdAt DESC LIMIT ?`,
          )
            .bind(limit)
            .all()
            .catch(() => ({ results: [] }))

          return jsonResponse(
            {
              generatedAt: new Date().toISOString(),
              viewer: { id: user.id, email: user.email, role: user.role },
              totals: {
                totalUsers,
                owners,
                admins,
                members,
                newUsers30d,
                activeUsers30d,
                totalConversations,
                totalMessages,
                pendingApprovals: 0,
                trackedDevices,
                newDevices30d,
                activeDevices30d,
                totalDeviceLoginEvents,
                linkedWhatsAppDevices: 0,
                mappedDomains: 0,
                llmKeysConfigured,
              },
              daily,
              topUsers: (topRows.results || []).map((r) => ({
                userId: r.userId,
                email: r.email,
                role: r.role,
                devices: Number(r.devices || 0),
                loginEvents: Number(r.loginEvents || 0),
                lastSeenAt: r.lastSeenAt || null,
              })),
              recentDevices: (recentRows.results || []).map((r) => ({
                id: r.id,
                userId: r.userId,
                email: r.email,
                role: r.role,
                userAgent: r.userAgent || null,
                ipAddress: r.ipAddress || null,
                firstSeenAt: r.lastSeenAt,
                lastSeenAt: r.lastSeenAt,
                loginCount: 1,
              })),
            },
            200,
            origin,
          )
        }

        // Account data export (GDPR) — never includes API key material
        if (path === '/api/v1/users/me/export' && method === 'GET') {
          const settings = await env.DB.prepare('SELECT * FROM user_settings WHERE userId = ?').bind(user.id).first()
          const convs = await env.DB.prepare('SELECT * FROM conversations WHERE userId = ? ORDER BY createdAt ASC').bind(user.id).all()
          const msgs = await env.DB.prepare(
            `SELECT m.id, m.conversationId, m.role, m.content, m.createdAt FROM messages m
             JOIN conversations c ON c.id = m.conversationId WHERE c.userId = ? ORDER BY m.createdAt ASC`,
          )
            .bind(user.id)
            .all()
          const keys = await env.DB.prepare('SELECT provider, baseUrl, createdAt FROM llm_keys WHERE userId = ?').bind(user.id).all()
          return jsonResponse(
            {
              exportedAt: new Date().toISOString(),
              user,
              settings,
              conversations: convs.results || [],
              messages: msgs.results || [],
              connectedProviders: keys.results || [],
            },
            200,
            origin,
          )
        }

        // Permanent account deletion (requires password confirmation)
        if (path === '/api/v1/users/me' && method === 'DELETE') {
          const body = await request.json().catch(() => ({}))
          const row = await env.DB.prepare('SELECT passwordHash FROM users WHERE id = ?').bind(user.id).first()
          const ok = await verifyPasswordPbkdf2(String(body.password || ''), String(row?.passwordHash || ''))
          if (!ok) {
            return jsonResponse({ statusCode: 403, message: 'Password is incorrect.' }, 403, origin)
          }
          if (user.role === 'owner') {
            return jsonResponse({ statusCode: 400, message: 'The workspace owner account cannot be self-deleted.' }, 400, origin)
          }
          await env.DB.prepare('DELETE FROM messages WHERE conversationId IN (SELECT id FROM conversations WHERE userId = ?)').bind(user.id).run()
          await env.DB.prepare('DELETE FROM conversations WHERE userId = ?').bind(user.id).run()
          await env.DB.prepare('DELETE FROM llm_keys WHERE userId = ?').bind(user.id).run()
          await env.DB.prepare('DELETE FROM llm_fallback_keys WHERE userId = ?').bind(user.id).run()
          await env.DB.prepare('DELETE FROM password_resets WHERE userId = ?').bind(user.id).run()
          await env.DB.prepare('DELETE FROM phone_calls WHERE userId = ?').bind(user.id).run()
          await env.DB.prepare('DELETE FROM avatars WHERE userId = ?').bind(user.id).run().catch(() => {})
          await env.DB.prepare('DELETE FROM tts_config WHERE userId = ?').bind(user.id).run().catch(() => {})
          if (env.AVATARS) {
            const owned = await env.AVATARS.list({ prefix: `users/${user.id}/` })
            for (const obj of owned.objects) await env.AVATARS.delete(obj.key)
          }
          await env.DB.prepare('DELETE FROM user_settings WHERE userId = ?').bind(user.id).run()
          await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run()
          return jsonResponse({ ok: true }, 200, origin)
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
          const fbProvider = decodeURIComponent(fallbackMatch[1]).toLowerCase()
          const fbId = fallbackMatch[2] ? decodeURIComponent(fallbackMatch[2]) : null
          if (!Object.prototype.hasOwnProperty.call(CURATED_MODELS, fbProvider)) {
            return jsonResponse({ statusCode: 400, message: 'Unsupported provider.' }, 400, origin)
          }
          if (method === 'GET' && !fbId) {
            const res = await env.DB.prepare(
              'SELECT id, label, priority, isActive, createdAt FROM llm_fallback_keys WHERE userId = ? AND provider = ? ORDER BY priority ASC, createdAt ASC',
            )
              .bind(user.id, fbProvider)
              .all()
            return jsonResponse(
              (res.results || []).map((r) => ({ ...r, isActive: Boolean(r.isActive) })),
              200,
              origin,
            )
          }
          if (method === 'POST' && !fbId) {
            const body = await request.json().catch(() => ({}))
            const rawKey = String(body.apiKey || '').trim()
            if (!rawKey || rawKey.length > 512) {
              return jsonResponse({ statusCode: 400, message: 'API key is required.' }, 400, origin)
            }
            const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM llm_fallback_keys WHERE userId = ? AND provider = ?')
              .bind(user.id, fbProvider)
              .first()
            if (Number(countRow?.n || 0) >= 5) {
              return jsonResponse({ statusCode: 400, message: 'Maximum of 5 backup keys per provider.' }, 400, origin)
            }
            const row = {
              id: genId('cmf'),
              label: body.label ? String(body.label).trim().slice(0, 60) : null,
              priority: Number(countRow?.n || 0),
              isActive: true,
              createdAt: new Date().toISOString(),
            }
            await env.DB.prepare(
              'INSERT INTO llm_fallback_keys (id, userId, provider, apiKey, label, priority, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
            )
              .bind(row.id, user.id, fbProvider, await encryptSecret(env, rawKey), row.label, row.priority, row.createdAt)
              .run()
            return jsonResponse(row, 201, origin)
          }
          if (method === 'DELETE' && fbId) {
            await env.DB.prepare('DELETE FROM llm_fallback_keys WHERE id = ? AND userId = ?').bind(fbId, user.id).run()
            return jsonResponse({ ok: true }, 200, origin)
          }
        }

        // 6. LLM API Keys (Masked on Read, SSRF-Safe Base URLs)
        if (path === '/api/v1/users/me/llm-keys' && method === 'GET') {
          const res = await env.DB.prepare('SELECT * FROM llm_keys WHERE userId = ?').bind(user.id).all()
          const rows = res.results || []
          // Lazily migrate any legacy plaintext keys to AES-GCM ciphertext
          for (const r of rows) {
            if (r.apiKey && !String(r.apiKey).startsWith(ENC_PREFIX)) {
              await env.DB.prepare('UPDATE llm_keys SET apiKey = ? WHERE userId = ? AND provider = ?')
                .bind(await encryptSecret(env, r.apiKey), r.userId, r.provider)
                .run()
            }
          }
          const masked = await Promise.all(rows.map(async (r) => ({
            id: `${r.userId}-${r.provider}`,
            userId: r.userId,
            provider: r.provider,
            apiKey: await maskStoredKey(env, r.apiKey),
            baseUrl: r.baseUrl || null,
            isActive: Boolean(r.isActive),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })))
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
            const incomingKey =
              body.apiKey !== undefined && String(body.apiKey).trim() ? String(body.apiKey).trim().slice(0, 512) : null
            const existingPlain = existing?.apiKey ? await decryptSecret(env, existing.apiKey) : null
            const plainKey = incomingKey || existingPlain
            const apiKey = plainKey ? await encryptSecret(env, plainKey) : null
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

            if (plainKey) {
              await env.DB.prepare(
                `DELETE FROM messages
                 WHERE conversationId IN (SELECT id FROM conversations WHERE userId = ?)
                   AND role = 'agent'
                   AND (content LIKE '%Welcome to OpenAgents%' OR content LIKE '%Settings & Models%')`,
              )
                .bind(user.id)
                .run()
              // Funnel signal: a user who adds a key has converted from the
              // free trial to paying their own provider.
              await recordUsageEventOnce(env, user.id, 'key_added', {
                provider,
                firstKey: !existingPlain,
              })
            }

            return jsonResponse(
              {
                id: `${user.id}-${provider}`,
                userId: user.id,
                provider,
                apiKey: maskKey(plainKey),
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
          let savedKey = keyRow?.apiKey ? await decryptSecret(env, keyRow.apiKey) : null
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
          const apiKey =
            (body.apiKey && String(body.apiKey).trim()) ||
            (keyRow?.apiKey ? await decryptSecret(env, keyRow.apiKey) : '') ||
            ''
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
          if (provider === 'ollama' || provider === 'custom' || provider === 'anthropic') {
            return jsonResponse({ ok: true, model: body.model || curated[0], warning: 'Key saved. Live verification is not available for this provider from the cloud.' }, 200, origin)
          }
          if (await hitRateLimit(env, `testllm:${user.id}`, 20, 60 * 1000)) {
            return jsonResponse({ ok: false, error: 'Too many tests. Wait a minute.' }, 200, origin)
          }
          const testBase = validateSafeLlmBaseUrl(
            (body.baseUrl && String(body.baseUrl).trim()) || keyRow?.baseUrl || null,
            provider,
          )
          try {
            const probe = await fetch(`${testBase}/models`, {
              headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
            })
            if (probe.ok) {
              return jsonResponse({ ok: true, model: body.model || curated[0] }, 200, origin)
            }
            const txt = await probe.text().catch(() => '')
            return jsonResponse({ ok: false, error: friendlyProviderError(probe.status, provider, txt).replace(/\*\*|\[|\]\([^)]*\)/g, '') }, 200, origin)
          } catch {
            return jsonResponse({ ok: false, error: 'Could not reach the provider. Check the Base URL.' }, 200, origin)
          }
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
          if (
            (await hitRateLimit(env, `chat:min:${user.id}`, 20, 60 * 1000)) ||
            (await hitRateLimit(env, `chat:day:${user.id}`, 1000, 24 * 60 * 60 * 1000))
          ) {
            return jsonResponse(
              { statusCode: 429, message: 'You are sending messages too quickly. Please wait a moment and try again.' },
              429,
              origin,
            )
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
          const history = (histRes.results || [])
            .filter(
              (m) =>
                !(
                  m.role === 'agent' &&
                  (String(m.content || '').includes('Welcome to OpenAgents') ||
                    String(m.content || '').includes('Settings & Models'))
                ),
            )
            .map((m) => ({
              role: m.role === 'agent' ? 'assistant' : 'user',
              content: String(m.content || '').replace(
                /\n*Want deeper research[\s\S]*?Settings & Models[\s\S]*$/i,
                '',
              ),
            }))

          let keyCandidates = await getUserApiKeyCandidates(env, user.id, preferredProvider)
          let activeProvider = preferredProvider
          if (keyCandidates.length === 0) {
            const anyRow = await env.DB.prepare(
              'SELECT provider FROM llm_keys WHERE userId = ? AND apiKey IS NOT NULL ORDER BY updatedAt DESC LIMIT 1',
            )
              .bind(user.id)
              .first()
            if (anyRow?.provider) {
              activeProvider = anyRow.provider
              keyCandidates = await getUserApiKeyCandidates(env, user.id, activeProvider)
              if (!(CURATED_MODELS[activeProvider] || []).includes(preferredModel)) {
                preferredModel = (CURATED_MODELS[activeProvider] || [preferredModel])[0]
              }
            }
          }
          let apiKey = keyCandidates[0]?.apiKey || ''
          let baseUrl = validateSafeLlmBaseUrl(keyCandidates[0]?.baseUrl, activeProvider)
          let trialMode = false
          let trialRemaining = 0
          if (!apiKey) {
            const trial = trialConfig(env)
            if (trial.enabled) {
              const state = await getTrialState(env, user.id)
              trialRemaining = state.remaining
              if (state.remaining > 0) {
                // Reserve before the upstream call so concurrent requests
                // cannot exceed the lifetime cap.
                await reserveTrialMessage(env, user.id)
                apiKey = trial.key
                activeProvider = trial.provider
                preferredModel = trial.model
                baseUrl = validateSafeLlmBaseUrl(null, activeProvider)
                trialMode = true
                trialRemaining = state.remaining - 1
                await recordUsageEvent(env, user.id, 'trial_message', {
                  provider: activeProvider,
                  model: preferredModel,
                  remaining: trialRemaining,
                  window: trial.window,
                })
              }
            }
          }

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
                const trial = trialConfig(env)
                await recordUsageEventOnce(env, user.id, 'trial_exhausted', { limit: trial.limit })
                const onboardingReply = trial.enabled
                  ? [
                      `### Your ${trial.limit}-message free trial is used up`,
                      '',
                      'Your OpenAgents account stays **free forever** — you only pay your AI provider for what you use.',
                      '',
                      '**Add a key to keep going (recommended):**',
                      '',
                      '1. **One key, 93+ frontier models** — create an account at **[APIsRouter.dev](https://apisrouter.dev/?ref=openagents)** and copy the `apr-sk-live-...` key. It unlocks `claude-sonnet-5.5`, `gpt-6.1-sol-pro`, `deepseek-v4.1-flash`, `gemini-4-argon`, `kimi-k2.7-code`, and `grok-4.7`.',
                      '2. **Or bring your own key (BYOK)** — Anthropic, OpenAI, Google Gemini, NVIDIA, DeepSeek, Groq, xAI, or a local Ollama.',
                      '',
                      '👉 Open **[Settings & Models → APIsRouter](/settings/config)**, paste your key, and send your message again.',
                    ].join('\n')
                  : [
                      '### Welcome to OpenAgents — Your Cloud Workspace is 100% Free',
                      '',
                      'OpenAgents does not bundle free model keys — connect your own to start:',
                      '',
                      '1. **Recommended — All 93+ Frontier Models in 1 Key:**',
                      '   Get an API key at **[APIsRouter.dev](https://apisrouter.dev/?ref=openagents)** to unlock `claude-sonnet-5.5`, `claude-opus-5.5`, `gpt-6.1-sol-pro`, `deepseek-v4.1-flash`, `gemini-4-argon`, `kimi-k2.7-code`, and `grok-4.7` with a single key.',
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
                    'You are Veda, an autonomous personal AI agent on OpenAgents. Be concise, sharp, helpful, and action-oriented. The user already has an active API key connected — never ask the user to connect an API key or visit Settings & Models.',
                },
                ...history,
              ]

              let llmRes = null
              let lastStatus = 0
              let lastText = ''
              for (const candidate of keyCandidates) {
                llmRes = await fetch(`${baseUrl}/chat/completions`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${candidate.apiKey}`,
                  },
                  body: JSON.stringify({
                    model: preferredModel,
                    messages: llmMessages,
                    stream: true,
                  }),
                })
                if (llmRes.ok) break
                lastStatus = llmRes.status
                lastText = await llmRes.text().catch(() => '')
                // Only rotate to backup keys on auth / quota / rate-limit failures
                if (![401, 402, 403, 429].includes(llmRes.status)) break
              }

              if (!llmRes || !llmRes.ok) {
                const friendly = friendlyProviderError(lastStatus, activeProvider, lastText)
                const failedAt = new Date().toISOString()
                await env.DB.prepare(
                  `INSERT INTO messages (id, conversationId, role, content, status, metadata, toolCallJson, toolResultJson, createdAt)
                   VALUES (?, ?, 'agent', ?, 'error', NULL, NULL, NULL, ?)`,
                )
                  .bind(agentMsgId, convId, friendly, failedAt)
                  .run()
                await sendSse('delta', { content: friendly })
                await sendSse('message', {
                  id: agentMsgId,
                  conversationId: convId,
                  role: 'agent',
                  content: friendly,
                  status: 'error',
                  createdAt: failedAt,
                })
                await sendSse('done', { conversationId: convId })
                return
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
              await recordUsageEventOnce(env, user.id, 'first_message', {
                provider: activeProvider,
                model: preferredModel,
                trial: trialMode,
              })
              if (trialMode) {
                await recordUsageEvent(env, user.id, 'trial_message_delivered', { remaining: trialRemaining })
              }

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
              const message = 'Veda could not reach the AI provider. Please check your connection and try again.'
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

        // 8b. Phone Agent (D1 + Twilio) — real outbound AI calls with human approval
        if (path === '/api/v1/phone/status' && method === 'GET') {
          const configured = telephonyConfigured(env)
          return jsonResponse(
            {
              configured,
              fromNumber: configured ? String(env.TWILIO_FROM_NUMBER) : null,
              allowed: user.role === 'owner' || user.role === 'admin',
            },
            200,
            origin,
          )
        }

        if (path === '/api/v1/phone/calls' && method === 'GET') {
          const res = await env.DB.prepare('SELECT * FROM phone_calls WHERE userId = ? ORDER BY createdAt DESC LIMIT 50')
            .bind(user.id)
            .all()
          return jsonResponse((res.results || []).map(phoneRowToRecord), 200, origin)
        }

        if (path === '/api/v1/phone/calls' && method === 'POST') {
          if (user.role !== 'owner' && user.role !== 'admin') {
            return jsonResponse(
              { statusCode: 403, message: 'Outbound phone calls are not enabled for your account yet. Live voice calls in the browser are available to everyone.' },
              403,
              origin,
            )
          }
          const body = await request.json().catch(() => ({}))
          const toNumber = String(body.to || '').replace(/[\s()-]/g, '')
          const goal = String(body.goal || '').trim().slice(0, 1000)
          if (!/^\+[1-9]\d{7,14}$/.test(toNumber)) {
            return jsonResponse({ statusCode: 400, message: 'Enter the number in international format, e.g. +15551234567.' }, 400, origin)
          }
          if (!goal) {
            return jsonResponse({ statusCode: 400, message: 'Describe the goal of the call.' }, 400, origin)
          }
          if (await hitRateLimit(env, `phone:day:${user.id}`, 20, 24 * 60 * 60 * 1000)) {
            return jsonResponse({ statusCode: 429, message: 'Daily call limit reached (20).' }, 429, origin)
          }
          const nowIso = new Date().toISOString()
          const id = genId('cmp')
          await env.DB.prepare(
            `INSERT INTO phone_calls (id, userId, direction, toNumber, fromNumber, goal, status, transcript, createdAt, updatedAt)
             VALUES (?, ?, 'outbound', ?, ?, ?, 'pending_approval', '[]', ?, ?)`,
          )
            .bind(id, user.id, toNumber, env.TWILIO_FROM_NUMBER || null, goal, nowIso, nowIso)
            .run()
          const row = await env.DB.prepare('SELECT * FROM phone_calls WHERE id = ?').bind(id).first()
          return jsonResponse(phoneRowToRecord(row), 201, origin)
        }

        const phoneActionMatch = path.match(/^\/api\/v1\/phone\/calls\/([^/]+)\/(approve|reject)$/)
        if (phoneActionMatch && method === 'POST') {
          const callId = decodeURIComponent(phoneActionMatch[1])
          const action = phoneActionMatch[2]
          const row = await env.DB.prepare('SELECT * FROM phone_calls WHERE id = ? AND userId = ?').bind(callId, user.id).first()
          if (!row) return jsonResponse({ statusCode: 404, message: 'Call not found' }, 404, origin)
          if (row.status !== 'pending_approval') {
            return jsonResponse({ statusCode: 400, message: `Call is already ${row.status}.` }, 400, origin)
          }
          const nowIso = new Date().toISOString()
          if (action === 'reject') {
            await env.DB.prepare("UPDATE phone_calls SET status = 'rejected', updatedAt = ? WHERE id = ?").bind(nowIso, callId).run()
          } else if (!telephonyConfigured(env)) {
            await env.DB.prepare("UPDATE phone_calls SET status = 'failed', error = ?, updatedAt = ? WHERE id = ?")
              .bind('Telephony is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER secrets.', nowIso, callId)
              .run()
          } else {
            const base = `https://${url.host}/api/v1/phone/twilio/${encodeURIComponent(callId)}`
            const form = new URLSearchParams({
              To: row.toNumber,
              From: String(env.TWILIO_FROM_NUMBER),
              Url: `${base}/voice`,
              StatusCallback: `${base}/status`,
              StatusCallbackMethod: 'POST',
              MachineDetection: 'Enable',
            })
            for (const ev of ['initiated', 'ringing', 'answered', 'completed']) form.append('StatusCallbackEvent', ev)
            const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls.json`, {
              method: 'POST',
              headers: {
                Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: form.toString(),
            }).catch(() => null)
            const twJson = tw ? await tw.json().catch(() => ({})) : {}
            if (tw && tw.ok && twJson.sid) {
              await env.DB.prepare("UPDATE phone_calls SET status = 'dialing', twilioSid = ?, updatedAt = ? WHERE id = ?")
                .bind(twJson.sid, nowIso, callId)
                .run()
            } else {
              await env.DB.prepare("UPDATE phone_calls SET status = 'failed', error = ?, updatedAt = ? WHERE id = ?")
                .bind(`Twilio rejected the call: ${String(twJson.message || (tw ? `HTTP ${tw.status}` : 'network error')).slice(0, 200)}`, nowIso, callId)
                .run()
            }
          }
          const updated = await env.DB.prepare('SELECT * FROM phone_calls WHERE id = ?').bind(callId).first()
          return jsonResponse(phoneRowToRecord(updated), 200, origin)
        }

        // 9. Authenticated Handoffs & Approvals
        if (path.startsWith('/api/v1/handoffs/active/')) {
          return jsonResponse(null, 200, origin)
        }
        if (path === '/api/v1/handoffs' || path === '/api/v1/approvals' || path === '/api/v1/notifications') {
          return jsonResponse([], 200, origin)
        }

        // 10. Endpoint not handled natively by the Worker (same behavior for every role).
        const notAvailable = () => jsonResponse(
          { statusCode: 501, message: 'This feature is not available yet.' },
          501,
          origin,
        )
        // Only proxy when an upstream is EXPLICITLY configured. No role/user-specific routing.
        const configuredUpstream = String(env.UPSTREAM_API_URL || env.API_TUNNEL_URL || '').trim()
        if (!configuredUpstream) {
          return notAvailable()
        }
        const upstreamBase = configuredUpstream.replace(/\/$/, '')
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
          const upstreamType = (upstreamRes.headers.get('content-type') || '').toLowerCase()
          if (upstreamType.includes('text/html') || upstreamRes.status === 530 || upstreamRes.status === 502) {
            // Upstream unreachable (e.g. Cloudflare 1016/530 HTML page) — never leak raw HTML into the app
            return notAvailable()
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
          return notAvailable()
        }
      } catch (err) {
        await reportError(env, err, { path, method })
        return jsonResponse({ statusCode: 500, message: 'Internal server error' }, 500, origin)
      }
    }

    if (env.ASSETS) {
      // Static-export fallbacks for dynamic public pages: /p/<slug> → /p (avatar), /a/<slug> → /a/default (agent)
      const pubAvatar = url.pathname.match(/^\/p\/[^/]+\/?$/)
      const pubAgent = url.pathname.match(/^\/a\/([^/]+)\/?$/)
      if ((pubAvatar || (pubAgent && pubAgent[1] !== 'default')) && (request.method === 'GET' || request.method === 'HEAD')) {
        const target = new URL(pubAvatar ? '/p' : '/a/default', url.origin)
        const res = await env.ASSETS.fetch(new Request(target.toString(), request))
        if (res.ok) return new Response(res.body, { status: 200, headers: res.headers })
      }

      const assetResponse = await env.ASSETS.fetch(request)
      const contentType = assetResponse.headers.get('content-type') || ''
      if (request.method === 'GET' && contentType.includes('text/html')) {
        // Never let an edge node serve stale HTML that points at a different
        // JS bundle after a deploy (that mismatch produces minified runtime
        // errors such as "l is not a function").
        const headers = new Headers(assetResponse.headers)
        headers.set('cache-control', 'no-cache, no-store, must-revalidate')
        headers.set('pragma', 'no-cache')
        headers.set('expires', '0')
        let status = assetResponse.status
        const base = url.pathname.replace(/\/+$/, '')
        if (base && base !== '/' && !base.startsWith('/_next/')) {
          const candidates = [`${base}.html`, `${base}/index.html`]
          let exists = false
          for (const candidate of candidates) {
            const probe = await env.ASSETS.fetch(new Request(new URL(candidate, url.origin), { method: 'HEAD' }))
            if (probe.ok) {
              exists = true
              break
            }
          }
          if (!exists) status = 404
        }
        return new Response(assetResponse.body, {
          status,
          statusText: assetResponse.statusText,
          headers,
        })
      }
      return assetResponse
    }

    return new Response('Not Found', { status: 404 })
  },
}
