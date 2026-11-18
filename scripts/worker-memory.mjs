// Memory, Privacy Vault, Self-Improving Lessons, and Personal Knowledge Graph routes.
//
// Exported entry point:
//   export async function handleMemoryRoutes({ request, env, url, path, method, origin, user, h })
//
// All D1 tables are prefixed with `mem_` and created lazily on first request.
// Every query is strictly scoped to `user.id`. Pure Cloudflare Workers Web APIs only.

const VAULT_PREFIX = 'vault:v1:'
const MEMORY_TYPES = new Set(['fact', 'preference', 'summary'])
const MEMORY_EVENT_KINDS = new Set(['conversation', 'workflow', 'incident', 'extraction', 'note'])
const CONFLICT_STATUSES = new Set(['open', 'resolved', 'ignored'])
const SOURCE_KINDS = new Set(['file', 'folder', 'repo'])
const LESSON_KINDS = new Set(['do', 'avoid', 'preference'])
const GRAPH_ENTITY_TYPES = new Set(['person', 'project', 'company', 'topic', 'place'])

const CORE_RW_FILES = [
  {
    name: 'SOUL.md',
    content: '# SOUL\n\nDefine your agent identity, tone, and operating principles here.\n',
  },
  {
    name: 'USER.md',
    content: '# USER\n\nRecord your preferences, context, and standing instructions here.\n',
  },
  {
    name: 'MEMORY.md',
    content: '# MEMORY\n\nCurated long-term memory summary.\n',
  },
  {
    name: 'HEARTBEAT.md',
    content: '# HEARTBEAT\n\nPeriodic checks and recurring reminders.\n',
  },
]

const READONLY_FILES = new Set(['cron.json', 'JOURNAL.md'])
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]{1,120}$/

const DEFAULT_CONFIDENCE = 0.8
const LOW_CONFIDENCE_THRESHOLD = 0.45
const STALE_REVIEW_DAYS = 21
const DECAY_PRUNE_THRESHOLD = 0.04
const LESSONS_BLOCK_CHAR_CAP = 3200
const MAX_CONTENT_LEN = 8000
const MAX_FILE_LEN = 100000
const MAX_TAGS = 30

const SAFE_LLM_HOSTS = new Set([
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

const DEFAULT_PROVIDER_BASE_URLS = {
  apisrouter: 'https://apisrouter.dev/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  perplexity: 'https://api.perplexity.ai',
  nvidia: 'https://integrate.api.nvidia.com/v1',
}

let schemaReady = false

async function ensureMemorySchema(env) {
  if (schemaReady) return
  const stmts = [
    `CREATE TABLE IF NOT EXISTS mem_entries (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       type TEXT NOT NULL DEFAULT 'fact',
       content TEXT NOT NULL,
       tags TEXT NOT NULL DEFAULT '[]',
       pinned INTEGER NOT NULL DEFAULT 0,
       sensitive INTEGER NOT NULL DEFAULT 0,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_entries_user ON mem_entries(userId, updatedAt)`,
    `CREATE TABLE IF NOT EXISTS mem_events (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT 'note',
       summary TEXT NOT NULL,
       payload TEXT,
       sourceRef TEXT,
       tags TEXT NOT NULL DEFAULT '[]',
       piiRedacted INTEGER NOT NULL DEFAULT 0,
       confidence REAL NOT NULL DEFAULT 0.8,
       freshUntil TEXT,
       conflictGroup TEXT,
       reinforcedAt TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_events_user ON mem_events(userId, updatedAt)`,
    `CREATE TABLE IF NOT EXISTS mem_facts (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       entity TEXT NOT NULL,
       key TEXT NOT NULL,
       value TEXT NOT NULL,
       sourceRef TEXT,
       confidence REAL NOT NULL DEFAULT 0.8,
       freshUntil TEXT,
       conflictGroup TEXT,
       reinforcedAt TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL,
       UNIQUE(userId, entity, key)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_facts_user ON mem_facts(userId, updatedAt)`,
    `CREATE TABLE IF NOT EXISTS mem_conflicts (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       entity TEXT NOT NULL,
       key TEXT NOT NULL,
       existingValue TEXT NOT NULL,
       incomingValue TEXT NOT NULL,
       existingSourceRef TEXT,
       incomingSourceRef TEXT,
       status TEXT NOT NULL DEFAULT 'open',
       severity TEXT NOT NULL DEFAULT 'medium',
       confidenceDelta REAL NOT NULL DEFAULT 0,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL,
       resolvedAt TEXT
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_conflicts_user ON mem_conflicts(userId, status, updatedAt)`,
    `CREATE TABLE IF NOT EXISTS mem_files (
       userId TEXT NOT NULL,
       name TEXT NOT NULL,
       content TEXT NOT NULL DEFAULT '',
       readonly INTEGER NOT NULL DEFAULT 0,
       updatedAt TEXT NOT NULL,
       PRIMARY KEY (userId, name)
     )`,
    `CREATE TABLE IF NOT EXISTS mem_sources (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       path TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT 'folder',
       includeGlobs TEXT NOT NULL DEFAULT '[]',
       maxFiles INTEGER NOT NULL DEFAULT 50,
       status TEXT NOT NULL DEFAULT 'active',
       lastSyncedAt TEXT,
       lastError TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_sources_user ON mem_sources(userId, updatedAt)`,
    `CREATE TABLE IF NOT EXISTS mem_privacy_settings (
       userId TEXT PRIMARY KEY,
       localOnly INTEGER NOT NULL DEFAULT 0,
       localModel TEXT,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS mem_lessons (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       text TEXT NOT NULL,
       score INTEGER NOT NULL DEFAULT 50,
       kind TEXT NOT NULL DEFAULT 'do',
       enabled INTEGER NOT NULL DEFAULT 1,
       conversationId TEXT,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_lessons_user ON mem_lessons(userId, createdAt)`,
    `CREATE TABLE IF NOT EXISTS mem_lesson_runs (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       conversationId TEXT NOT NULL,
       score INTEGER NOT NULL DEFAULT 0,
       summary TEXT NOT NULL DEFAULT '',
       lastMessageAt TEXT,
       at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_lesson_runs_user ON mem_lesson_runs(userId, at)`,
    `CREATE TABLE IF NOT EXISTS mem_graph_nodes (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       normName TEXT NOT NULL,
       name TEXT NOT NULL,
       type TEXT NOT NULL DEFAULT 'topic',
       summary TEXT NOT NULL DEFAULT '',
       mentionCount INTEGER NOT NULL DEFAULT 1,
       mentions TEXT NOT NULL DEFAULT '[]',
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL,
       UNIQUE(userId, normName)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_graph_nodes_user ON mem_graph_nodes(userId, mentionCount)`,
    `CREATE TABLE IF NOT EXISTS mem_graph_edges (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       fromId TEXT NOT NULL,
       toId TEXT NOT NULL,
       relation TEXT NOT NULL DEFAULT 'related to',
       weight INTEGER NOT NULL DEFAULT 1,
       UNIQUE(userId, fromId, toId, relation)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_mem_graph_edges_user ON mem_graph_edges(userId)`,
    `CREATE TABLE IF NOT EXISTS mem_graph_state (
       userId TEXT PRIMARY KEY,
       lastRunAt TEXT,
       memoriesCursor TEXT,
       messagesCursor TEXT
     )`,
  ]
  for (const sql of stmts) {
    await env.DB.prepare(sql).run()
  }
  schemaReady = true
}

// ── Utilities ────────────────────────────────────────────────────────────────

function parseJson(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function parseTags(raw) {
  const arr = Array.isArray(raw) ? raw : parseJson(raw, [])
  if (!Array.isArray(arr)) return []
  return arr
    .map((t) => String(t ?? '').trim().slice(0, 64))
    .filter((t) => t && t !== '__pinned')
    .slice(0, MAX_TAGS)
}

function clampInt(val, min, max, fallback) {
  const n = Number.parseInt(String(val ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function clampConfidence(val, fallback = DEFAULT_CONFIDENCE) {
  const n = Number(val)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, Number(n.toFixed(4))))
}

function normText(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function tokenize(s) {
  return normText(s)
    .replace(/[^a-z0-9\s._-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
}

function isVaultEncrypted(val) {
  return typeof val === 'string' && val.startsWith(VAULT_PREFIX)
}

async function vaultEncrypt(env, h, plain) {
  if (isVaultEncrypted(plain)) return plain
  const enc = await h.encryptSecret(env, String(plain ?? ''))
  if (!enc) return plain
  return `${VAULT_PREFIX}${enc}`
}

async function vaultDecrypt(env, h, stored) {
  if (!isVaultEncrypted(stored)) return stored
  try {
    return await h.decryptSecret(env, stored.slice(VAULT_PREFIX.length))
  } catch {
    return null
  }
}

function computeEffectiveConfidence(confidence, updatedAt, reinforcedAt, freshUntil, decayDays = 30) {
  const base = clampConfidence(confidence, DEFAULT_CONFIDENCE)
  const now = Date.now()
  const anchorIso = reinforcedAt || updatedAt
  const anchorMs = anchorIso ? Date.parse(anchorIso) : now
  const ageDays = Number.isFinite(anchorMs) ? Math.max(0, (now - anchorMs) / (24 * 3600 * 1000)) : 0
  let effective = base * Math.exp(-ageDays / Math.max(3, decayDays))
  if (freshUntil) {
    const freshMs = Date.parse(freshUntil)
    if (Number.isFinite(freshMs) && freshMs < now) {
      effective *= 0.6
    }
  }
  return Number(Math.max(0, Math.min(1, effective)).toFixed(4))
}

function conflictSeverity(existingVal, incomingVal) {
  const a = normText(existingVal)
  const b = normText(incomingVal)
  if (!a || !b) return 'low'
  if (a.includes(b) || b.includes(a)) return 'low'
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  let overlap = 0
  for (const t of ta) if (tb.has(t)) overlap += 1
  const union = ta.size + tb.size - overlap
  const jaccard = union > 0 ? overlap / union : 0
  if (jaccard < 0.25) return 'high'
  if (jaccard < 0.6) return 'medium'
  return 'low'
}

function resolveFreshUntil(freshUntil, freshnessHours) {
  if (typeof freshUntil === 'string' && freshUntil.trim()) {
    const ms = Date.parse(freshUntil)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  const hours = Number(freshnessHours)
  if (Number.isFinite(hours) && hours >= 1 && hours <= 24 * 365) {
    return new Date(Date.now() + hours * 3600 * 1000).toISOString()
  }
  return null
}

function toEntryDto(row) {
  const encrypted = isVaultEncrypted(row.content) || Boolean(row.sensitive)
  return {
    id: row.id,
    userId: row.userId,
    type: MEMORY_TYPES.has(row.type) ? row.type : 'fact',
    content: encrypted ? '•••••••• (encrypted in Privacy Vault)' : row.content,
    tags: parseTags(row.tags),
    pinned: Boolean(row.pinned),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toEventDto(row, decayDays = 30) {
  return {
    id: row.id,
    userId: row.userId,
    kind: MEMORY_EVENT_KINDS.has(row.kind) ? row.kind : 'note',
    summary: row.summary,
    payload: parseJson(row.payload, null),
    sourceRef: row.sourceRef || null,
    tags: parseTags(row.tags),
    piiRedacted: Boolean(row.piiRedacted),
    confidence: clampConfidence(row.confidence),
    effectiveConfidence: computeEffectiveConfidence(
      row.confidence,
      row.updatedAt,
      row.reinforcedAt,
      row.freshUntil,
      decayDays,
    ),
    freshUntil: row.freshUntil || null,
    conflictGroup: row.conflictGroup || null,
    reinforcedAt: row.reinforcedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toFactDto(row, decayDays = 30) {
  return {
    id: row.id,
    userId: row.userId,
    entity: row.entity,
    key: row.key,
    value: row.value,
    sourceRef: row.sourceRef || null,
    confidence: clampConfidence(row.confidence),
    effectiveConfidence: computeEffectiveConfidence(
      row.confidence,
      row.updatedAt,
      row.reinforcedAt,
      row.freshUntil,
      decayDays,
    ),
    freshUntil: row.freshUntil || null,
    conflictGroup: row.conflictGroup || null,
    reinforcedAt: row.reinforcedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toConflictDto(row) {
  return {
    id: row.id,
    userId: row.userId,
    entity: row.entity,
    key: row.key,
    existingValue: row.existingValue,
    incomingValue: row.incomingValue,
    existingSourceRef: row.existingSourceRef || null,
    incomingSourceRef: row.incomingSourceRef || null,
    status: CONFLICT_STATUSES.has(row.status) ? row.status : 'open',
    severity: row.severity === 'high' || row.severity === 'low' ? row.severity : 'medium',
    confidenceDelta: Number(row.confidenceDelta) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt || null,
  }
}

function toSourceDto(row) {
  return {
    id: row.id,
    userId: row.userId,
    path: row.path,
    kind: SOURCE_KINDS.has(row.kind) ? row.kind : 'folder',
    includeGlobs: parseJson(row.includeGlobs, []),
    maxFiles: Number(row.maxFiles) || 50,
    status: row.status === 'error' ? 'error' : 'active',
    lastSyncedAt: row.lastSyncedAt || null,
    lastError: row.lastError || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toLessonDto(row) {
  return {
    id: row.id,
    text: row.text,
    score: Number(row.score) || 0,
    kind: LESSON_KINDS.has(row.kind) ? row.kind : 'do',
    enabled: Boolean(row.enabled),
    ...(row.conversationId ? { conversationId: row.conversationId } : {}),
    createdAt: row.createdAt,
  }
}

function toFileSummary(row) {
  const content = String(row.content ?? '')
  return {
    name: row.name,
    size: new TextEncoder().encode(content).byteLength,
    updatedAt: row.updatedAt,
    readonly: Boolean(row.readonly),
  }
}

function toFileDocument(row) {
  return {
    ...toFileSummary(row),
    content: String(row.content ?? ''),
  }
}

// ── PBKDF2 password verification (matches cf-worker.mjs) ─────────────────────

function hexToBytes(hex) {
  const clean = String(hex || '').trim()
  const out = new Uint8Array(Math.floor(clean.length / 2))
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
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
    return timingSafeEqualStr(bytesToHex(new Uint8Array(derivedBits)), expectedHex)
  } catch {
    return false
  }
}

// ── Optional LLM helper (uses user's configured key when available) ──────────

function safeLlmBaseUrl(rawUrl, provider) {
  const fallback = DEFAULT_PROVIDER_BASE_URLS[provider] || DEFAULT_PROVIDER_BASE_URLS.apisrouter
  if (!rawUrl || typeof rawUrl !== 'string') return fallback
  try {
    const u = new URL(rawUrl.trim())
    if (u.protocol !== 'https:') return fallback
    if (!SAFE_LLM_HOSTS.has(u.hostname.toLowerCase())) return fallback
    return u.toString().replace(/\/+$/, '')
  } catch {
    return fallback
  }
}

async function callUserLlmJson(env, h, userId, systemPrompt, userPrompt) {
  if (typeof h.getUserApiKeyCandidates !== 'function') return null
  try {
    const privacyRow = await env.DB.prepare('SELECT localOnly FROM mem_privacy_settings WHERE userId = ?')
      .bind(userId)
      .first()
      .catch(() => null)
    if (privacyRow && Boolean(privacyRow.localOnly)) return null

    const settings = await env.DB.prepare('SELECT preferredProvider, preferredModel FROM user_settings WHERE userId = ?')
      .bind(userId)
      .first()
      .catch(() => null)
    let provider = settings?.preferredProvider || 'apisrouter'
    let model = settings?.preferredModel || 'claude-sonnet-5.5'
    let keys = await h.getUserApiKeyCandidates(env, userId, provider).catch(() => [])
    if (!Array.isArray(keys) || keys.length === 0) {
      const anyKey = await env.DB.prepare(
        'SELECT provider FROM llm_keys WHERE userId = ? AND apiKey IS NOT NULL ORDER BY updatedAt DESC LIMIT 1',
      )
        .bind(userId)
        .first()
        .catch(() => null)
      if (anyKey?.provider) {
        provider = anyKey.provider
        keys = await h.getUserApiKeyCandidates(env, userId, provider).catch(() => [])
      }
    }
    if (!Array.isArray(keys) || keys.length === 0) return null
    if (provider === 'anthropic' || provider === 'google') return null

    const baseUrl = safeLlmBaseUrl(keys[0].baseUrl, provider)
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keys[0].apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 700,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null)
    if (!res || !res.ok) return null
    const data = await res.json().catch(() => null)
    const content = String(data?.choices?.[0]?.message?.content ?? '')
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    return JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
}

// ── Memory Files helpers ─────────────────────────────────────────────────────

async function ensureDefaultFiles(env, userId) {
  const now = new Date().toISOString()
  for (const f of CORE_RW_FILES) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mem_files (userId, name, content, readonly, updatedAt)
       VALUES (?, ?, ?, 0, ?)`,
    )
      .bind(userId, f.name, f.content, now)
      .run()
  }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO mem_files (userId, name, content, readonly, updatedAt)
     VALUES (?, 'cron.json', ?, 1, ?)`,
  )
    .bind(userId, JSON.stringify({ jobs: [], syncedAt: now }, null, 2), now)
    .run()
}

async function syncUserFiles(env, userId) {
  await ensureDefaultFiles(env, userId)
  const now = new Date().toISOString()
  const entriesRes = await env.DB.prepare(
    `SELECT type, content, pinned, sensitive, updatedAt FROM mem_entries
     WHERE userId = ? ORDER BY pinned DESC, updatedAt DESC LIMIT 50`,
  )
    .bind(userId)
    .all()
  const entries = (entriesRes.results || []).filter((e) => !e.sensitive && !isVaultEncrypted(e.content))

  if (entries.length > 0) {
    const lines = ['# MEMORY', '', `_Synced ${now}_`, '']
    for (const e of entries) {
      const prefix = e.pinned ? '[PINNED] ' : ''
      lines.push(`- (${e.type}) ${prefix}${String(e.content).replace(/\s+/g, ' ').slice(0, 280)}`)
    }
    const existingMem = await env.DB.prepare('SELECT content FROM mem_files WHERE userId = ? AND name = ?')
      .bind(userId, 'MEMORY.md')
      .first()
    if (!existingMem || String(existingMem.content).trim() === '# MEMORY\n\nCurated long-term memory summary.') {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO mem_files (userId, name, content, readonly, updatedAt)
         VALUES (?, 'MEMORY.md', ?, 0, ?)`,
      )
        .bind(userId, `${lines.join('\n')}\n`, now)
        .run()
    }
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO mem_files (userId, name, content, readonly, updatedAt)
     VALUES (?, 'cron.json', ?, 1, ?)`,
  )
    .bind(userId, JSON.stringify({ jobs: [], syncedAt: now }, null, 2), now)
    .run()
}

// ── Review Queue helper ──────────────────────────────────────────────────────

async function buildReviewQueue(env, userId, limit) {
  const safeLimit = clampInt(limit, 1, 100, 30)
  const staleCutoff = Date.now() - STALE_REVIEW_DAYS * 24 * 3600 * 1000
  const items = []

  const [conflictsRes, factsRes, eventsRes] = await Promise.all([
    env.DB.prepare(
      `SELECT id, entity, key, existingValue, incomingValue, updatedAt
       FROM mem_conflicts WHERE userId = ? AND status = 'open'
       ORDER BY updatedAt DESC LIMIT ?`,
    )
      .bind(userId, safeLimit)
      .all(),
    env.DB.prepare(
      `SELECT id, entity, key, value, confidence, freshUntil, reinforcedAt, updatedAt
       FROM mem_facts WHERE userId = ? ORDER BY updatedAt ASC LIMIT 120`,
    )
      .bind(userId)
      .all(),
    env.DB.prepare(
      `SELECT id, kind, summary, confidence, freshUntil, reinforcedAt, updatedAt
       FROM mem_events WHERE userId = ? ORDER BY updatedAt ASC LIMIT 120`,
    )
      .bind(userId)
      .all(),
  ])

  for (const c of conflictsRes.results || []) {
    items.push({
      id: c.id,
      type: 'fact',
      reason: 'conflict',
      confidence: 0.4,
      summary: `Conflict on ${c.entity}.${c.key}: "${String(c.existingValue).slice(0, 80)}" vs "${String(c.incomingValue).slice(0, 80)}"`,
      updatedAt: c.updatedAt,
    })
  }

  for (const f of factsRes.results || []) {
    const eff = computeEffectiveConfidence(f.confidence, f.updatedAt, f.reinforcedAt, f.freshUntil)
    const updatedMs = Date.parse(f.updatedAt || '')
    const freshMs = f.freshUntil ? Date.parse(f.freshUntil) : Number.NaN
    const isStale = (Number.isFinite(freshMs) && freshMs < Date.now()) || (Number.isFinite(updatedMs) && updatedMs < staleCutoff)
    if (eff < LOW_CONFIDENCE_THRESHOLD || isStale) {
      items.push({
        id: f.id,
        type: 'fact',
        reason: eff < LOW_CONFIDENCE_THRESHOLD ? 'low_confidence' : 'stale',
        confidence: eff,
        summary: `${f.entity}.${f.key}: ${String(f.value).slice(0, 140)}`,
        updatedAt: f.updatedAt,
      })
    }
  }

  for (const ev of eventsRes.results || []) {
    const eff = computeEffectiveConfidence(ev.confidence, ev.updatedAt, ev.reinforcedAt, ev.freshUntil)
    const updatedMs = Date.parse(ev.updatedAt || '')
    const freshMs = ev.freshUntil ? Date.parse(ev.freshUntil) : Number.NaN
    const isStale = (Number.isFinite(freshMs) && freshMs < Date.now()) || (Number.isFinite(updatedMs) && updatedMs < staleCutoff)
    if (eff < LOW_CONFIDENCE_THRESHOLD || isStale) {
      items.push({
        id: ev.id,
        type: 'event',
        reason: eff < LOW_CONFIDENCE_THRESHOLD ? 'low_confidence' : 'stale',
        confidence: eff,
        summary: String(ev.summary).slice(0, 180),
        updatedAt: ev.updatedAt,
      })
    }
  }

  items.sort((a, b) => a.confidence - b.confidence || String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return items.slice(0, safeLimit)
}

// ── Knowledge Graph extraction & rebuild ─────────────────────────────────────

function heuristicExtractEntities(items) {
  const entitiesMap = new Map()
  const relations = []
  const STOP = new Set([
    'The', 'This', 'That', 'These', 'Those', 'With', 'From', 'When', 'Where', 'What', 'Which', 'While',
    'There', 'Their', 'They', 'Your', 'Have', 'Will', 'Would', 'Could', 'Should', 'About', 'After',
    'Before', 'Because', 'However', 'Please', 'Thanks', 'Hello', 'OpenAgents', 'User', 'Agent', 'Assistant',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  ])

  const upsert = (name, type, summary) => {
    const clean = String(name || '').trim().slice(0, 120)
    if (!clean || clean.length < 2) return null
    const key = normText(clean)
    if (!entitiesMap.has(key)) {
      entitiesMap.set(key, { name: clean, type: GRAPH_ENTITY_TYPES.has(type) ? type : 'topic', summary: String(summary || '').slice(0, 300) })
    }
    return key
  }

  for (const item of items) {
    const foundKeys = []

    if (item.tags && Array.isArray(item.tags)) {
      for (const tag of item.tags.slice(0, 6)) {
        const k = upsert(tag, 'topic', `Tag referenced in ${item.source}`)
        if (k) foundKeys.push(k)
      }
    }

    // Capitalized multi-word or single proper nouns (not at start of sentence)
    const matches = String(item.text || '').matchAll(/(?:^|[a-z,;:]\s+)([A-Z][a-zA-Z0-9_-]{2,}(?:\s+[A-Z][a-zA-Z0-9_-]{2,}){0,2})/g)
    for (const m of matches) {
      const candidate = m[1].trim()
      if (STOP.has(candidate) || STOP.has(candidate.split(' ')[0])) continue
      if (candidate.length < 3 || candidate.length > 60) continue
      const lower = candidate.toLowerCase()
      let type = 'topic'
      if (/\b(inc|corp|llc|labs|studio|ai|hq|co)\b/i.test(candidate)) type = 'company'
      else if (/\b(project|app|platform|api|sdk|repo|service|system)\b/i.test(lower)) type = 'project'
      else if (candidate.includes(' ') && candidate.split(' ').length === 2) type = 'person'
      const k = upsert(candidate, type, `Mentioned in ${item.source}`)
      if (k && !foundKeys.includes(k)) foundKeys.push(k)
      if (foundKeys.length >= 6) break
    }

    for (let i = 0; i < foundKeys.length; i++) {
      for (let j = i + 1; j < Math.min(foundKeys.length, i + 3); j++) {
        const a = entitiesMap.get(foundKeys[i])
        const b = entitiesMap.get(foundKeys[j])
        if (a && b && foundKeys[i] !== foundKeys[j]) {
          relations.push({ from: a.name, to: b.name, relation: 'co-occurs with' })
        }
      }
    }
  }

  return { entities: Array.from(entitiesMap.values()).slice(0, 40), relations: relations.slice(0, 60) }
}

async function rebuildKnowledgeGraph(env, h, userId, full) {
  const now = new Date().toISOString()
  if (full) {
    await env.DB.prepare('DELETE FROM mem_graph_edges WHERE userId = ?').bind(userId).run()
    await env.DB.prepare('DELETE FROM mem_graph_nodes WHERE userId = ?').bind(userId).run()
    await env.DB.prepare('DELETE FROM mem_graph_state WHERE userId = ?').bind(userId).run()
  }

  const state = await env.DB.prepare('SELECT * FROM mem_graph_state WHERE userId = ?').bind(userId).first()
  const memCursor = full ? null : state?.memoriesCursor || null
  const msgCursor = full ? null : state?.messagesCursor || null

  const [entriesRes, factsRes, eventsRes, msgsRes] = await Promise.all([
    memCursor
      ? env.DB.prepare(
          `SELECT id, content, tags, updatedAt FROM mem_entries
           WHERE userId = ? AND sensitive = 0 AND updatedAt > ? ORDER BY updatedAt ASC LIMIT 80`,
        )
          .bind(userId, memCursor)
          .all()
      : env.DB.prepare(
          `SELECT id, content, tags, updatedAt FROM mem_entries
           WHERE userId = ? AND sensitive = 0 ORDER BY updatedAt ASC LIMIT 80`,
        )
          .bind(userId)
          .all(),
    env.DB.prepare(
      `SELECT id, entity, key, value, updatedAt FROM mem_facts WHERE userId = ? ORDER BY updatedAt DESC LIMIT 80`,
    )
      .bind(userId)
      .all(),
    env.DB.prepare(
      `SELECT id, summary, tags, updatedAt FROM mem_events WHERE userId = ? ORDER BY updatedAt DESC LIMIT 60`,
    )
      .bind(userId)
      .all(),
    msgCursor
      ? env.DB.prepare(
          `SELECT m.id, m.conversationId, m.role, m.content, m.createdAt
           FROM messages m JOIN conversations c ON c.id = m.conversationId
           WHERE c.userId = ? AND m.createdAt > ? ORDER BY m.createdAt ASC LIMIT 80`,
        )
          .bind(userId, msgCursor)
          .all()
          .catch(() => ({ results: [] }))
      : env.DB.prepare(
          `SELECT m.id, m.conversationId, m.role, m.content, m.createdAt
           FROM messages m JOIN conversations c ON c.id = m.conversationId
           WHERE c.userId = ? ORDER BY m.createdAt DESC LIMIT 80`,
        )
          .bind(userId)
          .all()
          .catch(() => ({ results: [] })),
  ])

  const items = []
  let maxMemAt = memCursor
  let maxMsgAt = msgCursor

  for (const e of entriesRes.results || []) {
    if (isVaultEncrypted(e.content)) continue
    items.push({
      source: 'memory',
      sourceId: e.id,
      text: String(e.content || '').slice(0, 1200),
      tags: parseTags(e.tags),
      at: e.updatedAt || now,
    })
    if (!maxMemAt || (e.updatedAt && e.updatedAt > maxMemAt)) maxMemAt = e.updatedAt
  }

  for (const ev of eventsRes.results || []) {
    items.push({
      source: 'memory',
      sourceId: ev.id,
      text: String(ev.summary || '').slice(0, 1200),
      tags: parseTags(ev.tags),
      at: ev.updatedAt || now,
    })
  }

  for (const m of msgsRes.results || []) {
    const content = String(m.content || '').trim()
    if (!content) continue
    items.push({
      source: 'conversation',
      sourceId: m.conversationId,
      text: `${m.role}: ${content}`.slice(0, 1200),
      tags: [],
      at: m.createdAt || now,
    })
    if (!maxMsgAt || (m.createdAt && m.createdAt > maxMsgAt)) maxMsgAt = m.createdAt
  }

  // Load existing nodes for merging
  const existingNodesRes = await env.DB.prepare('SELECT * FROM mem_graph_nodes WHERE userId = ?').bind(userId).all()
  const nodeByNorm = new Map()
  for (const row of existingNodesRes.results || []) {
    nodeByNorm.set(row.normName, {
      id: row.id,
      normName: row.normName,
      name: row.name,
      type: row.type,
      summary: row.summary || '',
      mentionCount: Number(row.mentionCount) || 1,
      mentions: parseJson(row.mentions, []),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }

  const upsertNode = async (name, type, summary, mention) => {
    const clean = String(name || '').trim().slice(0, 120)
    if (!clean) return null
    const nKey = normText(clean)
    const safeType = GRAPH_ENTITY_TYPES.has(type) ? type : 'topic'
    let node = nodeByNorm.get(nKey)
    if (!node) {
      node = {
        id: h.genId('gn_'),
        normName: nKey,
        name: clean,
        type: safeType,
        summary: String(summary || '').slice(0, 300),
        mentionCount: 0,
        mentions: [],
        createdAt: now,
        updatedAt: now,
      }
      nodeByNorm.set(nKey, node)
    } else if (summary && (!node.summary || node.summary.length < 20)) {
      node.summary = String(summary).slice(0, 300)
    }
    if (mention) {
      const dup = node.mentions.some((m) => m.sourceId === mention.sourceId && m.snippet === mention.snippet)
      if (!dup) {
        node.mentions.push(mention)
        if (node.mentions.length > 30) node.mentions = node.mentions.slice(-30)
      }
      node.mentionCount += 1
    } else if (node.mentionCount === 0) {
      node.mentionCount = 1
    }
    node.updatedAt = now
    await env.DB.prepare(
      `INSERT INTO mem_graph_nodes (id, userId, normName, name, type, summary, mentionCount, mentions, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(userId, normName) DO UPDATE SET
         summary = excluded.summary,
         mentionCount = excluded.mentionCount,
         mentions = excluded.mentions,
         updatedAt = excluded.updatedAt`,
    )
      .bind(
        node.id,
        userId,
        node.normName,
        node.name,
        node.type,
        node.summary,
        node.mentionCount,
        JSON.stringify(node.mentions),
        node.createdAt,
        node.updatedAt,
      )
      .run()
    return node
  }

  const upsertEdge = async (fromId, toId, relation) => {
    if (!fromId || !toId || fromId === toId) return
    const rel = String(relation || 'related to').trim().slice(0, 60) || 'related to'
    await env.DB.prepare(
      `INSERT INTO mem_graph_edges (id, userId, fromId, toId, relation, weight)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(userId, fromId, toId, relation) DO UPDATE SET weight = weight + 1`,
    )
      .bind(h.genId('ge_'), userId, fromId, toId, rel)
      .run()
  }

  // 1. Directly materialize structured facts into graph nodes
  for (const f of factsRes.results || []) {
    const entityNode = await upsertNode(f.entity, 'topic', `${f.key}: ${f.value}`, {
      source: 'memory',
      sourceId: f.id,
      snippet: `${f.entity}.${f.key}: ${f.value}`.slice(0, 200),
      at: f.updatedAt || now,
    })
    if (f.value && String(f.value).length <= 80 && !/^(true|false|yes|no|\d+)$/i.test(String(f.value).trim())) {
      const valNode = await upsertNode(f.value, 'topic', `Value of ${f.entity}.${f.key}`, {
        source: 'memory',
        sourceId: f.id,
        snippet: `${f.entity}.${f.key}: ${f.value}`.slice(0, 200),
        at: f.updatedAt || now,
      })
      if (entityNode && valNode) await upsertEdge(entityNode.id, valNode.id, f.key)
    }
  }

  // 2. Extract entities/relations from memory entries and messages (LLM if available, else heuristic)
  let extracted = null
  if (items.length > 0) {
    const batchText = items
      .slice(0, 30)
      .map((b, i) => `[${i}] ${b.text}`)
      .join('\n')
      .slice(0, 6000)

    extracted = await callUserLlmJson(
      env,
      h,
      userId,
      'You are an information extraction engine that builds a personal knowledge graph. Output strict JSON only.',
      'Extract named entities and relations from the notes below. ' +
        'Entity types: person, project, company, topic, place. Only include specific, named things. ' +
        'Respond with ONLY JSON: {"entities":[{"name":"","type":"","summary":"one short sentence"}],' +
        '"relations":[{"from":"entity name","to":"entity name","relation":"short verb phrase"}]}\n\n' +
        batchText,
    )
    if (!extracted || !Array.isArray(extracted.entities)) {
      extracted = heuristicExtractEntities(items)
    }

    for (const raw of (extracted.entities || []).slice(0, 50)) {
      const name = String(raw?.name || '').trim().slice(0, 120)
      const type = String(raw?.type || 'topic').toLowerCase()
      if (!name) continue
      const key = normText(name)
      let matchedAny = false
      for (const item of items) {
        const pos = item.text.toLowerCase().indexOf(key)
        if (pos < 0) continue
        matchedAny = true
        await upsertNode(name, type, raw.summary || '', {
          source: item.source,
          sourceId: item.sourceId,
          snippet: item.text.slice(Math.max(0, pos - 60), pos + key.length + 80),
          at: item.at,
        })
      }
      if (!matchedAny) {
        await upsertNode(name, type, raw.summary || '', null)
      }
    }

    for (const rel of (extracted.relations || []).slice(0, 80)) {
      const from = nodeByNorm.get(normText(rel?.from))
      const to = nodeByNorm.get(normText(rel?.to))
      if (from && to && from.id !== to.id) {
        await upsertEdge(from.id, to.id, rel?.relation)
      }
    }
  }

  await env.DB.prepare(
    `INSERT INTO mem_graph_state (userId, lastRunAt, memoriesCursor, messagesCursor)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(userId) DO UPDATE SET
       lastRunAt = excluded.lastRunAt,
       memoriesCursor = COALESCE(excluded.memoriesCursor, mem_graph_state.memoriesCursor),
       messagesCursor = COALESCE(excluded.messagesCursor, mem_graph_state.messagesCursor)`,
  )
    .bind(userId, now, maxMemAt, maxMsgAt)
    .run()

  const [nodeCountRow, edgeCountRow] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM mem_graph_nodes WHERE userId = ?').bind(userId).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM mem_graph_edges WHERE userId = ?').bind(userId).first(),
  ])

  return {
    ok: true,
    processed: items.length + (factsRes.results || []).length,
    entities: Number(nodeCountRow?.n) || 0,
    relations: Number(edgeCountRow?.n) || 0,
  }
}

// ── Route Handler ────────────────────────────────────────────────────────────

export async function handleMemoryRoutes({ request, env, url, path, method, origin, user, h }) {
  const isMemory = path === '/api/v1/memory' || path.startsWith('/api/v1/memory/')
  const isPrivacy = path === '/api/v1/privacy' || path.startsWith('/api/v1/privacy/')
  const isReflection = path === '/api/v1/reflection' || path.startsWith('/api/v1/reflection/')
  const isGraph = path === '/api/v1/graph' || path.startsWith('/api/v1/graph/')

  if (!isMemory && !isPrivacy && !isReflection && !isGraph) return null

  const json = (body, status = 200) => h.jsonResponse(body, status, origin)
  if (!user || !user.id) return json({ statusCode: 401, message: 'Unauthorized' }, 401)

  await ensureMemorySchema(env)
  const userId = user.id

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. MEMORY ROUTES (/api/v1/memory/*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isMemory) {
    // GET /api/v1/memory — list entries (pinned first, then updatedAt DESC)
    if (path === '/api/v1/memory' && method === 'GET') {
      const res = await env.DB.prepare(
        `SELECT * FROM mem_entries WHERE userId = ?
         ORDER BY pinned DESC, updatedAt DESC LIMIT 200`,
      )
        .bind(userId)
        .all()
      return json((res.results || []).map(toEntryDto))
    }

    // POST /api/v1/memory — create memory entry
    if (path === '/api/v1/memory' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const content = String(body?.content ?? '').trim().slice(0, MAX_CONTENT_LEN)
      if (!content) return json({ statusCode: 400, message: 'content is required.' }, 400)
      const type = MEMORY_TYPES.has(body?.type) ? body.type : 'fact'
      const tags = parseTags(body?.tags)
      const pinned = body?.pinned ? 1 : 0
      const id = h.genId('mem_')
      const now = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO mem_entries (id, userId, type, content, tags, pinned, sensitive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
        .bind(id, userId, type, content, JSON.stringify(tags), pinned, now, now)
        .run()
      const row = await env.DB.prepare('SELECT * FROM mem_entries WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      return json(toEntryDto(row), 201)
    }

    // POST /api/v1/memory/query — tiered memory search
    if (path === '/api/v1/memory/query' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const query = String(body?.query ?? '').trim().slice(0, 500)
      if (!query) return json({ statusCode: 400, message: 'query is required.' }, 400)
      const limit = clampInt(body?.limit, 1, 30, 12)
      const includeFacts = body?.includeFacts !== false
      const includeConflicts = Boolean(body?.includeConflicts)
      const diversify = body?.diversify !== false
      const temporalDecayDays = clampInt(body?.temporalDecayDays, 3, 180, 30)
      const minConfidence = body?.minConfidence !== undefined ? clampConfidence(body.minConfidence, 0) : 0
      const filterTags = parseTags(body?.tags).map((t) => t.toLowerCase())
      const qTokens = tokenize(query)
      const qNorm = normText(query)

      const scoreText = (text, effConf) => {
        const hay = normText(text)
        if (!hay) return 0
        let hits = 0
        if (hay.includes(qNorm)) hits += 2
        for (const t of qTokens) {
          if (hay.includes(t)) hits += 1
        }
        if (hits === 0) return 0
        const lexical = hits / Math.max(1, qTokens.length + 1)
        return lexical * 0.7 + effConf * 0.3
      }

      const [eventsRes, factsRes] = await Promise.all([
        env.DB.prepare('SELECT * FROM mem_events WHERE userId = ? ORDER BY updatedAt DESC LIMIT 200')
          .bind(userId)
          .all(),
        includeFacts
          ? env.DB.prepare('SELECT * FROM mem_facts WHERE userId = ? ORDER BY updatedAt DESC LIMIT 200')
              .bind(userId)
              .all()
          : Promise.resolve({ results: [] }),
      ])

      let eventCandidates = (eventsRes.results || [])
        .map((r) => toEventDto(r, temporalDecayDays))
        .filter((ev) => (ev.effectiveConfidence ?? ev.confidence) >= minConfidence)
        .filter((ev) => filterTags.length === 0 || filterTags.some((ft) => ev.tags.map((t) => t.toLowerCase()).includes(ft)))
        .map((ev) => ({ item: ev, score: scoreText(`${ev.summary} ${ev.tags.join(' ')}`, ev.effectiveConfidence ?? ev.confidence) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)

      if (diversify && eventCandidates.length > 1) {
        const seenKinds = new Map()
        eventCandidates = eventCandidates.filter((c) => {
          const count = seenKinds.get(c.item.kind) || 0
          if (count >= Math.max(3, Math.ceil(limit / 2))) return false
          seenKinds.set(c.item.kind, count + 1)
          return true
        })
      }
      const events = eventCandidates.slice(0, limit).map((c) => c.item)

      let factCandidates = (factsRes.results || [])
        .map((r) => toFactDto(r, temporalDecayDays))
        .filter((f) => (f.effectiveConfidence ?? f.confidence) >= minConfidence)
        .map((f) => ({ item: f, score: scoreText(`${f.entity} ${f.key} ${f.value}`, f.effectiveConfidence ?? f.confidence) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)

      if (diversify && factCandidates.length > 1) {
        const seenEntities = new Map()
        factCandidates = factCandidates.filter((c) => {
          const k = normText(c.item.entity)
          const count = seenEntities.get(k) || 0
          if (count >= 3) return false
          seenEntities.set(k, count + 1)
          return true
        })
      }
      const facts = factCandidates.slice(0, limit).map((c) => c.item)

      let conflicts
      if (includeConflicts) {
        const cRes = await env.DB.prepare(
          `SELECT * FROM mem_conflicts WHERE userId = ? AND status = 'open' ORDER BY updatedAt DESC LIMIT 12`,
        )
          .bind(userId)
          .all()
        conflicts = (cRes.results || []).map(toConflictDto)
      }

      return json({
        events,
        facts,
        ...(includeConflicts ? { conflicts } : {}),
        strategy: {
          diversify,
          temporalDecayDays,
          eventMatches: events.length,
          factMatches: facts.length,
        },
        queriedAt: new Date().toISOString(),
      })
    }

    // POST /api/v1/memory/events — write memory event
    if (path === '/api/v1/memory/events' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const kind = MEMORY_EVENT_KINDS.has(body?.kind) ? body.kind : 'note'
      const summary = String(body?.summary ?? '').trim().slice(0, 4000)
      if (!summary) return json({ statusCode: 400, message: 'summary is required.' }, 400)
      const payload = body?.payload && typeof body.payload === 'object' ? JSON.stringify(body.payload).slice(0, 16000) : null
      const sourceRef = body?.sourceRef ? String(body.sourceRef).trim().slice(0, 500) : null
      const tags = parseTags(body?.tags)
      const piiRedacted = body?.piiRedacted ? 1 : 0
      const confidence = clampConfidence(body?.confidence, DEFAULT_CONFIDENCE)
      const freshUntil = resolveFreshUntil(body?.freshUntil, body?.freshnessHours)
      const conflictGroup = body?.conflictGroup ? String(body.conflictGroup).trim().slice(0, 120) : null
      const now = new Date().toISOString()
      const id = h.genId('mev_')
      await env.DB.prepare(
        `INSERT INTO mem_events
           (id, userId, kind, summary, payload, sourceRef, tags, piiRedacted, confidence, freshUntil, conflictGroup, reinforcedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, userId, kind, summary, payload, sourceRef, JSON.stringify(tags), piiRedacted, confidence, freshUntil, conflictGroup, now, now, now)
        .run()
      const row = await env.DB.prepare('SELECT * FROM mem_events WHERE id = ? AND userId = ?').bind(id, userId).first()
      return json(toEventDto(row), 201)
    }

    // GET /api/v1/memory/facts — list facts
    if (path === '/api/v1/memory/facts' && method === 'GET') {
      const entity = (url.searchParams.get('entity') || '').trim()
      const limit = clampInt(url.searchParams.get('limit'), 1, 100, 30)
      const res = entity
        ? await env.DB.prepare('SELECT * FROM mem_facts WHERE userId = ? AND entity = ? ORDER BY updatedAt DESC LIMIT ?')
            .bind(userId, entity, limit)
            .all()
        : await env.DB.prepare('SELECT * FROM mem_facts WHERE userId = ? ORDER BY updatedAt DESC LIMIT ?')
            .bind(userId, limit)
            .all()
      return json((res.results || []).map((r) => toFactDto(r)))
    }

    // POST /api/v1/memory/facts — upsert fact (with conflict detection)
    if (path === '/api/v1/memory/facts' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const entity = String(body?.entity ?? '').trim().slice(0, 160)
      const key = String(body?.key ?? '').trim().slice(0, 160)
      const value = String(body?.value ?? '').trim().slice(0, 4000)
      if (!entity || !key || !value) {
        return json({ statusCode: 400, message: 'entity, key, and value are required.' }, 400)
      }
      const sourceRef = body?.sourceRef ? String(body.sourceRef).trim().slice(0, 500) : null
      const confidence = clampConfidence(body?.confidence, DEFAULT_CONFIDENCE)
      const freshUntil = resolveFreshUntil(body?.freshUntil, body?.freshnessHours)
      const conflictGroup = body?.conflictGroup ? String(body.conflictGroup).trim().slice(0, 120) : null
      const now = new Date().toISOString()

      const existing = await env.DB.prepare(
        'SELECT * FROM mem_facts WHERE userId = ? AND entity = ? AND key = ?',
      )
        .bind(userId, entity, key)
        .first()

      if (existing && String(existing.value).trim() !== value) {
        const delta = Number((confidence - clampConfidence(existing.confidence)).toFixed(4))
        await env.DB.prepare(
          `INSERT INTO mem_conflicts
             (id, userId, entity, key, existingValue, incomingValue, existingSourceRef, incomingSourceRef, status, severity, confidenceDelta, createdAt, updatedAt, resolvedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL)`,
        )
          .bind(
            h.genId('mcf_'),
            userId,
            entity,
            key,
            String(existing.value).slice(0, 4000),
            value,
            existing.sourceRef || null,
            sourceRef,
            conflictSeverity(existing.value, value),
            delta,
            now,
            now,
          )
          .run()
      }

      const reinforcedAt = body?.reinforce === false ? existing?.reinforcedAt || now : now
      const id = existing?.id || h.genId('mfc_')
      await env.DB.prepare(
        `INSERT INTO mem_facts
           (id, userId, entity, key, value, sourceRef, confidence, freshUntil, conflictGroup, reinforcedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(userId, entity, key) DO UPDATE SET
           value = excluded.value,
           sourceRef = excluded.sourceRef,
           confidence = excluded.confidence,
           freshUntil = excluded.freshUntil,
           conflictGroup = excluded.conflictGroup,
           reinforcedAt = excluded.reinforcedAt,
           updatedAt = excluded.updatedAt`,
      )
        .bind(id, userId, entity, key, value, sourceRef, confidence, freshUntil, conflictGroup, reinforcedAt, existing?.createdAt || now, now)
        .run()

      const row = await env.DB.prepare('SELECT * FROM mem_facts WHERE userId = ? AND entity = ? AND key = ?')
        .bind(userId, entity, key)
        .first()
      return json(toFactDto(row), existing ? 200 : 201)
    }

    // POST /api/v1/memory/files/sync
    if (path === '/api/v1/memory/files/sync' && method === 'POST') {
      await syncUserFiles(env, userId)
      return json({ ok: true })
    }

    // GET /api/v1/memory/files
    if (path === '/api/v1/memory/files' && method === 'GET') {
      await ensureDefaultFiles(env, userId)
      const res = await env.DB.prepare('SELECT * FROM mem_files WHERE userId = ? ORDER BY name ASC')
        .bind(userId)
        .all()
      return json((res.results || []).map(toFileSummary))
    }

    // GET / PUT /api/v1/memory/files/:name
    const fileMatch = path.match(/^\/api\/v1\/memory\/files\/([^/]+)$/)
    if (fileMatch) {
      const name = decodeURIComponent(fileMatch[1])
      if (!SAFE_FILENAME_RE.test(name) || name.includes('..')) {
        return json({ statusCode: 400, message: 'Invalid memory file name.' }, 400)
      }
      await ensureDefaultFiles(env, userId)

      if (method === 'GET') {
        const row = await env.DB.prepare('SELECT * FROM mem_files WHERE userId = ? AND name = ?')
          .bind(userId, name)
          .first()
        if (!row) return json({ statusCode: 404, message: 'Memory file not found.' }, 404)
        return json(toFileDocument(row))
      }

      if (method === 'PUT') {
        const existing = await env.DB.prepare('SELECT * FROM mem_files WHERE userId = ? AND name = ?')
          .bind(userId, name)
          .first()
        if (READONLY_FILES.has(name) || existing?.readonly) {
          return json({ statusCode: 400, message: `${name} is read-only.` }, 400)
        }
        const body = await request.json().catch(() => ({}))
        if (typeof body?.content !== 'string') {
          return json({ statusCode: 400, message: 'content must be a string.' }, 400)
        }
        const content = body.content.slice(0, MAX_FILE_LEN)
        const now = new Date().toISOString()
        await env.DB.prepare(
          `INSERT OR REPLACE INTO mem_files (userId, name, content, readonly, updatedAt)
           VALUES (?, ?, ?, 0, ?)`,
        )
          .bind(userId, name, content, now)
          .run()
        const row = await env.DB.prepare('SELECT * FROM mem_files WHERE userId = ? AND name = ?')
          .bind(userId, name)
          .first()
        return json(toFileDocument(row))
      }

      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    // POST /api/v1/memory/capture
    if (path === '/api/v1/memory/capture' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const captureUrl = String(body?.url ?? '').trim().slice(0, 1000)
      const selection = String(body?.selection ?? '').trim().slice(0, 4000)
      const title = String(body?.title ?? '').trim().slice(0, 240)
      const note = String(body?.note ?? '').trim().slice(0, 1000)
      const conversationId = body?.conversationId ? String(body.conversationId).trim().slice(0, 120) : null
      if (!captureUrl || !selection) {
        return json({ statusCode: 400, message: 'url and selection are required.' }, 400)
      }
      const now = new Date().toISOString()
      const content = [title ? `[${title}]` : null, selection, note ? `Note: ${note}` : null, `Source: ${captureUrl}`]
        .filter(Boolean)
        .join('\n')
        .slice(0, MAX_CONTENT_LEN)
      const memId = h.genId('mem_')
      await env.DB.prepare(
        `INSERT INTO mem_entries (id, userId, type, content, tags, pinned, sensitive, createdAt, updatedAt)
         VALUES (?, ?, 'fact', ?, '["capture"]', 0, 0, ?, ?)`,
      )
        .bind(memId, userId, content, now, now)
        .run()
      await env.DB.prepare(
        `INSERT INTO mem_events
           (id, userId, kind, summary, payload, sourceRef, tags, piiRedacted, confidence, freshUntil, conflictGroup, reinforcedAt, createdAt, updatedAt)
         VALUES (?, ?, 'extraction', ?, ?, ?, '["capture"]', 0, 0.85, NULL, NULL, ?, ?, ?)`,
      )
        .bind(h.genId('mev_'), userId, content.slice(0, 600), JSON.stringify({ url: captureUrl, title, note }), captureUrl, now, now, now)
        .run()
      const row = await env.DB.prepare('SELECT * FROM mem_entries WHERE id = ? AND userId = ?').bind(memId, userId).first()
      return json(
        {
          capturedAt: now,
          memory: toEntryDto(row),
          conversationId,
          conversationMessageId: null,
        },
        201,
      )
    }

    // POST /api/v1/memory/curate
    if (path === '/api/v1/memory/curate' && method === 'POST') {
      const now = new Date().toISOString()
      const res = await env.DB.prepare(
        'SELECT * FROM mem_entries WHERE userId = ? ORDER BY pinned DESC, updatedAt DESC',
      )
        .bind(userId)
        .all()
      const rows = res.results || []
      const seen = new Set()
      let dedupedEntries = 0
      for (const r of rows) {
        if (r.sensitive || isVaultEncrypted(r.content)) continue
        const key = `${r.type}:${normText(r.content)}`
        if (seen.has(key)) {
          await env.DB.prepare('DELETE FROM mem_entries WHERE id = ? AND userId = ?').bind(r.id, userId).run()
          dedupedEntries += 1
        } else {
          seen.add(key)
        }
      }

      // Prune expired facts past freshUntil with very low effective confidence
      const factsRes = await env.DB.prepare('SELECT * FROM mem_facts WHERE userId = ?').bind(userId).all()
      let expiredEntries = 0
      for (const f of factsRes.results || []) {
        const eff = computeEffectiveConfidence(f.confidence, f.updatedAt, f.reinforcedAt, f.freshUntil)
        if (eff < DECAY_PRUNE_THRESHOLD) {
          await env.DB.prepare('DELETE FROM mem_facts WHERE id = ? AND userId = ?').bind(f.id, userId).run()
          expiredEntries += 1
        }
      }

      const remainingRes = await env.DB.prepare(
        'SELECT * FROM mem_entries WHERE userId = ? ORDER BY pinned DESC, updatedAt DESC LIMIT 50',
      )
        .bind(userId)
        .all()
      const remaining = (remainingRes.results || []).filter((e) => !e.sensitive && !isVaultEncrypted(e.content))
      const summaryPoints = remaining.slice(0, 14)
      const mdLines = ['# MEMORY', '', `_Curated ${now}_`, '']
      for (const p of summaryPoints) {
        mdLines.push(`- (${p.type}) ${String(p.content).replace(/\s+/g, ' ').slice(0, 240)}`)
      }
      const mdContent = `${mdLines.join('\n')}\n`
      await env.DB.prepare(
        `INSERT OR REPLACE INTO mem_files (userId, name, content, readonly, updatedAt)
         VALUES (?, 'MEMORY.md', ?, 0, ?)`,
      )
        .bind(userId, mdContent, now)
        .run()

      return json({
        curatedAt: now,
        source: 'manual',
        summaryPoints: summaryPoints.length,
        dedupedEntries,
        expiredEntries,
        memoryEntries: rows.length - dedupedEntries,
        memoryFileBytes: new TextEncoder().encode(mdContent).byteLength,
      })
    }

    // GET /api/v1/memory/conflicts
    if (path === '/api/v1/memory/conflicts' && method === 'GET') {
      const status = (url.searchParams.get('status') || '').trim()
      const limit = clampInt(url.searchParams.get('limit'), 1, 100, 30)
      const res = CONFLICT_STATUSES.has(status)
        ? await env.DB.prepare(
            'SELECT * FROM mem_conflicts WHERE userId = ? AND status = ? ORDER BY updatedAt DESC LIMIT ?',
          )
            .bind(userId, status, limit)
            .all()
        : await env.DB.prepare('SELECT * FROM mem_conflicts WHERE userId = ? ORDER BY updatedAt DESC LIMIT ?')
            .bind(userId, limit)
            .all()
      return json((res.results || []).map(toConflictDto))
    }

    // POST /api/v1/memory/conflicts/:id/resolve
    const conflictMatch = path.match(/^\/api\/v1\/memory\/conflicts\/([^/]+)\/resolve$/)
    if (conflictMatch && method === 'POST') {
      const id = decodeURIComponent(conflictMatch[1])
      const body = await request.json().catch(() => ({}))
      const status = body?.status === 'ignored' ? 'ignored' : 'resolved'
      const existing = await env.DB.prepare('SELECT * FROM mem_conflicts WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      if (!existing) return json({ statusCode: 404, message: 'Conflict not found.' }, 404)
      const now = new Date().toISOString()
      await env.DB.prepare(
        'UPDATE mem_conflicts SET status = ?, updatedAt = ?, resolvedAt = ? WHERE id = ? AND userId = ?',
      )
        .bind(status, now, now, id, userId)
        .run()
      if (status === 'resolved') {
        await env.DB.prepare(
          `UPDATE mem_facts SET value = ?, updatedAt = ?, reinforcedAt = ?
           WHERE userId = ? AND entity = ? AND key = ?`,
        )
          .bind(existing.incomingValue, now, now, userId, existing.entity, existing.key)
          .run()
      }
      const updated = await env.DB.prepare('SELECT * FROM mem_conflicts WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      return json(toConflictDto(updated))
    }

    // GET /api/v1/memory/review-queue
    if (path === '/api/v1/memory/review-queue' && method === 'GET') {
      const limit = clampInt(url.searchParams.get('limit'), 1, 100, 30)
      const queue = await buildReviewQueue(env, userId, limit)
      return json(queue)
    }

    // GET / POST /api/v1/memory/sources
    if (path === '/api/v1/memory/sources' && method === 'GET') {
      const res = await env.DB.prepare('SELECT * FROM mem_sources WHERE userId = ? ORDER BY updatedAt DESC')
        .bind(userId)
        .all()
      return json((res.results || []).map(toSourceDto))
    }

    if (path === '/api/v1/memory/sources' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const srcPath = String(body?.path ?? '').trim().slice(0, 500)
      if (!srcPath) return json({ statusCode: 400, message: 'path is required.' }, 400)
      const kind = SOURCE_KINDS.has(body?.kind) ? body.kind : 'folder'
      const includeGlobs = Array.isArray(body?.includeGlobs)
        ? body.includeGlobs.map((g) => String(g || '').trim().slice(0, 80)).filter(Boolean).slice(0, 20)
        : ['*.md', '*.txt', '*.json']
      const maxFiles = clampInt(body?.maxFiles, 1, 150, 50)
      const id = h.genId('msrc_')
      const now = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO mem_sources
           (id, userId, path, kind, includeGlobs, maxFiles, status, lastSyncedAt, lastError, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`,
      )
        .bind(id, userId, srcPath, kind, JSON.stringify(includeGlobs), maxFiles, now, now)
        .run()
      const row = await env.DB.prepare('SELECT * FROM mem_sources WHERE id = ? AND userId = ?').bind(id, userId).first()
      return json(toSourceDto(row), 201)
    }

    // POST /api/v1/memory/sources/:id/sync
    const srcSyncMatch = path.match(/^\/api\/v1\/memory\/sources\/([^/]+)\/sync$/)
    if (srcSyncMatch && method === 'POST') {
      const id = decodeURIComponent(srcSyncMatch[1])
      const existing = await env.DB.prepare('SELECT * FROM mem_sources WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      if (!existing) return json({ statusCode: 404, message: 'Knowledge source not found.' }, 404)
      const now = new Date().toISOString()
      await env.DB.prepare(
        `UPDATE mem_sources SET status = 'active', lastSyncedAt = ?, lastError = NULL, updatedAt = ?
         WHERE id = ? AND userId = ?`,
      )
        .bind(now, now, id, userId)
        .run()
      const updated = await env.DB.prepare('SELECT * FROM mem_sources WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      return json({
        source: toSourceDto(updated),
        syncedFiles: 0,
        createdEvents: 0,
        warnings: ['Cloud worker cannot read local disk paths directly; source sync timestamp recorded.'],
        syncedAt: now,
      })
    }

    // DELETE /api/v1/memory/sources/:id
    const srcDelMatch = path.match(/^\/api\/v1\/memory\/sources\/([^/]+)$/)
    if (srcDelMatch && method === 'DELETE') {
      const id = decodeURIComponent(srcDelMatch[1])
      await env.DB.prepare('DELETE FROM mem_sources WHERE id = ? AND userId = ?').bind(id, userId).run()
      return json({ ok: true })
    }

    // POST /api/v1/memory/decay
    if (path === '/api/v1/memory/decay' && method === 'POST') {
      const factsRes = await env.DB.prepare('SELECT * FROM mem_facts WHERE userId = ?').bind(userId).all()
      let updated = 0
      let pruned = 0
      for (const f of factsRes.results || []) {
        const eff = computeEffectiveConfidence(f.confidence, f.updatedAt, f.reinforcedAt, f.freshUntil)
        if (eff < DECAY_PRUNE_THRESHOLD) {
          await env.DB.prepare('DELETE FROM mem_facts WHERE id = ? AND userId = ?').bind(f.id, userId).run()
          pruned += 1
        } else if (Math.abs(eff - Number(f.confidence)) > 0.01) {
          await env.DB.prepare('UPDATE mem_facts SET confidence = ? WHERE id = ? AND userId = ?')
            .bind(eff, f.id, userId)
            .run()
          updated += 1
        }
      }
      return json({ updated, pruned })
    }

    // POST /api/v1/memory/semantic
    if (path === '/api/v1/memory/semantic' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const query = String(body?.query ?? '').trim().slice(0, 500)
      if (!query) return json({ statusCode: 400, message: 'query is required.' }, 400)
      const limit = clampInt(body?.limit, 1, 30, 10)
      const qTokens = new Set(tokenize(query))
      const [factsRes, eventsRes] = await Promise.all([
        env.DB.prepare('SELECT id, entity, key, value FROM mem_facts WHERE userId = ? LIMIT 300').bind(userId).all(),
        env.DB.prepare('SELECT id, summary FROM mem_events WHERE userId = ? ORDER BY createdAt DESC LIMIT 300')
          .bind(userId)
          .all(),
      ])
      const score = (text) => {
        const toks = new Set(tokenize(text))
        if (toks.size === 0 || qTokens.size === 0) return 0
        let inter = 0
        for (const t of qTokens) if (toks.has(t)) inter += 1
        return Number((inter / Math.sqrt(toks.size * qTokens.size)).toFixed(4))
      }
      const hits = []
      for (const f of factsRes.results || []) {
        const text = `${f.key}: ${f.value}`
        const s = score(`${f.entity} ${text}`)
        if (s > 0.1) hits.push({ id: f.id, type: 'fact', text, score: s })
      }
      for (const ev of eventsRes.results || []) {
        const s = score(ev.summary)
        if (s > 0.1) hits.push({ id: ev.id, type: 'event', text: ev.summary, score: s })
      }
      hits.sort((a, b) => b.score - a.score)
      return json(hits.slice(0, limit))
    }

    // POST /api/v1/memory/embed-backfill
    if (path === '/api/v1/memory/embed-backfill' && method === 'POST') {
      return json({ embedded: 0 })
    }

    // POST / DELETE /api/v1/memory/:id/pin
    const pinMatch = path.match(/^\/api\/v1\/memory\/([^/]+)\/pin$/)
    if (pinMatch && (method === 'POST' || method === 'DELETE')) {
      const id = decodeURIComponent(pinMatch[1])
      const existing = await env.DB.prepare('SELECT * FROM mem_entries WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      if (!existing) return json({ statusCode: 404, message: 'Memory entry not found.' }, 404)
      const pinned = method === 'POST' ? 1 : 0
      const now = new Date().toISOString()
      await env.DB.prepare('UPDATE mem_entries SET pinned = ?, updatedAt = ? WHERE id = ? AND userId = ?')
        .bind(pinned, now, id, userId)
        .run()
      const row = await env.DB.prepare('SELECT * FROM mem_entries WHERE id = ? AND userId = ?').bind(id, userId).first()
      return json(toEntryDto(row))
    }

    // PATCH / DELETE /api/v1/memory/:id
    const idMatch = path.match(/^\/api\/v1\/memory\/([^/]+)$/)
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1])
      if (method === 'PATCH') {
        const existing = await env.DB.prepare('SELECT * FROM mem_entries WHERE id = ? AND userId = ?')
          .bind(id, userId)
          .first()
        if (!existing) return json({ statusCode: 404, message: 'Memory entry not found.' }, 404)
        const body = await request.json().catch(() => ({}))
        const nextContent =
          typeof body?.content === 'string' && body.content.trim()
            ? body.content.trim().slice(0, MAX_CONTENT_LEN)
            : existing.content
        const nextTags = body?.tags !== undefined ? JSON.stringify(parseTags(body.tags)) : existing.tags
        const storedContent = existing.sensitive ? await vaultEncrypt(env, h, nextContent) : nextContent
        const now = new Date().toISOString()
        await env.DB.prepare('UPDATE mem_entries SET content = ?, tags = ?, updatedAt = ? WHERE id = ? AND userId = ?')
          .bind(storedContent, nextTags, now, id, userId)
          .run()
        const row = await env.DB.prepare('SELECT * FROM mem_entries WHERE id = ? AND userId = ?').bind(id, userId).first()
        return json(toEntryDto(row))
      }

      if (method === 'DELETE') {
        const res = await env.DB.prepare('DELETE FROM mem_entries WHERE id = ? AND userId = ?').bind(id, userId).run()
        return json({ count: Number(res?.meta?.changes) || 0 })
      }
    }

    return json({ statusCode: 404, message: 'Not found' }, 404)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PRIVACY VAULT ROUTES (/api/v1/privacy/*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isPrivacy) {
    // GET /api/v1/privacy/settings
    if (path === '/api/v1/privacy/settings' && method === 'GET') {
      const [row, countRow] = await Promise.all([
        env.DB.prepare('SELECT * FROM mem_privacy_settings WHERE userId = ?').bind(userId).first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM mem_entries WHERE userId = ? AND sensitive = 1').bind(userId).first(),
      ])
      return json({
        localOnly: Boolean(row?.localOnly),
        ...(row?.localModel ? { localModel: row.localModel } : {}),
        sensitiveMemoryCount: Number(countRow?.n) || 0,
      })
    }

    // PUT / PATCH /api/v1/privacy/settings
    if (path === '/api/v1/privacy/settings' && (method === 'PUT' || method === 'PATCH')) {
      const body = await request.json().catch(() => ({}))
      const existing = await env.DB.prepare('SELECT * FROM mem_privacy_settings WHERE userId = ?').bind(userId).first()
      const localOnly =
        typeof body?.localOnly === 'boolean' ? (body.localOnly ? 1 : 0) : existing ? Number(existing.localOnly) : 0
      const localModel =
        body?.localModel !== undefined
          ? String(body.localModel || '').trim().slice(0, 120) || null
          : existing?.localModel || null
      const now = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO mem_privacy_settings (userId, localOnly, localModel, updatedAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET
           localOnly = excluded.localOnly,
           localModel = excluded.localModel,
           updatedAt = excluded.updatedAt`,
      )
        .bind(userId, localOnly, localModel, now)
        .run()
      const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM mem_entries WHERE userId = ? AND sensitive = 1')
        .bind(userId)
        .first()
      return json({
        localOnly: Boolean(localOnly),
        ...(localModel ? { localModel } : {}),
        sensitiveMemoryCount: Number(countRow?.n) || 0,
      })
    }

    // GET /api/v1/privacy/memories
    if (path === '/api/v1/privacy/memories' && method === 'GET') {
      const res = await env.DB.prepare(
        'SELECT id, type, content, sensitive, updatedAt FROM mem_entries WHERE userId = ? ORDER BY updatedAt DESC LIMIT 500',
      )
        .bind(userId)
        .all()
      return json(
        (res.results || []).map((m) => {
          const isSens = Boolean(m.sensitive) || isVaultEncrypted(m.content)
          return {
            id: m.id,
            type: m.type,
            preview: isSens ? '••••••••' : String(m.content || '').slice(0, 200),
            sensitive: isSens,
            updatedAt: m.updatedAt,
          }
        }),
      )
    }

    // PUT / PATCH /api/v1/privacy/memories/:id/sensitive
    const sensMatch = path.match(/^\/api\/v1\/privacy\/memories\/([^/]+)\/sensitive$/)
    if (sensMatch && (method === 'PUT' || method === 'PATCH')) {
      const id = decodeURIComponent(sensMatch[1])
      const body = await request.json().catch(() => ({}))
      const sensitive = Boolean(body?.sensitive)
      const row = await env.DB.prepare('SELECT * FROM mem_entries WHERE id = ? AND userId = ?').bind(id, userId).first()
      if (!row) return json({ statusCode: 404, message: 'Memory not found.' }, 404)

      let nextContent = row.content
      if (sensitive) {
        nextContent = await vaultEncrypt(env, h, row.content)
      } else {
        const plain = await vaultDecrypt(env, h, row.content)
        if (plain === null) {
          return json({ statusCode: 400, message: 'Unable to decrypt memory (encryption key changed?).' }, 400)
        }
        nextContent = plain
      }
      const now = new Date().toISOString()
      await env.DB.prepare('UPDATE mem_entries SET content = ?, sensitive = ?, updatedAt = ? WHERE id = ? AND userId = ?')
        .bind(nextContent, sensitive ? 1 : 0, now, id, userId)
        .run()
      return json({ id, sensitive })
    }

    // GET /api/v1/privacy/memories/:id/reveal
    const revealMatch = path.match(/^\/api\/v1\/privacy\/memories\/([^/]+)\/reveal$/)
    if (revealMatch && method === 'GET') {
      const id = decodeURIComponent(revealMatch[1])
      const row = await env.DB.prepare('SELECT * FROM mem_entries WHERE id = ? AND userId = ?').bind(id, userId).first()
      if (!row) return json({ statusCode: 404, message: 'Memory not found.' }, 404)
      const content = await vaultDecrypt(env, h, row.content)
      return json({ id, content })
    }

    // DELETE /api/v1/privacy/memories/:id
    const privMemDelMatch = path.match(/^\/api\/v1\/privacy\/memories\/([^/]+)$/)
    if (privMemDelMatch && method === 'DELETE') {
      const id = decodeURIComponent(privMemDelMatch[1])
      const res = await env.DB.prepare('DELETE FROM mem_entries WHERE id = ? AND userId = ?').bind(id, userId).run()
      return json({ deleted: (Number(res?.meta?.changes) || 0) > 0 })
    }

    // GET /api/v1/privacy/export
    if (path === '/api/v1/privacy/export' && method === 'GET') {
      const safeAll = (sql, ...binds) =>
        env.DB.prepare(sql)
          .bind(...binds)
          .all()
          .then((r) => r.results || [])
          .catch(() => [])
      const safeFirst = (sql, ...binds) =>
        env.DB.prepare(sql)
          .bind(...binds)
          .first()
          .catch(() => null)

      const [
        dbUser,
        userSettings,
        privacyRow,
        rawMemories,
        conversations,
        messages,
        files,
        facts,
        events,
        conflicts,
        sources,
        lessons,
        lessonRuns,
        graphNodes,
        graphEdges,
      ] = await Promise.all([
        safeFirst('SELECT id, email, name, avatarUrl, role, createdAt FROM users WHERE id = ?', userId),
        safeFirst('SELECT * FROM user_settings WHERE userId = ?', userId),
        safeFirst('SELECT * FROM mem_privacy_settings WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_entries WHERE userId = ? ORDER BY createdAt ASC', userId),
        safeAll('SELECT * FROM conversations WHERE userId = ? ORDER BY createdAt ASC', userId),
        safeAll(
          `SELECT m.id, m.conversationId, m.role, m.content, m.createdAt
           FROM messages m JOIN conversations c ON c.id = m.conversationId
           WHERE c.userId = ? ORDER BY m.createdAt ASC`,
          userId,
        ),
        safeAll('SELECT name, content, readonly, updatedAt FROM mem_files WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_facts WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_events WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_conflicts WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_sources WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_lessons WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_lesson_runs WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_graph_nodes WHERE userId = ?', userId),
        safeAll('SELECT * FROM mem_graph_edges WHERE userId = ?', userId),
      ])

      const decryptedMemories = []
      for (const m of rawMemories) {
        const plain = await vaultDecrypt(env, h, m.content)
        decryptedMemories.push({
          ...m,
          tags: parseTags(m.tags),
          pinned: Boolean(m.pinned),
          sensitive: Boolean(m.sensitive),
          content: plain ?? m.content,
        })
      }

      const msgsByConv = new Map()
      for (const msg of messages) {
        const list = msgsByConv.get(msg.conversationId) || []
        list.push(msg)
        msgsByConv.set(msg.conversationId, list)
      }

      return json({
        format: 'openagents-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        user: dbUser || { id: user.id, email: user.email, name: user.name, role: user.role },
        settings: userSettings,
        privacy: {
          localOnly: Boolean(privacyRow?.localOnly),
          ...(privacyRow?.localModel ? { localModel: privacyRow.localModel } : {}),
        },
        memories: decryptedMemories,
        conversations: conversations.map((c) => ({ ...c, messages: msgsByConv.get(c.id) || [] })),
        artifacts: [],
        featureData: {
          memoryFiles: files,
          memoryFacts: facts,
          memoryEvents: events,
          memoryConflicts: conflicts,
          memorySources: sources,
          lessons: { lessons: lessons.map(toLessonDto), runs: lessonRuns },
          knowledgeGraph: { nodes: graphNodes, edges: graphEdges },
        },
      })
    }

    // POST /api/v1/privacy/delete-all
    if (path === '/api/v1/privacy/delete-all' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const password = String(body?.password ?? '')
      if (!password) return json({ statusCode: 400, message: 'Password is required.' }, 400)

      const dbUser = await env.DB.prepare('SELECT passwordHash FROM users WHERE id = ?').bind(userId).first().catch(() => null)
      const valid = await verifyPasswordPbkdf2(password, String(dbUser?.passwordHash || ''))
      if (!valid) return json({ statusCode: 401, message: 'Password is incorrect.' }, 401)

      const deleted = {}
      const wipe = async (label, sql) => {
        try {
          const res = await env.DB.prepare(sql).bind(userId).run()
          deleted[label] = Number(res?.meta?.changes) || 0
        } catch {
          deleted[label] = 0
        }
      }

      await wipe('messages', 'DELETE FROM messages WHERE conversationId IN (SELECT id FROM conversations WHERE userId = ?)')
      await wipe('conversations', 'DELETE FROM conversations WHERE userId = ?')
      await wipe('memoryEntries', 'DELETE FROM mem_entries WHERE userId = ?')
      await wipe('memoryEvents', 'DELETE FROM mem_events WHERE userId = ?')
      await wipe('memoryFacts', 'DELETE FROM mem_facts WHERE userId = ?')
      await wipe('memoryConflicts', 'DELETE FROM mem_conflicts WHERE userId = ?')
      await wipe('memorySources', 'DELETE FROM mem_sources WHERE userId = ?')
      await wipe('lessons', 'DELETE FROM mem_lessons WHERE userId = ?')
      await wipe('lessonRuns', 'DELETE FROM mem_lesson_runs WHERE userId = ?')
      await wipe('graphEdges', 'DELETE FROM mem_graph_edges WHERE userId = ?')
      await wipe('graphNodes', 'DELETE FROM mem_graph_nodes WHERE userId = ?')
      await wipe('graphState', 'DELETE FROM mem_graph_state WHERE userId = ?')
      await wipe('privacySettings', 'DELETE FROM mem_privacy_settings WHERE userId = ?')
      await wipe('memoryFiles', 'DELETE FROM mem_files WHERE userId = ?')

      return json({
        ok: true,
        deleted,
        featureFilesRemoved: deleted.memoryFiles || 0,
      })
    }

    return json({ statusCode: 404, message: 'Not found' }, 404)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. REFLECTION & LESSONS ROUTES (/api/v1/reflection/*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isReflection) {
    // POST /api/v1/reflection/run
    if (path === '/api/v1/reflection/run' && method === 'POST') {
      const [factsRow, eventsRow] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS n FROM mem_facts WHERE userId = ?').bind(userId).first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM mem_events WHERE userId = ?').bind(userId).first(),
      ])
      return json({
        userId,
        skipped: false,
        facts: Number(factsRow?.n) || 0,
        events: Number(eventsRow?.n) || 0,
      })
    }

    // GET /api/v1/reflection/lessons
    if (path === '/api/v1/reflection/lessons' && method === 'GET') {
      const [lessonsRes, runsRes] = await Promise.all([
        env.DB.prepare('SELECT * FROM mem_lessons WHERE userId = ? ORDER BY createdAt DESC LIMIT 200')
          .bind(userId)
          .all(),
        env.DB.prepare('SELECT * FROM mem_lesson_runs WHERE userId = ? ORDER BY at DESC LIMIT 20')
          .bind(userId)
          .all(),
      ])
      const lessons = (lessonsRes.results || []).map(toLessonDto)
      const runs = (runsRes.results || []).map((r) => ({
        conversationId: r.conversationId,
        score: Number(r.score) || 0,
        summary: r.summary || '',
        at: r.at,
      }))
      const averageScore = runs.length
        ? Math.round(runs.reduce((sum, r) => sum + r.score, 0) / runs.length)
        : null
      return json({ lessons, runs, averageScore })
    }

    // POST /api/v1/reflection/lessons — create a lesson manually
    if (path === '/api/v1/reflection/lessons' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const text = String(body?.text ?? '').trim().slice(0, 200)
      if (!text) return json({ statusCode: 400, message: 'text is required.' }, 400)
      const kind = LESSON_KINDS.has(body?.kind) ? body.kind : 'do'
      const score = clampInt(body?.score, 0, 100, 75)
      const enabled = body?.enabled === false ? 0 : 1
      const conversationId = body?.conversationId ? String(body.conversationId).trim().slice(0, 120) : null
      const now = new Date().toISOString()
      const id = h.genId('lsn_')
      await env.DB.prepare(
        `INSERT INTO mem_lessons (id, userId, text, score, kind, enabled, conversationId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, userId, text, score, kind, enabled, conversationId, now)
        .run()
      const row = await env.DB.prepare('SELECT * FROM mem_lessons WHERE id = ? AND userId = ?').bind(id, userId).first()
      return json(toLessonDto(row), 201)
    }

    // GET /api/v1/reflection/lessons/preview
    if (path === '/api/v1/reflection/lessons/preview' && method === 'GET') {
      const res = await env.DB.prepare(
        'SELECT text, kind FROM mem_lessons WHERE userId = ? AND enabled = 1 ORDER BY createdAt DESC LIMIT 100',
      )
        .bind(userId)
        .all()
      const active = res.results || []
      if (active.length === 0) return json({ block: '' })
      const header = 'Lessons learned from past runs (apply when relevant):'
      const lines = []
      let size = header.length
      for (const l of active) {
        const line = `- ${l.kind === 'avoid' ? 'Avoid: ' : ''}${l.text}`
        if (size + line.length + 1 > LESSONS_BLOCK_CHAR_CAP) break
        lines.push(line)
        size += line.length + 1
      }
      return json({ block: lines.length ? `${header}\n${lines.join('\n')}` : '' })
    }

    // POST /api/v1/reflection/lessons/reflect (and /generate alias)
    if (
      (path === '/api/v1/reflection/lessons/reflect' || path === '/api/v1/reflection/lessons/generate') &&
      method === 'POST'
    ) {
      const body = await request.json().catch(() => ({}))
      const reqConvId = body?.conversationId ? String(body.conversationId).trim() : null
      const conv = reqConvId
        ? await env.DB.prepare('SELECT id, title FROM conversations WHERE id = ? AND userId = ?')
            .bind(reqConvId, userId)
            .first()
            .catch(() => null)
        : await env.DB.prepare('SELECT id, title FROM conversations WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1')
            .bind(userId)
            .first()
            .catch(() => null)
      if (!conv) return json({ skipped: true })

      const msgsRes = await env.DB.prepare(
        `SELECT role, content, createdAt FROM messages
         WHERE conversationId = ? ORDER BY createdAt DESC LIMIT 14`,
      )
        .bind(conv.id)
        .all()
        .catch(() => ({ results: [] }))
      const msgs = msgsRes.results || []
      if (msgs.length === 0) return json({ skipped: true })

      const lastStamp = String(msgs[0].createdAt || '')
      const prevRun = await env.DB.prepare(
        'SELECT lastMessageAt FROM mem_lesson_runs WHERE userId = ? AND conversationId = ? ORDER BY at DESC LIMIT 1',
      )
        .bind(userId, conv.id)
        .first()
      if (prevRun && prevRun.lastMessageAt && prevRun.lastMessageAt === lastStamp) {
        return json({ skipped: true })
      }

      const log = [...msgs]
        .reverse()
        .map((m) => `[${m.role}] ${String(m.content || '').slice(0, 700)}`)
        .join('\n')
        .slice(-7000)

      const parsed = await callUserLlmJson(
        env,
        h,
        userId,
        'Return only valid JSON.',
        'You review one completed AI agent run (user request + agent reply).\n' +
          '1. Score the outcome 0-100.\n' +
          '2. Extract at most 3 short, reusable, general lessons (no secrets).\n' +
          'Return STRICT JSON only:\n' +
          '{"score":0-100,"summary":"one sentence","lessons":[{"kind":"do"|"avoid"|"preference","text":"<=160 chars"}]}\n\n' +
          `--- RUN ---\n${log}`,
      )

      const now = new Date().toISOString()
      let score = 80
      let summary = `Reviewed conversation "${conv.title || conv.id}" (${msgs.length} messages).`
      let rawLessons = []

      if (parsed && typeof parsed === 'object') {
        score = clampInt(parsed.score, 0, 100, 80)
        if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
          summary = parsed.summary.trim().slice(0, 300)
        }
        if (Array.isArray(parsed.lessons)) rawLessons = parsed.lessons.slice(0, 3)
      }

      const existingRes = await env.DB.prepare('SELECT text FROM mem_lessons WHERE userId = ?').bind(userId).all()
      const existingTexts = new Set((existingRes.results || []).map((r) => String(r.text || '').toLowerCase()))
      const added = []

      for (const raw of rawLessons) {
        const text = typeof raw?.text === 'string' ? raw.text.trim().slice(0, 200) : ''
        if (!text || existingTexts.has(text.toLowerCase())) continue
        existingTexts.add(text.toLowerCase())
        const kind = LESSON_KINDS.has(raw?.kind) ? raw.kind : 'do'
        const id = h.genId('lsn_')
        await env.DB.prepare(
          `INSERT INTO mem_lessons (id, userId, text, score, kind, enabled, conversationId, createdAt)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        )
          .bind(id, userId, text, score, kind, conv.id, now)
          .run()
        added.push({ id, text, score, kind, enabled: true, conversationId: conv.id, createdAt: now })
      }

      await env.DB.prepare(
        `INSERT INTO mem_lesson_runs (id, userId, conversationId, score, summary, lastMessageAt, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(h.genId('lrun_'), userId, conv.id, score, summary, lastStamp, now)
        .run()

      return json({ score, summary, added })
    }

    // PATCH /api/v1/reflection/lessons/:id/toggle
    const toggleMatch = path.match(/^\/api\/v1\/reflection\/lessons\/([^/]+)\/toggle$/)
    if (toggleMatch && method === 'PATCH') {
      const id = decodeURIComponent(toggleMatch[1])
      const existing = await env.DB.prepare('SELECT * FROM mem_lessons WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      if (!existing) return json({ statusCode: 404, message: 'Lesson not found.' }, 404)
      const body = await request.json().catch(() => ({}))
      const enabled = typeof body?.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled ? 0 : 1
      await env.DB.prepare('UPDATE mem_lessons SET enabled = ? WHERE id = ? AND userId = ?')
        .bind(enabled, id, userId)
        .run()
      const updated = await env.DB.prepare('SELECT * FROM mem_lessons WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      return json(toLessonDto(updated))
    }

    // PATCH / DELETE /api/v1/reflection/lessons/:id
    const lessonIdMatch = path.match(/^\/api\/v1\/reflection\/lessons\/([^/]+)$/)
    if (lessonIdMatch) {
      const id = decodeURIComponent(lessonIdMatch[1])
      if (method === 'PATCH') {
        const existing = await env.DB.prepare('SELECT * FROM mem_lessons WHERE id = ? AND userId = ?')
          .bind(id, userId)
          .first()
        if (!existing) return json({ statusCode: 404, message: 'Lesson not found.' }, 404)
        const body = await request.json().catch(() => ({}))
        const text = typeof body?.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 200) : existing.text
        const kind = LESSON_KINDS.has(body?.kind) ? body.kind : existing.kind
        const score = body?.score !== undefined ? clampInt(body.score, 0, 100, existing.score) : existing.score
        const enabled = typeof body?.enabled === 'boolean' ? (body.enabled ? 1 : 0) : existing.enabled
        await env.DB.prepare('UPDATE mem_lessons SET text = ?, kind = ?, score = ?, enabled = ? WHERE id = ? AND userId = ?')
          .bind(text, kind, score, enabled, id, userId)
          .run()
        const updated = await env.DB.prepare('SELECT * FROM mem_lessons WHERE id = ? AND userId = ?')
          .bind(id, userId)
          .first()
        return json(toLessonDto(updated))
      }

      if (method === 'DELETE') {
        const res = await env.DB.prepare('DELETE FROM mem_lessons WHERE id = ? AND userId = ?').bind(id, userId).run()
        return json({ deleted: (Number(res?.meta?.changes) || 0) > 0 })
      }
    }

    return json({ statusCode: 404, message: 'Not found' }, 404)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. KNOWLEDGE GRAPH ROUTES (/api/v1/graph/*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isGraph) {
    // GET /api/v1/graph
    if (path === '/api/v1/graph' && method === 'GET') {
      const q = normText(url.searchParams.get('q') || '')
      const [nodesRes, edgesRes, stateRow] = await Promise.all([
        env.DB.prepare(
          'SELECT id, name, type, summary, mentionCount, createdAt, updatedAt FROM mem_graph_nodes WHERE userId = ? ORDER BY mentionCount DESC LIMIT 200',
        )
          .bind(userId)
          .all(),
        env.DB.prepare('SELECT id, fromId, toId, relation, weight FROM mem_graph_edges WHERE userId = ? LIMIT 500')
          .bind(userId)
          .all(),
        env.DB.prepare('SELECT lastRunAt FROM mem_graph_state WHERE userId = ?').bind(userId).first(),
      ])

      const allNodes = (nodesRes.results || []).map((n) => ({
        id: n.id,
        name: n.name,
        type: GRAPH_ENTITY_TYPES.has(n.type) ? n.type : 'topic',
        summary: n.summary || '',
        mentionCount: Number(n.mentionCount) || 1,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }))

      const nodes = q
        ? allNodes.filter((n) => normText(n.name).includes(q) || normText(n.summary).includes(q))
        : allNodes
      const nodeIds = new Set(nodes.map((n) => n.id))
      const edges = (edgesRes.results || [])
        .filter((e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId))
        .map((e) => ({
          id: e.id,
          fromId: e.fromId,
          toId: e.toId,
          relation: e.relation,
          weight: Number(e.weight) || 1,
        }))

      return json({
        nodes,
        edges,
        lastRunAt: stateRow?.lastRunAt || null,
        running: false,
      })
    }

    // GET /api/v1/graph/entity/:id
    const entityMatch = path.match(/^\/api\/v1\/graph\/entity\/([^/]+)$/)
    if (entityMatch && method === 'GET') {
      const id = decodeURIComponent(entityMatch[1])
      const node = await env.DB.prepare('SELECT * FROM mem_graph_nodes WHERE id = ? AND userId = ?')
        .bind(id, userId)
        .first()
      if (!node) return json({ statusCode: 404, message: 'Entity not found.' }, 404)

      const edgesRes = await env.DB.prepare(
        'SELECT * FROM mem_graph_edges WHERE userId = ? AND (fromId = ? OR toId = ?)',
      )
        .bind(userId, id, id)
        .all()
      const rawEdges = edgesRes.results || []
      const otherIds = Array.from(
        new Set(rawEdges.map((e) => (e.fromId === id ? e.toId : e.fromId)).filter(Boolean)),
      )

      const othersById = new Map()
      for (const oid of otherIds) {
        const o = await env.DB.prepare('SELECT id, name, type FROM mem_graph_nodes WHERE id = ? AND userId = ?')
          .bind(oid, userId)
          .first()
        if (o) othersById.set(o.id, { id: o.id, name: o.name, type: GRAPH_ENTITY_TYPES.has(o.type) ? o.type : 'topic' })
      }

      const relations = rawEdges.map((r) => {
        const direction = r.fromId === id ? 'out' : 'in'
        const otherId = direction === 'out' ? r.toId : r.fromId
        return {
          id: r.id,
          fromId: r.fromId,
          toId: r.toId,
          relation: r.relation,
          weight: Number(r.weight) || 1,
          direction,
          other: othersById.get(otherId) || null,
        }
      })

      const mentions = parseJson(node.mentions, [])
      return json({
        entity: {
          id: node.id,
          name: node.name,
          type: GRAPH_ENTITY_TYPES.has(node.type) ? node.type : 'topic',
          summary: node.summary || '',
          mentionCount: Number(node.mentionCount) || 1,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          mentions: Array.isArray(mentions) ? [...mentions].reverse() : [],
        },
        relations,
      })
    }

    // POST /api/v1/graph/rebuild
    if (path === '/api/v1/graph/rebuild' && method === 'POST') {
      const fullParam = (url.searchParams.get('full') || '').toLowerCase()
      const full = fullParam === 'true' || fullParam === '1'
      const result = await rebuildKnowledgeGraph(env, h, userId, full)
      return json(result)
    }

    return json({ statusCode: 404, message: 'Not found' }, 404)
  }

  return null
}
