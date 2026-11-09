// Media routes for the OpenAgents Cloudflare Worker:
//  • Realistic avatars (R2 storage, signed media URLs, APIsRouter video generation)
//  • Neural TTS (Fish Audio / ElevenLabs) using each user's own encrypted keys
//
// Helpers are injected from cf-worker.mjs to avoid circular imports.

import {
  checkTtsQuota,
  checkAvatarGenQuota,
  checkAvatarCount,
  checkStorageQuota,
  trackObject,
  untrackObject,
  untrackPrefix,
} from './worker-limits.mjs'

/** Likeness/voice consent: `?consent=1|true|preset` or header `x-likeness-consent: true`. Reuse for voice clone. */
export function hasConsent(request, url, body) {
  const q = String(url.searchParams.get('consent') || '').toLowerCase()
  const hdr = String(request.headers.get('x-likeness-consent') || '').toLowerCase()
  return ['1', 'true', 'preset'].includes(q) || hdr === 'true' || hdr === '1' || body?.consent === true
}

const AVATAR_SLOTS = ['portrait', 'idle', 'listening', 'thinking', 'talking', 'talking_alt']
const CLIP_SLOTS = ['idle', 'listening', 'thinking', 'talking', 'talking_alt']
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
const ALLOWED_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

// Multi-angle shot list used when generating clips from a portrait.
const SHOT_PROMPTS = {
  idle:
    'Front-facing medium close-up, natural soft studio light, the person looks at the camera with a calm friendly expression, subtle breathing, natural blinks, tiny head movements. Static camera, photorealistic, seamless loop, no talking.',
  listening:
    'Slight three-quarter angle from the left, the person attentively listens, gentle nods, small smile, natural blinks, eyes on the viewer. Static camera, photorealistic, seamless loop, mouth closed.',
  thinking:
    'Front angle, the person glances slightly up and to the side as if thinking, subtle eyebrow movement, then back to the camera. Static camera, photorealistic, seamless loop, mouth closed.',
  talking:
    'Front-facing close-up, the person speaks warmly and naturally to the camera with clear natural mouth movement, expressive but subtle hand-free gestures, natural blinks. Static camera, photorealistic, seamless loop.',
  talking_alt:
    'Slight three-quarter angle from the right, the person continues speaking naturally to the viewer with clear mouth movement and small head motion. Static camera, photorealistic, seamless loop.',
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS avatars (
     id TEXT PRIMARY KEY,
     userId TEXT NOT NULL,
     name TEXT NOT NULL,
     description TEXT,
     media TEXT NOT NULL DEFAULT '{}',
     jobs TEXT NOT NULL DEFAULT '{}',
     voiceProvider TEXT,
     voiceId TEXT,
     isActive INTEGER NOT NULL DEFAULT 0,
     createdAt TEXT NOT NULL,
     updatedAt TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tts_config (
     userId TEXT PRIMARY KEY,
     provider TEXT,
     elevenlabsKey TEXT,
     elevenlabsVoice TEXT,
     fishKey TEXT,
     fishVoice TEXT,
     updatedAt TEXT NOT NULL
   )`,
]

let mediaSchemaReady = false

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function signMediaUrl(env, host, key, ttlSeconds = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const sig = await hmacHex(env.JWT_SECRET || env.KEY_ENCRYPTION_SECRET, `${key}:${exp}`)
  return `https://${host}/api/v1/media/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`
}

function parseJson(v, fallback) {
  try {
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

async function avatarToDto(env, host, row) {
  const media = parseJson(row.media, {})
  const urls = {}
  for (const slot of AVATAR_SLOTS) {
    if (media[slot]?.key) urls[slot] = { url: await signMediaUrl(env, host, media[slot].key), mime: media[slot].mime }
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    media: urls,
    jobs: parseJson(row.jobs, {}),
    voiceProvider: row.voiceProvider || null,
    voiceId: row.voiceId || null,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
  }
}

async function getTtsConfig(env, h, userId) {
  const row = await env.DB.prepare('SELECT * FROM tts_config WHERE userId = ?').bind(userId).first()
  return {
    provider: row?.provider || null,
    elevenlabsKey: row?.elevenlabsKey ? await h.decryptSecret(env, row.elevenlabsKey) : null,
    elevenlabsVoice: row?.elevenlabsVoice || '21m00Tcm4TlvDq8ikWAM',
    fishKey: row?.fishKey ? await h.decryptSecret(env, row.fishKey) : null,
    fishVoice: row?.fishVoice || '',
  }
}

async function synthesizeSpeech(cfg, text, opts = {}) {
  const provider = opts.provider || cfg.provider || (cfg.fishKey ? 'fish' : cfg.elevenlabsKey ? 'elevenlabs' : null)
  if (provider === 'elevenlabs' && cfg.elevenlabsKey) {
    const voiceId = opts.voiceId || cfg.elevenlabsVoice
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': cfg.elevenlabsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
    })
    if (!res.ok) throw Object.assign(new Error(`ElevenLabs returned HTTP ${res.status}`), { status: res.status })
    return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: 'audio/mpeg', provider, voiceId }
  }
  if (provider === 'fish' && cfg.fishKey) {
    const voiceId = opts.voiceId || cfg.fishVoice || undefined
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.fishKey}`, 'Content-Type': 'application/json', model: 's1' },
      body: JSON.stringify({ text, format: 'mp3', ...(voiceId ? { reference_id: voiceId } : {}) }),
    })
    if (!res.ok) throw Object.assign(new Error(`Fish Audio returned HTTP ${res.status}`), { status: res.status })
    return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: 'audio/mpeg', provider, voiceId: voiceId || 'default' }
  }
  return null
}

async function getApisrouterKey(env, h, userId) {
  const keys = await h.getUserApiKeyCandidates(env, userId, 'apisrouter')
  return keys[0] || null
}

async function copyRemoteToR2(env, url, headers, key) {
  const res = await fetch(url, { headers })
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`)
  const mime = (res.headers.get('content-type') || 'video/mp4').split(';')[0]
  await env.AVATARS.put(key, res.body, { httpMetadata: { contentType: mime } })
  return mime
}

/**
 * Returns a Response if the route was handled, otherwise null.
 * ctx: { request, env, url, path, method, origin, user|null, h }
 */
export async function handleMediaRoutes(ctx) {
  const { request, env, url, path, method, origin, user, h } = ctx
  const json = (data, status = 200) => h.jsonResponse(data, status, origin)

  if (!mediaSchemaReady && env.DB) {
    for (const sql of SCHEMA) await env.DB.prepare(sql).run()
    mediaSchemaReady = true
  }

  // ── Public signed media (video/img tags can't send bearer tokens) ──
  const mediaMatch = path.match(/^\/api\/v1\/media\/(.+)$/)
  if (mediaMatch && (method === 'GET' || method === 'HEAD')) {
    if (!env.AVATARS) return new Response('Storage unavailable', { status: 503 })
    const key = decodeURIComponent(mediaMatch[1])
    const exp = Number(url.searchParams.get('exp') || 0)
    const sig = url.searchParams.get('sig') || ''
    if (!exp || exp < Math.floor(Date.now() / 1000)) return new Response('Link expired', { status: 403 })
    const expected = await hmacHex(env.JWT_SECRET || env.KEY_ENCRYPTION_SECRET, `${key}:${exp}`)
    if (!h.timingSafeEqualStr(expected, sig)) return new Response('Forbidden', { status: 403 })

    const range = request.headers.get('range')
    const obj = await env.AVATARS.get(key, range ? { range: request.headers } : undefined)
    if (!obj) return new Response('Not found', { status: 404 })
    const headers = new Headers()
    obj.writeHttpMetadata(headers)
    headers.set('etag', obj.httpEtag)
    headers.set('accept-ranges', 'bytes')
    headers.set('cache-control', 'private, max-age=3600')
    headers.set('x-content-type-options', 'nosniff')
    if (range && obj.range) {
      const start = obj.range.offset ?? 0
      const end = start + (obj.range.length ?? obj.size) - 1
      headers.set('content-range', `bytes ${start}-${end}/${obj.size}`)
      headers.set('content-length', String(end - start + 1))
      return new Response(method === 'HEAD' ? null : obj.body, { status: 206, headers })
    }
    headers.set('content-length', String(obj.size))
    return new Response(method === 'HEAD' ? null : obj.body, { status: 200, headers })
  }

  if (!user) return null
  const isAvatarRoute = path.startsWith('/api/v1/avatars')
  const isTtsRoute = path.startsWith('/api/v1/life/tts')
  if (!isAvatarRoute && !isTtsRoute) return null

  // ── Neural TTS (cloud, per-user keys) ──
  if (path === '/api/v1/life/tts/status' && method === 'GET') {
    const cfg = await getTtsConfig(env, h, user.id)
    const provider = cfg.provider || (cfg.fishKey ? 'fish' : cfg.elevenlabsKey ? 'elevenlabs' : null)
    return json({
      provider,
      configured: Boolean(cfg.fishKey || cfg.elevenlabsKey),
      source: cfg.fishKey || cfg.elevenlabsKey ? 'user' : 'none',
      elevenlabs: Boolean(cfg.elevenlabsKey),
      fish: Boolean(cfg.fishKey),
      defaultVoice: provider === 'elevenlabs' ? cfg.elevenlabsVoice : cfg.fishVoice,
    })
  }

  if (path === '/api/v1/life/tts/config' && method === 'GET') {
    const cfg = await getTtsConfig(env, h, user.id)
    return json({
      provider: cfg.provider,
      elevenlabsVoice: cfg.elevenlabsVoice,
      fishVoice: cfg.fishVoice,
      hasElevenlabsKey: Boolean(cfg.elevenlabsKey),
      hasFishKey: Boolean(cfg.fishKey),
      envElevenlabs: false,
      envFish: false,
    })
  }

  if (path === '/api/v1/life/tts/config' && (method === 'PUT' || method === 'POST')) {
    const body = await request.json().catch(() => ({}))
    const row = await env.DB.prepare('SELECT * FROM tts_config WHERE userId = ?').bind(user.id).first()
    const enc = async (incoming, existing) => {
      if (incoming === null || incoming === '') return null
      if (typeof incoming === 'string' && incoming.trim()) return h.encryptSecret(env, incoming.trim().slice(0, 300))
      return existing ?? null
    }
    const next = {
      provider: body.provider !== undefined ? (['fish', 'elevenlabs'].includes(body.provider) ? body.provider : null) : row?.provider ?? null,
      elevenlabsKey: await enc(body.elevenlabsKey, row?.elevenlabsKey),
      elevenlabsVoice: body.elevenlabsVoice !== undefined ? String(body.elevenlabsVoice).slice(0, 80) : row?.elevenlabsVoice ?? null,
      fishKey: await enc(body.fishKey, row?.fishKey),
      fishVoice: body.fishVoice !== undefined ? String(body.fishVoice).slice(0, 80) : row?.fishVoice ?? null,
    }
    await env.DB.prepare(
      `INSERT OR REPLACE INTO tts_config (userId, provider, elevenlabsKey, elevenlabsVoice, fishKey, fishVoice, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(user.id, next.provider, next.elevenlabsKey, next.elevenlabsVoice, next.fishKey, next.fishVoice, new Date().toISOString())
      .run()
    return json({ saved: true })
  }

  if (path === '/api/v1/life/tts/voices' && method === 'GET') {
    const cfg = await getTtsConfig(env, h, user.id)
    if (!cfg.elevenlabsKey) return json([])
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': cfg.elevenlabsKey } }).catch(() => null)
    if (!res || !res.ok) return json([])
    const data = await res.json().catch(() => ({}))
    return json((data.voices || []).map((v) => ({ id: v.voice_id, name: v.name, provider: 'elevenlabs', labels: v.labels || {} })))
  }

  if (path === '/api/v1/life/tts/fish/voices' && method === 'GET') {
    const cfg = await getTtsConfig(env, h, user.id)
    if (!cfg.fishKey) return json({ curated: [], live: [], hasKey: false })
    const toEntry = (m, source) => ({
      id: m._id,
      name: m.title || 'Untitled voice',
      gender: 'neutral',
      style: (m.tags || []).slice(0, 2).join(', ') || 'natural',
      accent: (m.languages || []).join(', ') || 'en',
      source,
    })
    const auth = { Authorization: `Bearer ${cfg.fishKey}` }
    const [mine, lib] = await Promise.all([
      fetch('https://api.fish.audio/model?self=true&page_size=50', { headers: auth }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch('https://api.fish.audio/model?page_size=30&sort_by=score&language=en', { headers: auth }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
    return json({
      curated: (lib.items || []).map((m) => toEntry(m, 'library')),
      live: (mine.items || []).map((m) => toEntry(m, 'mine')),
      hasKey: true,
    })
  }

  // ── Voice cloning with the user's own Fish Audio / ElevenLabs key ──
  if (path === '/api/v1/life/tts/clone' && method === 'POST') {
    const body = await request.json().catch(() => ({}))
    if (body.consent !== true) {
      return json({ statusCode: 400, message: 'Confirm you have the right and consent to clone this voice.' }, 400)
    }
    const name = String(body.name || 'My cloned voice').trim().slice(0, 60) || 'My cloned voice'
    const mimeType = String(body.mimeType || 'audio/webm').split(';')[0].slice(0, 40)
    if (!/^audio\/|^video\/webm$/.test(mimeType)) return json({ statusCode: 400, message: 'Unsupported audio type.' }, 400)
    let bytes
    try {
      const bin = atob(String(body.audioBase64 || '').replace(/^data:[^,]+,/, ''))
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } catch {
      return json({ statusCode: 400, message: 'Invalid audio data.' }, 400)
    }
    if (bytes.length < 8 * 1024) return json({ statusCode: 400, message: 'Recording is too short — record at least ~10 seconds.' }, 400)
    if (bytes.length > 15 * 1024 * 1024) return json({ statusCode: 413, message: 'Audio sample must be under 15 MB.' }, 413)
    if (await h.hitRateLimit(env, `tts-clone:day:${user.id}`, 5, 24 * 60 * 60 * 1000)) {
      return json({ statusCode: 429, message: 'Daily voice clone limit reached.' }, 429)
    }
    const cfg = await getTtsConfig(env, h, user.id)
    const provider =
      body.provider === 'elevenlabs' || body.provider === 'fish'
        ? body.provider
        : cfg.provider === 'elevenlabs' && cfg.elevenlabsKey
          ? 'elevenlabs'
          : cfg.fishKey
            ? 'fish'
            : cfg.elevenlabsKey
              ? 'elevenlabs'
              : null
    const ext = mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm'
    const file = new Blob([bytes], { type: mimeType })
    try {
      if (provider === 'fish' && cfg.fishKey) {
        const form = new FormData()
        form.append('type', 'tts')
        form.append('title', name)
        form.append('visibility', 'private')
        form.append('train_mode', 'fast')
        form.append('voices', file, `sample.${ext}`)
        const res = await fetch('https://api.fish.audio/model', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.fishKey}` },
          body: form,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data._id) {
          const msg = res.status === 401 || res.status === 403 ? 'Your Fish Audio key was rejected.' : String(data?.message || `Fish Audio returned HTTP ${res.status}`).slice(0, 200)
          return json({ statusCode: 502, message: msg }, 502)
        }
        return json({ voiceId: data._id, provider: 'fish', name })
      }
      if (provider === 'elevenlabs' && cfg.elevenlabsKey) {
        const form = new FormData()
        form.append('name', name)
        form.append('description', 'Cloned in OpenAgents Avatar Studio (owner consented).')
        form.append('files', file, `sample.${ext}`)
        const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: { 'xi-api-key': cfg.elevenlabsKey },
          body: form,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.voice_id) {
          const detail = data?.detail
          const msg =
            res.status === 401 || res.status === 403
              ? 'Your ElevenLabs key was rejected (or your plan does not include voice cloning).'
              : String((typeof detail === 'string' ? detail : detail?.message) || `ElevenLabs returned HTTP ${res.status}`).slice(0, 200)
          return json({ statusCode: 502, message: msg }, 502)
        }
        return json({ voiceId: data.voice_id, provider: 'elevenlabs', name })
      }
    } catch (err) {
      return json({ statusCode: 502, message: String(err?.message || 'Voice cloning failed').slice(0, 200) }, 502)
    }
    return json({ statusCode: 400, message: 'Add a Fish Audio or ElevenLabs key in Voice Settings to clone a voice.' }, 400)
  }

  if (path === '/api/v1/life/tts' && method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const text = String(body.text || '').trim().slice(0, 1500)
    if (!text) return json({ statusCode: 400, message: 'Text is required.' }, 400)
    if (await h.hitRateLimit(env, `tts:min:${user.id}`, 40, 60 * 1000)) {
      return json({ statusCode: 429, message: 'Too many voice requests. Slow down a little.' }, 429)
    }
    const ttsQuota = await checkTtsQuota(env, user.id)
    if (ttsQuota) return json({ statusCode: 429, message: ttsQuota }, 429)
    const cfg = await getTtsConfig(env, h, user.id)
    try {
      const out = await synthesizeSpeech(cfg, text, { provider: body.provider, voiceId: body.voiceId })
      if (!out) return json({ statusCode: 400, message: 'Add a Fish Audio or ElevenLabs key in Voice Settings.' }, 400)
      return json({ audioBase64: bytesToBase64(out.bytes), mimeType: out.mimeType, provider: out.provider, voiceId: out.voiceId, cached: false })
    } catch (err) {
      const status = err?.status === 401 || err?.status === 403 ? 400 : 502
      return json({ statusCode: status, message: err?.status === 401 ? 'Your voice API key was rejected. Update it in Voice Settings.' : String(err?.message || 'Voice synthesis failed') }, status)
    }
  }

  // ── Avatars ──
  if (!env.AVATARS) return json({ statusCode: 503, message: 'Avatar storage is not configured.' }, 503)

  if (path === '/api/v1/avatars' && method === 'GET') {
    const res = await env.DB.prepare('SELECT * FROM avatars WHERE userId = ? ORDER BY createdAt DESC').bind(user.id).all()
    const list = []
    for (const row of res.results || []) list.push(await avatarToDto(env, url.host, row))
    return json(list)
  }

  if (path === '/api/v1/avatars' && method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM avatars WHERE userId = ?').bind(user.id).first()
    const countQuota = await checkAvatarCount(env, user.id)
    if (countQuota) return json({ statusCode: 429, message: countQuota }, 429)
    const now = new Date().toISOString()
    const id = h.genId('cma')
    await env.DB.prepare(
      `INSERT INTO avatars (id, userId, name, description, media, jobs, voiceProvider, voiceId, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, '{}', '{}', ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        user.id,
        String(body.name || 'My Avatar').trim().slice(0, 60),
        String(body.description || '').trim().slice(0, 600),
        body.voiceProvider ? String(body.voiceProvider).slice(0, 20) : null,
        body.voiceId ? String(body.voiceId).slice(0, 80) : null,
        Number(count?.n || 0) === 0 ? 1 : 0,
        now,
        now,
      )
      .run()
    const row = await env.DB.prepare('SELECT * FROM avatars WHERE id = ?').bind(id).first()
    return json(await avatarToDto(env, url.host, row), 201)
  }

  const avatarMatch = path.match(/^\/api\/v1\/avatars\/([^/]+)(?:\/(upload|activate|generate|generate-status|variation))?$/)
  if (!avatarMatch) return null
  const avatarId = decodeURIComponent(avatarMatch[1])
  const action = avatarMatch[2] || null
  const row = await env.DB.prepare('SELECT * FROM avatars WHERE id = ? AND userId = ?').bind(avatarId, user.id).first()
  if (!row) return json({ statusCode: 404, message: 'Avatar not found' }, 404)
  const media = parseJson(row.media, {})
  const jobs = parseJson(row.jobs, {})
  const save = async () => {
    await env.DB.prepare('UPDATE avatars SET media = ?, jobs = ?, updatedAt = ? WHERE id = ?')
      .bind(JSON.stringify(media), JSON.stringify(jobs), new Date().toISOString(), avatarId)
      .run()
    const fresh = await env.DB.prepare('SELECT * FROM avatars WHERE id = ?').bind(avatarId).first()
    return avatarToDto(env, url.host, fresh)
  }

  if (!action && (method === 'PATCH' || method === 'PUT')) {
    const body = await request.json().catch(() => ({}))
    await env.DB.prepare('UPDATE avatars SET name = ?, description = ?, voiceProvider = ?, voiceId = ?, updatedAt = ? WHERE id = ?')
      .bind(
        body.name !== undefined ? String(body.name).trim().slice(0, 60) : row.name,
        body.description !== undefined ? String(body.description).trim().slice(0, 600) : row.description,
        body.voiceProvider !== undefined ? (body.voiceProvider ? String(body.voiceProvider).slice(0, 20) : null) : row.voiceProvider,
        body.voiceId !== undefined ? (body.voiceId ? String(body.voiceId).slice(0, 80) : null) : row.voiceId,
        new Date().toISOString(),
        avatarId,
      )
      .run()
    return json(await save())
  }

  if (!action && method === 'DELETE') {
    const listed = await env.AVATARS.list({ prefix: `users/${user.id}/avatars/${avatarId}/` })
    for (const obj of listed.objects) await env.AVATARS.delete(obj.key)
    await untrackPrefix(env, user.id, `users/${user.id}/avatars/${avatarId}/`)
    await env.DB.prepare('DELETE FROM avatars WHERE id = ?').bind(avatarId).run()
    return json({ ok: true })
  }

  if (action === 'activate' && method === 'POST') {
    await env.DB.prepare('UPDATE avatars SET isActive = 0 WHERE userId = ?').bind(user.id).run()
    await env.DB.prepare('UPDATE avatars SET isActive = 1 WHERE id = ?').bind(avatarId).run()
    return json(await save())
  }

  // Upload own photo or clip: POST /avatars/:id/upload?slot=portrait|idle|... (raw body)
  if (action === 'upload' && method === 'POST') {
    const slot = url.searchParams.get('slot') || ''
    if (!AVATAR_SLOTS.includes(slot)) return json({ statusCode: 400, message: 'Invalid slot.' }, 400)
    const mime = (request.headers.get('content-type') || '').split(';')[0].toLowerCase()
    const ext = ALLOWED_MIME[mime]
    if (!ext) return json({ statusCode: 400, message: 'Upload a JPG, PNG, WebP, MP4 or WebM file.' }, 400)
    if (slot === 'portrait' && !mime.startsWith('image/')) return json({ statusCode: 400, message: 'Portrait must be an image.' }, 400)
    if (slot !== 'portrait' && !mime.startsWith('video/')) return json({ statusCode: 400, message: 'Clips must be MP4 or WebM video.' }, 400)
    if (slot === 'portrait' && !hasConsent(request, url)) {
      return json({ statusCode: 400, message: 'Please confirm you own this likeness or have permission to use it.' }, 400)
    }
    const len = Number(request.headers.get('content-length') || 0)
    if (len > MAX_UPLOAD_BYTES) return json({ statusCode: 413, message: 'File too large (max 30 MB).' }, 413)
    const buf = await request.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_UPLOAD_BYTES) return json({ statusCode: 413, message: 'File is empty or too large (max 30 MB).' }, 413)
    const storageQuota = await checkStorageQuota(env, user.id, buf.byteLength)
    if (storageQuota) return json({ statusCode: 429, message: storageQuota }, 429)
    if (media[slot]?.key) {
      await env.AVATARS.delete(media[slot].key).catch(() => {})
      await untrackObject(env, media[slot].key)
    }
    const key = `users/${user.id}/avatars/${avatarId}/${slot}-${Date.now()}.${ext}`
    await env.AVATARS.put(key, buf, { httpMetadata: { contentType: mime } })
    await trackObject(env, user.id, key, buf.byteLength)
    media[slot] = { key, mime }
    delete jobs[slot]
    return json(await save())
  }

  // Outfit / background variation of the portrait → saved as a NEW avatar (APIsRouter image model)
  if (action === 'variation' && method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const prompt = String(body.prompt || '').trim().slice(0, 400)
    if (!prompt) return json({ statusCode: 400, message: 'Describe the outfit or background, e.g. "business suit, office background".' }, 400)
    if (!media.portrait?.key) return json({ statusCode: 400, message: 'Upload or pick a portrait photo first.' }, 400)
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM avatars WHERE userId = ?').bind(user.id).first()
    if (Number(count?.n || 0) >= 10) return json({ statusCode: 400, message: 'Maximum of 10 avatars — delete one to save a variation.' }, 400)
    const key = await getApisrouterKey(env, h, user.id)
    if (!key) return json({ statusCode: 400, message: 'Add your APIsRouter key in AI Models & Keys to generate variations.' }, 400)
    if (await h.hitRateLimit(env, `avatar-var:day:${user.id}`, 30, 24 * 60 * 60 * 1000)) {
      return json({ statusCode: 429, message: 'Daily variation limit reached.' }, 429)
    }
    let base
    try {
      base = h.validateSafeLlmBaseUrl(key.baseUrl || 'https://apisrouter.dev/v1', 'apisrouter')
    } catch {
      base = 'https://apisrouter.dev/v1'
    }
    const model = String(body.model || 'gpt-image-1').slice(0, 80)
    const portraitObj = await env.AVATARS.get(media.portrait.key)
    if (!portraitObj) return json({ statusCode: 400, message: 'Portrait file missing - re-upload it.' }, 400)
    const portraitBytes = new Uint8Array(await portraitObj.arrayBuffer())
    const fullPrompt = `Same exact person, same face, identity, skin tone and hairstyle as the reference photo. Change only the outfit and background: ${prompt}. Photorealistic portrait, vertical 9:16 framing, head and shoulders, natural lighting.`
    const auth = { Authorization: `Bearer ${key.apiKey}` }

    const readImage = async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          res.status === 401 || res.status === 403
            ? 'Your APIsRouter key was rejected.'
            : res.status === 404
              ? 'Image generation is not available on your APIsRouter plan/endpoint.'
              : String(data?.error?.message || data?.message || `HTTP ${res.status}`).slice(0, 200)
        return { error: msg, status: res.status }
      }
      const item = data?.data?.[0] || {}
      if (item.b64_json) {
        const bin = atob(item.b64_json)
        const out = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
        return { bytes: out, mime: 'image/png' }
      }
      if (item.url) {
        const img = await fetch(item.url).catch(() => null)
        if (img && img.ok) return { bytes: new Uint8Array(await img.arrayBuffer()), mime: (img.headers.get('content-type') || 'image/png').split(';')[0] }
      }
      return { error: 'The image model returned no image.' }
    }

    let result
    try {
      // Prefer an edit of the real portrait (identity-preserving); fall back to text generation.
      const form = new FormData()
      form.append('model', model)
      form.append('prompt', fullPrompt)
      form.append('size', '1024x1536')
      form.append('n', '1')
      form.append('image', new Blob([portraitBytes], { type: media.portrait.mime || 'image/png' }), 'portrait.png')
      const editRes = await fetch(`${base}/images/edits`, { method: 'POST', headers: auth, body: form })
      result = await readImage(editRes)
      if (result.error && [400, 404, 405, 415, 422].includes(result.status)) {
        const genRes = await fetch(`${base}/images/generations`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: `${fullPrompt}${row.description ? ` Person: ${row.description}.` : ''}`,
            size: '1024x1536',
            n: 1,
          }),
        })
        const gen = await readImage(genRes)
        if (!gen.error) result = gen
      }
    } catch (err) {
      result = { error: String(err?.message || 'Network error').slice(0, 200) }
    }
    if (!result?.bytes) return json({ statusCode: 502, message: result?.error || 'Variation failed.' }, 502)

    const now = new Date().toISOString()
    const newId = h.genId('cma')
    const ext = result.mime.includes('jpeg') ? 'jpg' : result.mime.includes('webp') ? 'webp' : 'png'
    const r2Key = `users/${user.id}/avatars/${newId}/portrait-${Date.now()}.${ext}`
    await env.AVATARS.put(r2Key, result.bytes, { httpMetadata: { contentType: result.mime } })
    const shortLabel = prompt.split(',')[0].slice(0, 24)
    await env.DB.prepare(
      `INSERT INTO avatars (id, userId, name, description, media, jobs, voiceProvider, voiceId, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?, 0, ?, ?)`,
    )
      .bind(
        newId,
        user.id,
        `${row.name} · ${shortLabel}`.slice(0, 60),
        String(row.description || '').slice(0, 600),
        JSON.stringify({ portrait: { key: r2Key, mime: result.mime } }),
        row.voiceProvider || null,
        row.voiceId || null,
        now,
        now,
      )
      .run()
    const created = await env.DB.prepare('SELECT * FROM avatars WHERE id = ?').bind(newId).first()
    return json(await avatarToDto(env, url.host, created), 201)
  }

  // Generate multi-angle clips from the portrait with the user's APIsRouter key
  if (action === 'generate' && method === 'POST') {
    const body = await request.json().catch(() => ({}))
    if (!media.portrait?.key) return json({ statusCode: 400, message: 'Upload or pick a portrait photo first.' }, 400)
    const key = await getApisrouterKey(env, h, user.id)
    if (!key) return json({ statusCode: 400, message: 'Add your APIsRouter key in AI Models & Keys to generate avatar videos.' }, 400)
    if (await h.hitRateLimit(env, `avatar-gen:day:${user.id}`, 30, 24 * 60 * 60 * 1000)) {
      return json({ statusCode: 429, message: 'Daily avatar generation limit reached.' }, 429)
    }
    const genQuota = (await checkStorageQuota(env, user.id, 0)) || (await checkAvatarGenQuota(env, user.id))
    if (genQuota) return json({ statusCode: 429, message: genQuota }, 429)
    const slots = (Array.isArray(body.slots) ? body.slots : CLIP_SLOTS).filter((s) => CLIP_SLOTS.includes(s))
    const model = String(body.model || 'veo-3.1').slice(0, 80)
    const base = h.validateSafeLlmBaseUrl(key.baseUrl, 'apisrouter')
    const portraitObj = await env.AVATARS.get(media.portrait.key)
    if (!portraitObj) return json({ statusCode: 400, message: 'Portrait file missing — re-upload it.' }, 400)
    const portraitB64 = bytesToBase64(new Uint8Array(await portraitObj.arrayBuffer()))
    const portraitDataUrl = `data:${media.portrait.mime};base64,${portraitB64}`
    const persona = row.description ? ` Character: ${row.description}.` : ''

    for (const slot of slots) {
      const res = await fetch(`${base}/videos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `${SHOT_PROMPTS[slot]}${persona} Keep the exact same person, face, hair and outfit as the reference image.`,
          image: portraitDataUrl,
          input_reference: portraitDataUrl,
          duration: slot.startsWith('talking') ? 6 : 5,
          aspect_ratio: '9:16',
          resolution: '720p',
        }),
      }).catch(() => null)
      const data = res ? await res.json().catch(() => ({})) : {}
      if (res && res.ok && (data.id || data.job_id)) {
        jobs[slot] = { jobId: data.id || data.job_id, status: 'queued', model, startedAt: Date.now() }
      } else {
        const msg =
          res?.status === 404
            ? 'Video generation is not available on your APIsRouter plan/endpoint yet.'
            : res?.status === 401 || res?.status === 403
              ? 'Your APIsRouter key was rejected.'
              : String(data?.error?.message || data?.message || (res ? `HTTP ${res.status}` : 'Network error')).slice(0, 200)
        jobs[slot] = { status: 'failed', error: msg, model }
      }
    }
    return json(await save())
  }

  // Poll provider jobs, copy finished videos into R2
  if (action === 'generate-status' && method === 'GET') {
    const key = await getApisrouterKey(env, h, user.id)
    const base = key ? h.validateSafeLlmBaseUrl(key.baseUrl, 'apisrouter') : null
    for (const slot of Object.keys(jobs)) {
      const job = jobs[slot]
      if (!job?.jobId || !['queued', 'processing', 'in_progress'].includes(job.status) || !key) continue
      if (Date.now() - (job.startedAt || 0) > 30 * 60 * 1000) {
        jobs[slot] = { ...job, status: 'failed', error: 'Timed out after 30 minutes.' }
        continue
      }
      const auth = { Authorization: `Bearer ${key.apiKey}` }
      const res = await fetch(`${base}/videos/${encodeURIComponent(job.jobId)}`, { headers: auth }).catch(() => null)
      if (!res || !res.ok) continue
      const data = await res.json().catch(() => ({}))
      const status = String(data.status || '').toLowerCase()
      if (['completed', 'succeeded', 'success', 'done'].includes(status)) {
        try {
          const downloadUrl = data.video_url || data.url || data.output?.[0]?.url || data.data?.[0]?.url || `${base}/videos/${encodeURIComponent(job.jobId)}/content`
          const external = !String(downloadUrl).startsWith(base)
          const r2Key = `users/${user.id}/avatars/${avatarId}/${slot}-${Date.now()}.mp4`
          const mime = await copyRemoteToR2(env, downloadUrl, external ? {} : auth, r2Key)
          const head = await env.AVATARS.head(r2Key).catch(() => null)
          await trackObject(env, user.id, r2Key, head?.size || 0)
          if (media[slot]?.key) {
            await env.AVATARS.delete(media[slot].key).catch(() => {})
            await untrackObject(env, media[slot].key)
          }
          media[slot] = { key: r2Key, mime: mime.startsWith('video/') ? mime : 'video/mp4' }
          jobs[slot] = { ...job, status: 'completed' }
        } catch (err) {
          jobs[slot] = { ...job, status: 'failed', error: String(err?.message || 'Download failed') }
        }
      } else if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        jobs[slot] = { ...job, status: 'failed', error: String(data.error?.message || data.error || 'Generation failed').slice(0, 200) }
      } else {
        jobs[slot] = { ...job, status: status || job.status, progress: data.progress ?? job.progress }
      }
    }
    return json(await save())
  }

  return null
}
