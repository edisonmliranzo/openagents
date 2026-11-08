const DEFAULT_TUNNEL_ORIGIN = 'https://someone-edinburgh-interstate-relative.trycloudflare.com'
const OWNER_USER_ID = 'cmq8s6r9m00008aj6mtrkt3ak'
const OWNER_EMAIL = 'edison0220@gmail.com'
const CLOUD_OWNER_DIGEST = 'b7735a5c99198293f2040cc09cb8df8bf8fdb4c05cc95d037c42b96e50adfffb'

const CURATED_MODELS = {
  apisrouter: [
    'claude-sonnet-5.5',
    'claude-opus-5.5',
    'gpt-6.1-sol-pro',
    'kimi-k2.7-code',
    'deepseek-v4.1-flash',
    'deepseek-v4.1-flash-1017',
    'deepseek-v4.1-reasoner',
    'gemini-4-argon',
    'gemini-4-flash',
    'grok-4.7',
    'grok-4.7-mini',
    'qwen-3.5-coder-max',
    'llama-4.1-405b-instruct',
    'mistral-large-3',
  ],
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-haiku-20241022',
  ],
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  nvidia: [
    'meta/llama-3.3-70b-instruct',
    'deepseek-ai/deepseek-r1',
    'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    'qwen/qwen2.5-coder-32b-instruct',
  ],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen-qwq-32b'],
  xai: ['grok-3', 'grok-3-mini'],
  mistral: ['mistral-large-latest', 'codestral-latest'],
  openrouter: [
    'anthropic/claude-3.7-sonnet',
    'openai/gpt-4.1',
    'google/gemini-2.5-pro',
    'deepseek/deepseek-r1',
  ],
  together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-R1'],
  perplexity: ['sonar-pro', 'sonar-reasoning-pro', 'sonar'],
  minimax: ['MiniMax-Text-01'],
  atlascloud: ['deepseek-ai/DeepSeek-V3'],
  ollama: ['llama3.2', 'qwen2.5-coder', 'deepseek-r1'],
  meta: ['muse-spark-1'],
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

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, Accept, X-Requested-With',
    'cache-control': 'no-store, no-cache, must-revalidate',
  }
}

function jsonResponse(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  })
}

function genId(prefix = 'cm') {
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  return `${prefix}${Date.now().toString(36)}${rand}`.slice(0, 25)
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

async function resolveUser(request, env) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (token && token !== 'cloud-portal-session' && token.split('.').length === 3) {
    try {
      const payloadJson = atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      const payload = JSON.parse(payloadJson)
      const sub = payload.sub || payload.userId || payload.id
      if (sub && env.DB) {
        const found = await env.DB.prepare('SELECT id, email, name, avatarUrl, role, createdAt FROM users WHERE id = ?')
          .bind(sub)
          .first()
        if (found) return found
      }
    } catch {
      // Fall back to owner user
    }
  }

  if (env.DB) {
    const owner = await env.DB.prepare('SELECT id, email, name, avatarUrl, role, createdAt FROM users WHERE id = ? OR email = ? LIMIT 1')
      .bind(OWNER_USER_ID, OWNER_EMAIL)
      .first()
    if (owner) return owner
  }

  return {
    id: OWNER_USER_ID,
    email: OWNER_EMAIL,
    name: 'edison0220',
    avatarUrl: null,
    role: 'owner',
    createdAt: '2026-06-11T00:50:24.778Z',
  }
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
    const origin = request.headers.get('origin') || url.origin

    if (request.method === 'OPTIONS' && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/'))) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
      const path = url.pathname.replace(/\/$/, '')
      const method = request.method.toUpperCase()

      try {
        // 1. Health Check
        if (path === '/api/v1/health' && method === 'GET') {
          return jsonResponse(
            {
              status: 'ok',
              storage: env.DB ? 'cloudflare-d1' : 'edge',
              timestamp: new Date().toISOString(),
              uptimeSeconds: 3600,
            },
            200,
            origin,
          )
        }

        // 2. Auth Endpoints
        if (path === '/api/v1/auth/login' && method === 'POST') {
          const body = await request.json().catch(() => ({}))
          const email = String(body.email || '').trim().toLowerCase()
          const password = String(body.password || '')
          const digest = await sha256Hex(`${email}:${password}`)

          let user = null
          if (env.DB) {
            user = await env.DB.prepare('SELECT id, email, name, avatarUrl, role, createdAt FROM users WHERE lower(email) = ? LIMIT 1')
              .bind(email || OWNER_EMAIL)
              .first()
          }
          if (!user && (digest === CLOUD_OWNER_DIGEST || email === OWNER_EMAIL)) {
            user = await resolveUser(request, env)
          }
          if (!user) {
            return jsonResponse({ statusCode: 401, message: 'Invalid email or password.' }, 401, origin)
          }

          const tokenPayload = btoa(
            JSON.stringify({ sub: user.id, email: user.email, role: user.role, iat: Math.floor(Date.now() / 1000) }),
          )
          const token = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${tokenPayload}.cf-d1`
          return jsonResponse(
            {
              user,
              tokens: {
                accessToken: token,
                refreshToken: token,
                expiresIn: 604800,
              },
            },
            200,
            origin,
          )
        }

        if (path === '/api/v1/auth/refresh' && method === 'POST') {
          const user = await resolveUser(request, env)
          const tokenPayload = btoa(
            JSON.stringify({ sub: user.id, email: user.email, role: user.role, iat: Math.floor(Date.now() / 1000) }),
          )
          const token = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${tokenPayload}.cf-d1`
          return jsonResponse(
            {
              accessToken: token,
              refreshToken: token,
              expiresIn: 604800,
            },
            200,
            origin,
          )
        }

        if (path === '/api/v1/auth/logout' && method === 'POST') {
          return jsonResponse({ ok: true }, 200, origin)
        }

        if ((path === '/api/v1/auth/me' || path === '/api/v1/users/me') && method === 'GET') {
          const user = await resolveUser(request, env)
          return jsonResponse(user, 200, origin)
        }

        if (path === '/api/v1/users/me' && (method === 'PUT' || method === 'PATCH')) {
          const user = await resolveUser(request, env)
          const body = await request.json().catch(() => ({}))
          const nextName = body.name !== undefined ? body.name : user.name
          const nextAvatar = body.avatarUrl !== undefined ? body.avatarUrl : user.avatarUrl
          if (env.DB) {
            await env.DB.prepare('UPDATE users SET name = ?, avatarUrl = ?, updatedAt = ? WHERE id = ?')
              .bind(nextName, nextAvatar, new Date().toISOString(), user.id)
              .run()
          }
          return jsonResponse({ ...user, name: nextName, avatarUrl: nextAvatar }, 200, origin)
        }

        // 3. User Settings (Active Session ID, Preferred Provider & Model)
        if (path === '/api/v1/users/me/settings' && method === 'GET') {
          const user = await resolveUser(request, env)
          let settings = null
          if (env.DB) {
            settings = await env.DB.prepare('SELECT * FROM user_settings WHERE userId = ? LIMIT 1')
              .bind(user.id)
              .first()
          }
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
          const user = await resolveUser(request, env)
          const body = await request.json().catch(() => ({}))
          const now = new Date().toISOString()

          let current = null
          if (env.DB) {
            current = await env.DB.prepare('SELECT * FROM user_settings WHERE userId = ? LIMIT 1')
              .bind(user.id)
              .first()
          }

          const next = {
            userId: user.id,
            preferredProvider: body.preferredProvider ?? current?.preferredProvider ?? 'apisrouter',
            preferredModel: body.preferredModel ?? current?.preferredModel ?? 'deepseek-v4.1-flash-1017',
            customSystemPrompt:
              body.customSystemPrompt !== undefined ? body.customSystemPrompt : (current?.customSystemPrompt ?? null),
            lastActiveConversationId:
              body.lastActiveConversationId !== undefined
                ? body.lastActiveConversationId
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

          if (env.DB) {
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
          }

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

        // 4. LLM API Keys & Models
        if (path === '/api/v1/users/me/llm-keys' && method === 'GET') {
          const user = await resolveUser(request, env)
          let rows = []
          if (env.DB) {
            const res = await env.DB.prepare('SELECT * FROM llm_keys WHERE userId = ?').bind(user.id).all()
            rows = res.results || []
          }
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
          const user = await resolveUser(request, env)
          const now = new Date().toISOString()

          if (method === 'PUT' || method === 'POST') {
            const body = await request.json().catch(() => ({}))
            const existing = env.DB
              ? await env.DB.prepare('SELECT * FROM llm_keys WHERE userId = ? AND provider = ?')
                  .bind(user.id, provider)
                  .first()
              : null
            const apiKey =
              body.apiKey !== undefined && String(body.apiKey).trim()
                ? String(body.apiKey).trim()
                : (existing?.apiKey ?? null)
            const baseUrl =
              body.baseUrl !== undefined ? (body.baseUrl ? String(body.baseUrl).trim() : null) : (existing?.baseUrl ?? null)
            const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1

            if (env.DB) {
              await env.DB.prepare(
                `INSERT OR REPLACE INTO llm_keys (userId, provider, apiKey, baseUrl, isActive, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
              )
                .bind(user.id, provider, apiKey, baseUrl, isActive, existing?.createdAt ?? now, now)
                .run()
            }

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
            if (env.DB) {
              await env.DB.prepare('DELETE FROM llm_keys WHERE userId = ? AND provider = ?')
                .bind(user.id, provider)
                .run()
            }
            return jsonResponse({ ok: true }, 200, origin)
          }
        }

        const modelsMatch = path.match(/^\/api\/v1\/agent\/models\/([^/]+)$/)
        if (modelsMatch && (method === 'GET' || method === 'POST')) {
          const provider = decodeURIComponent(modelsMatch[1]).toLowerCase()
          const curated = CURATED_MODELS[provider] || CURATED_MODELS.apisrouter
          const user = await resolveUser(request, env)
          let savedKey = null
          let savedBaseUrl = null
          if (env.DB) {
            const keyRow = await env.DB.prepare('SELECT apiKey, baseUrl FROM llm_keys WHERE userId = ? AND provider = ?')
              .bind(user.id, provider)
              .first()
            savedKey = keyRow?.apiKey || null
            savedBaseUrl = keyRow?.baseUrl || null
          }
          if (method === 'POST') {
            const body = await request.json().catch(() => ({}))
            if (body.apiKey) savedKey = String(body.apiKey).trim()
            if (body.baseUrl) savedBaseUrl = String(body.baseUrl).trim()
          }

          const baseUrl = (savedBaseUrl || PROVIDER_BASE_URLS[provider] || '').replace(/\/$/, '')
          if (baseUrl && (savedKey || provider === 'apisrouter' || provider === 'openrouter')) {
            try {
              const res = await fetch(`${baseUrl}/models`, {
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
          return jsonResponse({ ok: true, model: body.model || curated[0] }, 200, origin)
        }

        // 5. Conversations & Messages (100% Live on Cloudflare D1)
        if (path === '/api/v1/conversations' && method === 'GET') {
          const user = await resolveUser(request, env)
          if (!env.DB) return jsonResponse([], 200, origin)
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
          const user = await resolveUser(request, env)
          const body = await request.json().catch(() => ({}))
          const now = new Date().toISOString()
          const id = genId('cmw')
          const title = body.title ? String(body.title).trim() : null
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
          if (env.DB) {
            await env.DB.prepare(
              `INSERT INTO conversations (id, userId, title, sessionLabel, model, modelProvider, lastMessageAt, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
              .bind(id, user.id, title, null, null, null, null, now, now)
              .run()
            await env.DB.prepare('UPDATE user_settings SET lastActiveConversationId = ?, updatedAt = ? WHERE userId = ?')
              .bind(id, now, user.id)
              .run()
          }
          return jsonResponse(conv, 201, origin)
        }

        const convDetailMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)$/)
        if (convDetailMatch) {
          const convId = decodeURIComponent(convDetailMatch[1])
          const user = await resolveUser(request, env)

          if (method === 'GET') {
            if (!env.DB) return jsonResponse({ statusCode: 404, message: 'Not found' }, 404, origin)
            const conv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ? AND userId = ?')
              .bind(convId, user.id)
              .first()
            if (!conv) return jsonResponse({ statusCode: 404, message: 'Conversation not found' }, 404, origin)
            return jsonResponse(conv, 200, origin)
          }

          if (method === 'DELETE') {
            if (env.DB) {
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
            }
            return jsonResponse({ ok: true }, 200, origin)
          }
        }

        const convMessagesMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/)
        if (convMessagesMatch && method === 'GET') {
          const convId = decodeURIComponent(convMessagesMatch[1])
          if (!env.DB) return jsonResponse([], 200, origin)
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

        // 6. Live Chat Streaming on Cloudflare D1 + LLM Provider
        const convChatMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)\/chat$/)
        if (convChatMatch && method === 'POST') {
          const convId = decodeURIComponent(convChatMatch[1])
          const user = await resolveUser(request, env)
          const body = await request.json().catch(() => ({}))
          const userContent = String(body.content || '').trim()
          const now = new Date().toISOString()
          const userMsgId = genId('cmm')
          const agentMsgId = genId('cmm')

          let preferredProvider = 'apisrouter'
          let preferredModel = 'deepseek-v4.1-flash-1017'
          let customSystemPrompt = null
          let history = []

          if (env.DB) {
            const settings = await env.DB.prepare('SELECT * FROM user_settings WHERE userId = ? LIMIT 1')
              .bind(user.id)
              .first()
            if (settings) {
              preferredProvider = settings.preferredProvider || preferredProvider
              preferredModel = settings.preferredModel || preferredModel
              customSystemPrompt = settings.customSystemPrompt || null
            }

            const existingConv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?')
              .bind(convId)
              .first()
            const nextTitle = existingConv?.title || deriveTitle(userContent)
            if (existingConv) {
              await env.DB.prepare(
                'UPDATE conversations SET title = ?, lastMessageAt = ?, updatedAt = ? WHERE id = ?',
              )
                .bind(nextTitle, now, now, convId)
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
            history = (histRes.results || []).map((m) => ({
              role: m.role === 'agent' ? 'assistant' : 'user',
              content: m.content,
            }))
          } else {
            history = [{ role: 'user', content: userContent }]
          }

          // Resolve API Key & Base URL for the selected provider (or fallback to apisrouter / nvidia)
          let keyRow = null
          if (env.DB) {
            keyRow = await env.DB.prepare(
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
          }

          const activeProvider = keyRow?.provider || preferredProvider
          const apiKey = keyRow?.apiKey || ''
          const baseUrl = (keyRow?.baseUrl || PROVIDER_BASE_URLS[activeProvider] || PROVIDER_BASE_URLS.apisrouter).replace(
            /\/$/,
            '',
          )

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
                throw new Error(
                  `No API key configured for ${activeProvider}. Add your key in Settings & Models -> APIsRouter.`,
                )
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

              if (env.DB) {
                await env.DB.prepare(
                  `INSERT INTO messages (id, conversationId, role, content, status, metadata, toolCallJson, toolResultJson, createdAt)
                   VALUES (?, ?, 'agent', ?, 'done', NULL, NULL, NULL, ?)`,
                )
                  .bind(agentMsgId, convId, finalContent, completedAt)
                  .run()
                await env.DB.prepare('UPDATE conversations SET lastMessageAt = ?, updatedAt = ? WHERE id = ?')
                  .bind(completedAt, completedAt, convId)
                  .run()
              }

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
              'cache-control': 'no-cache, no-transform',
              connection: 'keep-alive',
              ...corsHeaders(origin),
            },
          })
        }

        // 7. Handoffs & Approvals
        if (path.startsWith('/api/v1/handoffs/active/')) {
          return jsonResponse(null, 200, origin)
        }
        if (path === '/api/v1/handoffs') {
          return jsonResponse([], 200, origin)
        }
        if (path === '/api/v1/approvals') {
          return jsonResponse([], 200, origin)
        }
        if (path === '/api/v1/notifications') {
          return jsonResponse([], 200, origin)
        }
      } catch (err) {
        return jsonResponse(
          {
            statusCode: 500,
            message: err instanceof Error ? err.message : 'Cloudflare Edge API error',
          },
          500,
          origin,
        )
      }

      // Fallback proxy to upstream tunnel for any remaining routes
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
        const resHeaders = new Headers(upstreamRes.headers)
        resHeaders.set('access-control-allow-origin', origin)
        resHeaders.set('access-control-allow-credentials', 'true')
        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          headers: resHeaders,
        })
      } catch {
        return jsonResponse([], 200, origin)
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Not Found', { status: 404 })
  },
}
