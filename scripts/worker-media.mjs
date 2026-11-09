// Media routes for the OpenAgents Cloudflare Worker:
//  • Realistic avatars (R2 storage, signed media URLs, APIsRouter video generation)
//  • Neural TTS (Fish Audio / ElevenLabs) using each user's own encrypted keys
//
// Helpers are injected from cf-worker.mjs to avoid circular imports.

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

  if (path === '/api/v1/life/tts' && method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const text = String(body.text || '').trim().slice(0, 1500)
    if (!text) return json({ statusCode: 400, message: 'Text is required.' }, 400)
    if (await h.hitRateLimit(env, `tts:min:${user.id}`, 40, 60 * 1000)) {
      return json({ statusCode: 429, message: 'Too many voice requests. Slow down a little.' }, 429)
    }
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
    if (Number(count?.n || 0) >= 10) return json({ statusCode: 400, message: 'Maximum of 10 avatars.' }, 400)
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

  const avatarMatch = path.match(/^\/api\/v1\/avatars\/([^/]+)(?:\/(upload|activate|generate|generate-status))?$/)
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
    const len = Number(request.headers.get('content-length') || 0)
    if (len > MAX_UPLOAD_BYTES) return json({ statusCode: 413, message: 'File too large (max 30 MB).' }, 413)
    const buf = await request.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_UPLOAD_BYTES) return json({ statusCode: 413, message: 'File is empty or too large (max 30 MB).' }, 413)
    if (media[slot]?.key) await env.AVATARS.delete(media[slot].key).catch(() => {})
    const key = `users/${user.id}/avatars/${avatarId}/${slot}-${Date.now()}.${ext}`
    await env.AVATARS.put(key, buf, { httpMetadata: { contentType: mime } })
    media[slot] = { key, mime }
    delete jobs[slot]
    return json(await save())
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
          if (media[slot]?.key) await env.AVATARS.delete(media[slot].key).catch(() => {})
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
