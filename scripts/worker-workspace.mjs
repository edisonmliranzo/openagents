// Workspace, Artifacts, Library, Tools, Audit, Costs/Usage, Metrics, and Onboarding Analytics
// Cloudflare Worker module for OpenAgents.
//
// Exported entry point:
//   export async function handleWorkspaceRoutes({ request, env, url, path, method, origin, user, h })
// Returns a Response for handled routes, or null otherwise.

const VALID_ARTIFACT_TYPES = new Set([
  'doc',
  'report',
  'spreadsheet',
  'landing_page',
  'dataset_export',
  'brief',
  'document',
  'website',
  'code',
  'image',
  'video',
  'audio',
])
const VALID_ARTIFACT_STATUSES = new Set(['draft', 'generated', 'published', 'archived'])
const VALID_WORKSPACE_ROLES = new Set(['owner', 'admin', 'editor', 'viewer'])
const VALID_MEMORY_TYPES = new Set(['fact', 'summary', 'note'])
const VALID_ROUTER_MODES = new Set(['manual', 'auto-cheapest', 'balanced', 'best'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_ARTIFACT_CONTENT = 250_000
const MAX_LIBRARY_CONTENT = 200_000
const LIBRARY_CHUNK_SIZE = 800
const LIBRARY_CHUNK_OVERLAP = 100
const MAX_LIBRARY_CHUNKS = 300

const WORKER_STARTED_AT = Date.now()

// Approximate pricing per 1M tokens (USD) — synced with apps/api/src/cost/cost.service.ts
const MODEL_PRICING = {
  'claude-sonnet-5.5': { input: 3.0, output: 15.0 },
  'claude-opus-5.5': { input: 5.2, output: 26.0 },
  'claude-haiku-5.5': { input: 0.8, output: 4.0 },
  'gpt-6.1-sol-pro': { input: 3.0, output: 15.0 },
  'gpt-6.1-terra-pro': { input: 3.0, output: 15.0 },
  'gpt-6-luna-pro': { input: 1.5, output: 6.0 },
  'gpt-6-luna': { input: 0.4, output: 1.6 },
  'kimi-k2.7-code': { input: 1.08, output: 6.3 },
  'kimi-k3.1-pro': { input: 1.5, output: 7.5 },
  'deepseek-v4.1-flash': { input: 0.14, output: 0.28 },
  'deepseek-v4-pro-0813': { input: 0.55, output: 2.19 },
  'gemini-4-argon': { input: 1.25, output: 5.0 },
  'gemini-3.8-flash': { input: 0.1, output: 0.4 },
  'grok-4.7': { input: 2.0, output: 10.0 },
  'qwen3.8-max-prime': { input: 1.6, output: 6.4 },
  'qwen3.8-flash': { input: 0.15, output: 0.6 },
  'llama-4-maverick': { input: 0.2, output: 0.6 },
  'llama-4-scout': { input: 0.1, output: 0.3 },
  'mistral-large-4-0': { input: 2.0, output: 6.0 },
  'devstral-2512': { input: 0.4, output: 1.2 },
  'minimax-m3.1-flash': { input: 0.2, output: 0.8 },
  'glm-5.3': { input: 0.5, output: 2.0 },
  default: { input: 1.0, output: 3.0 },
}

const DEFAULT_ROUTER_SETTINGS = {
  mode: 'manual',
  tiers: {
    simple: { provider: 'apisrouter', model: 'deepseek-v4.1-flash' },
    standard: { provider: 'apisrouter', model: 'kimi-k2.7-code' },
    complex: { provider: 'apisrouter', model: 'claude-sonnet-5.5' },
  },
  monthlyBudgetUsd: 0,
  alertThresholdPct: 80,
}

const DEFAULT_WORKSPACE_SETTINGS = {
  allowMemberInvites: true,
  requireApprovalForNewMembers: false,
  defaultMemberRole: 'editor',
  sharedMemoryEnabled: true,
  sharedAgentsEnabled: true,
}

const ROLE_PERMISSIONS = {
  owner: ['workspace:manage', 'members:manage', 'memory:write', 'share:write', 'read'],
  admin: ['workspace:manage', 'members:manage', 'memory:write', 'share:write', 'read'],
  editor: ['memory:write', 'share:write', 'read'],
  viewer: ['read'],
}

// Real tool catalog supported by the Cloudflare Worker runtime.
const WORKER_TOOL_CATALOG = [
  {
    id: 'tool_chat_completion',
    name: 'chat_completion',
    displayName: 'LLM Chat Completion',
    description: 'Streams responses from the user-configured LLM provider (APIsRouter or BYOK).',
    category: 'custom',
    requiresApproval: false,
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Prompt text to send to the model' },
        model: { type: 'string', description: 'Optional model override' },
      },
      required: ['prompt'],
    },
  },
  {
    id: 'tool_library_search',
    name: 'library_search',
    displayName: 'Library Knowledge Search',
    description: 'Searches indexed documents and chunks in your private OpenAgents Library.',
    category: 'notes',
    requiresApproval: false,
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        topK: { type: 'number', description: 'Maximum matching passages to return' },
      },
      required: ['query'],
    },
  },
  {
    id: 'tool_artifact_create',
    name: 'artifact_create',
    displayName: 'Artifact Generator',
    description: 'Creates versioned documents, briefs, reports, and HTML landing pages in your Artifact Workspace.',
    category: 'notes',
    requiresApproval: false,
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Artifact title' },
        type: { type: 'string', description: 'Artifact type (doc, report, landing_page, brief, spreadsheet, dataset_export)' },
        content: { type: 'string', description: 'Artifact body content' },
      },
      required: ['title', 'type'],
    },
  },
  {
    id: 'tool_workspace_memory',
    name: 'workspace_memory',
    displayName: 'Workspace Memory',
    description: 'Stores and retrieves durable facts, summaries, and notes scoped to a team workspace.',
    category: 'notes',
    requiresApproval: false,
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Target workspace ID' },
        title: { type: 'string', description: 'Memory entry title' },
        content: { type: 'string', description: 'Memory content' },
      },
      required: ['workspaceId', 'title', 'content'],
    },
  },
  {
    id: 'tool_avatar_tts',
    name: 'avatar_tts',
    displayName: 'Voice Synthesis (TTS)',
    description: 'Synthesizes speech audio using the configured ElevenLabs or Fish Audio voice provider.',
    category: 'custom',
    requiresApproval: false,
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to synthesize into speech' },
        voiceId: { type: 'string', description: 'Optional voice ID override' },
      },
      required: ['text'],
    },
  },
  {
    id: 'tool_phone_call',
    name: 'phone_call',
    displayName: 'Outbound Voice Call',
    description: 'Places an outbound AI-assisted phone call via Twilio to a specified phone number.',
    category: 'custom',
    requiresApproval: true,
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {
        toNumber: { type: 'string', description: 'Destination phone number in E.164 format' },
        goal: { type: 'string', description: 'Objective of the phone call' },
      },
      required: ['toNumber', 'goal'],
    },
  },
]

const COMPLEX_KEYWORDS = [
  'architect', 'refactor', 'design', 'prove', 'analy', 'debug', 'optimi', 'migrat',
  'research', 'strategy', 'plan', 'multi-step', 'step by step', 'compare', 'security', 'algorithm',
]
const TOOL_KEYWORDS = [
  'search', 'browse', 'fetch', 'download', 'run ', 'execute', 'deploy', 'email', 'calendar',
  'file', 'commit', 'schedule', 'scrape', 'latest', 'today',
]
const SIMPLE_KEYWORDS = ['hi', 'hello', 'thanks', 'thank you', 'translate', 'summarize', 'define', 'what is']

// ── Schema bootstrap ────────────────────────────────────────────────────────

let schemaReady = false

async function ensureWorkspaceSchema(env) {
  if (schemaReady) return
  const statements = [
    `CREATE TABLE IF NOT EXISTS ws_onboarding_events (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       step TEXT NOT NULL,
       meta TEXT,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_onboarding_user ON ws_onboarding_events(userId, createdAt)`,

    `CREATE TABLE IF NOT EXISTS ws_artifacts (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       workspaceId TEXT,
       title TEXT NOT NULL,
       type TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'draft',
       summary TEXT,
       labels TEXT NOT NULL DEFAULT '[]',
       source TEXT NOT NULL DEFAULT '{}',
       currentVersionId TEXT,
       versionCount INTEGER NOT NULL DEFAULT 1,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_artifacts_user ON ws_artifacts(userId, updatedAt)`,

    `CREATE TABLE IF NOT EXISTS ws_artifact_versions (
       id TEXT PRIMARY KEY,
       artifactId TEXT NOT NULL,
       userId TEXT NOT NULL,
       version INTEGER NOT NULL,
       format TEXT NOT NULL DEFAULT 'markdown',
       content TEXT NOT NULL,
       note TEXT,
       metadata TEXT,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_artifact_versions_art ON ws_artifact_versions(artifactId, version)`,

    `CREATE TABLE IF NOT EXISTS ws_artifact_templates (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       workspaceId TEXT,
       name TEXT NOT NULL,
       description TEXT,
       type TEXT NOT NULL,
       defaultFormat TEXT NOT NULL DEFAULT 'markdown',
       outline TEXT,
       promptGuide TEXT,
       fieldSchema TEXT NOT NULL DEFAULT '[]',
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_artifact_templates_user ON ws_artifact_templates(userId, updatedAt)`,

    `CREATE TABLE IF NOT EXISTS ws_library_documents (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       title TEXT NOT NULL,
       source TEXT NOT NULL DEFAULT 'upload',
       mimeType TEXT NOT NULL DEFAULT 'text/plain',
       status TEXT NOT NULL DEFAULT 'indexed',
       chunkCount INTEGER NOT NULL DEFAULT 0,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_library_docs_user ON ws_library_documents(userId, updatedAt)`,

    `CREATE TABLE IF NOT EXISTS ws_library_chunks (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       documentId TEXT NOT NULL,
       ordinal INTEGER NOT NULL,
       text TEXT NOT NULL,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_library_chunks_user_doc ON ws_library_chunks(userId, documentId)`,

    `CREATE TABLE IF NOT EXISTS ws_audit_logs (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       action TEXT NOT NULL,
       resourceType TEXT NOT NULL,
       resourceId TEXT NOT NULL,
       category TEXT,
       severity TEXT,
       description TEXT,
       metadata TEXT,
       reversible INTEGER NOT NULL DEFAULT 0,
       undoneAt TEXT,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_audit_user ON ws_audit_logs(userId, createdAt)`,

    `CREATE TABLE IF NOT EXISTS ws_router_settings (
       userId TEXT PRIMARY KEY,
       mode TEXT NOT NULL DEFAULT 'manual',
       tiers TEXT NOT NULL,
       monthlyBudgetUsd REAL NOT NULL DEFAULT 0,
       alertThresholdPct INTEGER NOT NULL DEFAULT 80,
       updatedAt TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS ws_workspaces (
       id TEXT PRIMARY KEY,
       ownerId TEXT NOT NULL,
       name TEXT NOT NULL,
       description TEXT,
       settings TEXT NOT NULL DEFAULT '{}',
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_workspaces_owner ON ws_workspaces(ownerId)`,

    `CREATE TABLE IF NOT EXISTS ws_workspace_members (
       id TEXT PRIMARY KEY,
       workspaceId TEXT NOT NULL,
       userId TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT 'viewer',
       permissions TEXT NOT NULL DEFAULT '[]',
       invitedByUserId TEXT,
       joinedAt TEXT NOT NULL,
       UNIQUE(workspaceId, userId)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_ws_members_user ON ws_workspace_members(userId)`,
    `CREATE INDEX IF NOT EXISTS idx_ws_ws_members_ws ON ws_workspace_members(workspaceId)`,

    `CREATE TABLE IF NOT EXISTS ws_workspace_invitations (
       id TEXT PRIMARY KEY,
       workspaceId TEXT NOT NULL,
       email TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT 'editor',
       invitedBy TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending',
       expiresAt TEXT NOT NULL,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_ws_inv_email ON ws_workspace_invitations(email, status)`,
    `CREATE INDEX IF NOT EXISTS idx_ws_ws_inv_ws ON ws_workspace_invitations(workspaceId)`,

    `CREATE TABLE IF NOT EXISTS ws_workspace_memory (
       id TEXT PRIMARY KEY,
       workspaceId TEXT NOT NULL,
       createdByUserId TEXT NOT NULL,
       type TEXT NOT NULL DEFAULT 'note',
       title TEXT NOT NULL,
       content TEXT NOT NULL,
       tags TEXT NOT NULL DEFAULT '[]',
       sourceRef TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_ws_memory_ws ON ws_workspace_memory(workspaceId, createdAt)`,

    `CREATE TABLE IF NOT EXISTS ws_workspace_shares (
       id TEXT PRIMARY KEY,
       workspaceId TEXT NOT NULL,
       kind TEXT NOT NULL,
       entityId TEXT NOT NULL,
       title TEXT NOT NULL,
       sharedByUserId TEXT NOT NULL,
       createdAt TEXT NOT NULL,
       UNIQUE(workspaceId, kind, entityId)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ws_ws_shares_ws ON ws_workspace_shares(workspaceId, kind)`,
  ]

  for (const sql of statements) {
    await env.DB.prepare(sql).run()
  }
  schemaReady = true
}

// ── General helpers ─────────────────────────────────────────────────────────

function parseJson(val, fallback) {
  if (val == null) return fallback
  if (typeof val !== 'string') return val
  try {
    return JSON.parse(val)
  } catch {
    return fallback
  }
}

async function readBody(request) {
  try {
    const data = await request.json()
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

async function safeAll(env, sql, params = []) {
  try {
    const res = await env.DB.prepare(sql).bind(...params).all()
    return Array.isArray(res?.results) ? res.results : []
  } catch {
    return []
  }
}

async function safeFirst(env, sql, params = []) {
  try {
    const row = await env.DB.prepare(sql).bind(...params).first()
    return row ?? null
  } catch {
    return null
  }
}

function toDayKey(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (!Number.isFinite(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function estimateCostUsd(model, inputTokens, outputTokens) {
  const key = String(model || '').toLowerCase()
  const rate = MODEL_PRICING[key] || MODEL_PRICING.default
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000
}

function roundUsd(n) {
  return Math.round((Number(n) || 0) * 1_000_000) / 1_000_000
}

async function writeAuditLog(env, h, userId, entry) {
  try {
    const now = new Date().toISOString()
    await env.DB.prepare(
      `INSERT INTO ws_audit_logs
        (id, userId, action, resourceType, resourceId, category, severity, description, metadata, reversible, undoneAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
      .bind(
        h.genId('aud'),
        userId,
        String(entry.action || 'action').slice(0, 100),
        String(entry.resourceType || 'resource').slice(0, 80),
        String(entry.resourceId || '').slice(0, 120),
        entry.category ? String(entry.category).slice(0, 60) : null,
        entry.severity ? String(entry.severity).slice(0, 30) : 'info',
        entry.description ? String(entry.description).slice(0, 400) : null,
        entry.metadata ? JSON.stringify(entry.metadata).slice(0, 4000) : null,
        entry.reversible ? 1 : 0,
        now,
      )
      .run()
  } catch {
    // Audit logging is best-effort and must not break primary operations.
  }
}

// ── Artifacts helpers ───────────────────────────────────────────────────────

function mapArtifactVersion(row) {
  return {
    id: row.id,
    artifactId: row.artifactId,
    version: Number(row.version) || 1,
    format: row.format || 'markdown',
    content: row.content || '',
    ...(row.note ? { note: row.note } : {}),
    ...(row.metadata ? { metadata: parseJson(row.metadata, undefined) } : {}),
    createdAt: row.createdAt,
  }
}

function buildArtifactDto(row, versions) {
  const mappedVersions = versions.map(mapArtifactVersion)
  const latest =
    mappedVersions.find((v) => v.id === row.currentVersionId) ||
    mappedVersions[mappedVersions.length - 1] || {
      id: row.currentVersionId || `${row.id}_v1`,
      artifactId: row.id,
      version: 1,
      format: 'markdown',
      content: '',
      createdAt: row.createdAt,
    }
  return {
    id: row.id,
    userId: row.userId,
    ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
    title: row.title,
    type: row.type,
    status: row.status || 'draft',
    ...(row.summary ? { summary: row.summary } : {}),
    labels: parseJson(row.labels, []),
    source: parseJson(row.source, {}),
    currentVersion: latest,
    versionCount: Math.max(Number(row.versionCount) || mappedVersions.length || 1, mappedVersions.length),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapArtifactTemplate(row) {
  return {
    id: row.id,
    userId: row.userId,
    ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    type: row.type,
    defaultFormat: row.defaultFormat || 'markdown',
    ...(row.outline ? { outline: row.outline } : {}),
    ...(row.promptGuide ? { promptGuide: row.promptGuide } : {}),
    fieldSchema: parseJson(row.fieldSchema, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function defaultFormatForType(type) {
  if (type === 'landing_page' || type === 'website') return 'html'
  if (type === 'spreadsheet' || type === 'dataset_export') return 'csv'
  return 'markdown'
}

function exportMimeAndExt(format) {
  const f = String(format || 'markdown').toLowerCase()
  if (f === 'html') return { mimeType: 'text/html', ext: 'html' }
  if (f === 'json') return { mimeType: 'application/json', ext: 'json' }
  if (f === 'csv') return { mimeType: 'text/csv', ext: 'csv' }
  if (f === 'txt' || f === 'text') return { mimeType: 'text/plain', ext: 'txt' }
  return { mimeType: 'text/markdown', ext: 'md' }
}

function slugifyFileName(title) {
  const clean = String(title || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return clean || 'artifact'
}

// ── Library helpers ─────────────────────────────────────────────────────────

function chunkText(content) {
  const clean = String(content || '').trim()
  if (!clean) return []
  const chunks = []
  let start = 0
  while (start < clean.length && chunks.length < MAX_LIBRARY_CHUNKS) {
    const end = Math.min(clean.length, start + LIBRARY_CHUNK_SIZE)
    const slice = clean.slice(start, end).trim()
    if (slice) chunks.push(slice)
    if (end >= clean.length) break
    start = Math.max(start + 1, end - LIBRARY_CHUNK_OVERLAP)
  }
  return chunks
}

function tokenizeQuery(text) {
  return Array.from(
    new Set(
      String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2),
    ),
  )
}

function scoreChunk(chunkTextStr, titleStr, queryLower, terms) {
  const haystack = chunkTextStr.toLowerCase()
  const titleLower = String(titleStr || '').toLowerCase()
  let score = 0
  if (queryLower.length >= 3 && haystack.includes(queryLower)) score += 0.55
  if (queryLower.length >= 3 && titleLower.includes(queryLower)) score += 0.25
  if (terms.length > 0) {
    let matchedTerms = 0
    let freqBonus = 0
    for (const term of terms) {
      let idx = haystack.indexOf(term)
      if (idx !== -1) {
        matchedTerms += 1
        let count = 0
        while (idx !== -1 && count < 5) {
          count += 1
          idx = haystack.indexOf(term, idx + term.length)
        }
        freqBonus += Math.min(0.08, count * 0.02)
      } else if (titleLower.includes(term)) {
        matchedTerms += 0.7
      }
    }
    score += (matchedTerms / terms.length) * 0.65 + freqBonus
  }
  return Math.min(0.99, Math.round(score * 1000) / 1000)
}

// ── Cost & Router helpers ───────────────────────────────────────────────────

async function getRouterSettings(env, userId) {
  const row = await safeFirst(env, 'SELECT * FROM ws_router_settings WHERE userId = ?', [userId])
  if (!row) {
    return {
      ...DEFAULT_ROUTER_SETTINGS,
      tiers: {
        simple: { ...DEFAULT_ROUTER_SETTINGS.tiers.simple },
        standard: { ...DEFAULT_ROUTER_SETTINGS.tiers.standard },
        complex: { ...DEFAULT_ROUTER_SETTINGS.tiers.complex },
      },
    }
  }
  const parsedTiers = parseJson(row.tiers, {})
  return {
    mode: VALID_ROUTER_MODES.has(row.mode) ? row.mode : 'manual',
    tiers: {
      simple: {
        provider: String(parsedTiers?.simple?.provider || DEFAULT_ROUTER_SETTINGS.tiers.simple.provider),
        model: String(parsedTiers?.simple?.model || DEFAULT_ROUTER_SETTINGS.tiers.simple.model),
      },
      standard: {
        provider: String(parsedTiers?.standard?.provider || DEFAULT_ROUTER_SETTINGS.tiers.standard.provider),
        model: String(parsedTiers?.standard?.model || DEFAULT_ROUTER_SETTINGS.tiers.standard.model),
      },
      complex: {
        provider: String(parsedTiers?.complex?.provider || DEFAULT_ROUTER_SETTINGS.tiers.complex.provider),
        model: String(parsedTiers?.complex?.model || DEFAULT_ROUTER_SETTINGS.tiers.complex.model),
      },
    },
    monthlyBudgetUsd: Math.max(0, Number(row.monthlyBudgetUsd) || 0),
    alertThresholdPct: Math.min(100, Math.max(10, Number(row.alertThresholdPct) || 80)),
    updatedAt: row.updatedAt,
  }
}

function classifyPrompt(prompt, toolCount = 0) {
  const text = String(prompt || '').toLowerCase()
  const reasons = []
  let score = 0

  const len = text.length
  if (len > 4000) {
    score += 35
    reasons.push('very long prompt')
  } else if (len > 1200) {
    score += 20
    reasons.push('long prompt')
  } else if (len > 300) {
    score += 10
    reasons.push('medium prompt')
  }

  const codeSignals = (text.match(/```|function |class |import |=>|def |select .* from|\{\s*\n/g) || []).length
  if (codeSignals > 0) {
    score += Math.min(30, 12 + codeSignals * 4)
    reasons.push('contains code')
  }

  const complexHits = COMPLEX_KEYWORDS.filter((k) => text.includes(k))
  if (complexHits.length) {
    score += Math.min(30, complexHits.length * 10)
    reasons.push(`complex keywords: ${complexHits.slice(0, 3).join(', ')}`)
  }

  const toolHits = TOOL_KEYWORDS.filter((k) => text.includes(k))
  if (toolHits.length) {
    score += Math.min(20, toolHits.length * 7)
    reasons.push('likely needs tools')
  }
  if (Number(toolCount) > 10) score += 5

  if (len < 120 && SIMPLE_KEYWORDS.some((k) => text.startsWith(k) || text.includes(` ${k}`))) {
    score -= 15
    reasons.push('simple conversational ask')
  }

  score = Math.max(0, Math.min(100, score))
  const tier = score >= 45 ? 'complex' : score >= 15 ? 'standard' : 'simple'
  return { tier, score, reasons }
}

async function computeUserUsageData(env, userId, startIso, endIso) {
  const settings = await safeFirst(
    env,
    'SELECT preferredProvider, preferredModel FROM user_settings WHERE userId = ?',
    [userId],
  )
  const defaultProvider = settings?.preferredProvider || 'apisrouter'
  const defaultModel = settings?.preferredModel || 'claude-sonnet-5.5'

  const rows = await safeAll(
    env,
    `SELECT m.id, m.conversationId, m.role, m.content, m.status, m.toolCallJson, m.toolResultJson, m.createdAt,
            c.model AS convModel, c.modelProvider AS convProvider
       FROM messages m
       JOIN conversations c ON c.id = m.conversationId
      WHERE c.userId = ?
        AND m.createdAt >= ?
        AND m.createdAt <= ?
      ORDER BY m.createdAt ASC
      LIMIT 5000`,
    [userId, startIso, endIso],
  )

  const byProvider = {}
  const byModel = {}
  const byTool = {}
  const dailyMap = {}
  const convRunSet = new Set()
  const historyEntries = []

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalRuns = 0
  let totalLlmCostUsd = 0
  let totalToolCalls = 0
  let totalToolSuccesses = 0
  let totalToolFailures = 0

  // Track last user message tokens per conversation for pairing with agent replies.
  const pendingInputByConv = new Map()

  for (const row of rows) {
    const provider = row.convProvider || defaultProvider
    const model = row.convModel || defaultModel
    const day = toDayKey(row.createdAt)
    const tokens = estimateTokens(row.content)

    if (!dailyMap[day]) {
      dailyMap[day] = {
        date: day,
        runs: 0,
        llmCostUsd: 0,
        toolCostUsd: 0,
        totalCostUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        tokens: 0,
        costUsd: 0,
        toolCalls: 0,
        toolSuccesses: 0,
        toolFailures: 0,
        toolSuccessRate: 0,
      }
    }

    if (row.role === 'user') {
      totalInputTokens += tokens
      dailyMap[day].inputTokens += tokens
      dailyMap[day].tokens += tokens
      pendingInputByConv.set(row.conversationId, (pendingInputByConv.get(row.conversationId) || 0) + tokens)
    } else if (row.role === 'agent' || row.role === 'assistant') {
      const pairedIn = pendingInputByConv.get(row.conversationId) || 0
      pendingInputByConv.delete(row.conversationId)
      const outTokens = tokens
      const runCost = estimateCostUsd(model, pairedIn, outTokens)

      totalOutputTokens += outTokens
      totalRuns += 1
      totalLlmCostUsd += runCost
      convRunSet.add(row.conversationId)

      dailyMap[day].runs += 1
      dailyMap[day].outputTokens += outTokens
      dailyMap[day].tokens += outTokens
      dailyMap[day].llmCostUsd += runCost
      dailyMap[day].totalCostUsd += runCost
      dailyMap[day].costUsd += runCost

      if (!byProvider[provider]) {
        byProvider[provider] = { provider, runs: 0, llmCalls: 0, inputTokens: 0, outputTokens: 0, tokens: 0, costUsd: 0, estimatedCostUsd: 0 }
      }
      byProvider[provider].runs += 1
      byProvider[provider].llmCalls += 1
      byProvider[provider].inputTokens += pairedIn
      byProvider[provider].outputTokens += outTokens
      byProvider[provider].tokens += pairedIn + outTokens
      byProvider[provider].costUsd += runCost
      byProvider[provider].estimatedCostUsd += runCost

      if (!byModel[model]) {
        byModel[model] = { provider, model, runs: 0, llmCalls: 0, inputTokens: 0, outputTokens: 0, tokens: 0, costUsd: 0, estimatedCostUsd: 0 }
      }
      byModel[model].runs += 1
      byModel[model].llmCalls += 1
      byModel[model].inputTokens += pairedIn
      byModel[model].outputTokens += outTokens
      byModel[model].tokens += pairedIn + outTokens
      byModel[model].costUsd += runCost
      byModel[model].estimatedCostUsd += runCost

      historyEntries.push({
        id: row.id,
        userId,
        provider,
        model,
        inputTokens: pairedIn,
        outputTokens: outTokens,
        estimatedCostUsd: roundUsd(runCost),
        conversationId: row.conversationId,
        createdAt: row.createdAt,
      })
    }

    if (row.toolCallJson) {
      const tc = parseJson(row.toolCallJson, null)
      const tr = parseJson(row.toolResultJson, null)
      const calls = Array.isArray(tc) ? tc : tc ? [tc] : []
      for (const call of calls) {
        const toolName = String(call?.name || call?.function?.name || 'unknown_tool')
        const failed = Boolean(tr?.error || row.status === 'error')
        totalToolCalls += 1
        if (failed) totalToolFailures += 1
        else totalToolSuccesses += 1

        dailyMap[day].toolCalls += 1
        if (failed) dailyMap[day].toolFailures += 1
        else dailyMap[day].toolSuccesses += 1

        if (!byTool[toolName]) {
          byTool[toolName] = { toolName, calls: 0, successes: 0, failures: 0, successRate: 0, estimatedCostUsd: 0 }
        }
        byTool[toolName].calls += 1
        if (failed) byTool[toolName].failures += 1
        else byTool[toolName].successes += 1
      }
    }
  }

  for (const t of Object.values(byTool)) {
    t.successRate = t.calls > 0 ? t.successes / t.calls : 0
  }
  for (const d of Object.values(dailyMap)) {
    d.llmCostUsd = roundUsd(d.llmCostUsd)
    d.toolCostUsd = roundUsd(d.toolCostUsd)
    d.totalCostUsd = roundUsd(d.totalCostUsd)
    d.costUsd = roundUsd(d.costUsd)
    d.toolSuccessRate = d.toolCalls > 0 ? d.toolSuccesses / d.toolCalls : 0
  }
  for (const p of Object.values(byProvider)) {
    p.costUsd = roundUsd(p.costUsd)
    p.estimatedCostUsd = roundUsd(p.estimatedCostUsd)
  }
  for (const m of Object.values(byModel)) {
    m.costUsd = roundUsd(m.costUsd)
    m.estimatedCostUsd = roundUsd(m.estimatedCostUsd)
    m.avgCostPerRunUsd = m.runs > 0 ? roundUsd(m.estimatedCostUsd / m.runs) : 0
  }

  return {
    totalCostUsd: roundUsd(totalLlmCostUsd),
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalRuns,
    totalToolCalls,
    totalToolSuccesses,
    totalToolFailures,
    toolSuccessRate: totalToolCalls > 0 ? totalToolSuccesses / totalToolCalls : 0,
    conversationCount: convRunSet.size,
    messageCount: rows.length,
    byProvider,
    byModel,
    byTool,
    dailyMap,
    historyEntries: historyEntries.reverse(),
  }
}

function buildDailySeries(dailyMap, startIso, endIso) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const out = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  let guard = 0
  while (cursor <= endUtc && guard < 400) {
    const key = cursor.toISOString().slice(0, 10)
    out.push(
      dailyMap[key] || {
        date: key,
        runs: 0,
        llmCostUsd: 0,
        toolCostUsd: 0,
        totalCostUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        tokens: 0,
        costUsd: 0,
        toolCalls: 0,
        toolSuccesses: 0,
        toolFailures: 0,
        toolSuccessRate: 0,
      },
    )
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    guard += 1
  }
  return out
}

async function buildSubscriptionSnapshot(env, userId) {
  const sub = await safeFirst(env, 'SELECT plan, status, current_period_end, updated_at FROM subscriptions WHERE user_id = ?', [userId])
  const trial = await safeFirst(env, 'SELECT messages, updatedAt FROM trial_usage WHERE userId = ?', [userId])
  const convCount = await safeFirst(env, 'SELECT COUNT(*) AS cnt FROM conversations WHERE userId = ?', [userId])
  const quotaRow = await safeFirst(env, 'SELECT SUM(count) AS total FROM quota_counters WHERE bucket LIKE ?', [`%:${userId}%`])

  const rawPlan = String(sub?.plan || 'free').toLowerCase()
  const planId = rawPlan === 'team' ? 'team' : rawPlan === 'pro' ? 'pro' : 'free'
  const planMeta = {
    free: { label: 'Free', price: 0, msgLimit: 500 },
    pro: { label: 'Pro', price: 19, msgLimit: 10000 },
    team: { label: 'Team', price: 49, msgLimit: null },
  }[planId]

  const trialUsed = Number(trial?.messages || 0)
  const quotaUsed = Number(quotaRow?.total || 0)
  const sessionsUsed = Number(convCount?.cnt || 0)

  return {
    planId,
    planLabel: planMeta.label,
    priceUsdMonthly: planMeta.price,
    currency: 'USD',
    renewsAt: sub?.current_period_end || null,
    updatedAt: sub?.updated_at || new Date().toISOString(),
    featureGates: [
      { id: 'byok', label: 'Bring Your Own API Key', enabled: true },
      { id: 'artifacts', label: 'Artifact Workspace', enabled: true },
      { id: 'library', label: 'Private Knowledge Library', enabled: true },
      { id: 'workspaces', label: 'Team Workspaces', enabled: true },
    ],
    quotas: [
      {
        id: 'trial_messages',
        label: 'Platform Trial Messages',
        unit: 'messages',
        limit: Number.parseInt(String(env.TRIAL_MESSAGES || '15'), 10) || 15,
        used: trialUsed,
        remaining: Math.max(0, (Number.parseInt(String(env.TRIAL_MESSAGES || '15'), 10) || 15) - trialUsed),
      },
      {
        id: 'conversations',
        label: 'Conversations',
        unit: 'sessions',
        limit: planMeta.msgLimit,
        used: sessionsUsed,
        remaining: planMeta.msgLimit != null ? Math.max(0, planMeta.msgLimit - sessionsUsed) : null,
      },
      ...(quotaUsed > 0
        ? [{ id: 'rate_quota', label: 'Active Quota Window', unit: 'requests', limit: null, used: quotaUsed, remaining: null }]
        : []),
    ],
  }
}

// ── Workspaces helpers ──────────────────────────────────────────────────────

async function getWorkspaceMembership(env, workspaceId, userId) {
  return safeFirst(
    env,
    'SELECT * FROM ws_workspace_members WHERE workspaceId = ? AND userId = ?',
    [workspaceId, userId],
  )
}

async function hydrateWorkspace(env, wsRow) {
  const [members, invitations, memoryRows, shareRows] = await Promise.all([
    safeAll(env, 'SELECT * FROM ws_workspace_members WHERE workspaceId = ? ORDER BY joinedAt ASC', [wsRow.id]),
    safeAll(env, 'SELECT * FROM ws_workspace_invitations WHERE workspaceId = ? ORDER BY createdAt DESC', [wsRow.id]),
    safeAll(env, 'SELECT * FROM ws_workspace_memory WHERE workspaceId = ? ORDER BY createdAt DESC LIMIT 100', [wsRow.id]),
    safeAll(env, 'SELECT * FROM ws_workspace_shares WHERE workspaceId = ? ORDER BY createdAt DESC LIMIT 200', [wsRow.id]),
  ])

  const nowMs = Date.now()
  const mappedMembers = members.map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role,
    permissions: parseJson(m.permissions, ROLE_PERMISSIONS[m.role] || ['read']),
    ...(m.invitedByUserId ? { invitedByUserId: m.invitedByUserId } : {}),
    joinedAt: m.joinedAt,
  }))

  const mappedInvitations = invitations.map((inv) => {
    const expired = inv.status === 'pending' && new Date(inv.expiresAt).getTime() < nowMs
    return {
      id: inv.id,
      workspaceId: inv.workspaceId,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt,
      status: expired ? 'expired' : inv.status,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    }
  })

  const mappedMemory = memoryRows.map((entry) => ({
    id: entry.id,
    workspaceId: entry.workspaceId,
    createdByUserId: entry.createdByUserId,
    type: entry.type || 'note',
    title: entry.title,
    content: entry.content,
    tags: parseJson(entry.tags, []),
    ...(entry.sourceRef ? { sourceRef: entry.sourceRef } : {}),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }))

  const conversations = []
  const workflows = []
  const artifacts = []
  for (const s of shareRows) {
    if (s.kind === 'conversation') {
      conversations.push({
        id: s.id,
        workspaceId: s.workspaceId,
        conversationId: s.entityId,
        title: s.title,
        sharedByUserId: s.sharedByUserId,
        createdAt: s.createdAt,
      })
    } else if (s.kind === 'workflow') {
      workflows.push({
        id: s.id,
        workspaceId: s.workspaceId,
        workflowId: s.entityId,
        name: s.title,
        sharedByUserId: s.sharedByUserId,
        createdAt: s.createdAt,
      })
    } else if (s.kind === 'artifact') {
      artifacts.push({
        id: s.id,
        workspaceId: s.workspaceId,
        artifactId: s.entityId,
        title: s.title,
        sharedByUserId: s.sharedByUserId,
        createdAt: s.createdAt,
      })
    }
  }

  return {
    id: wsRow.id,
    name: wsRow.name,
    ...(wsRow.description ? { description: wsRow.description } : {}),
    ownerId: wsRow.ownerId,
    members: mappedMembers,
    invitations: mappedInvitations,
    conversations,
    workflows,
    artifacts,
    memory: mappedMemory,
    settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...parseJson(wsRow.settings, {}) },
    createdAt: wsRow.createdAt,
    updatedAt: wsRow.updatedAt,
  }
}

// ── Main route dispatcher ───────────────────────────────────────────────────

const HANDLED_PREFIXES = [
  '/api/v1/analytics/onboarding',
  '/api/v1/artifacts',
  '/api/v1/library',
  '/api/v1/tools',
  '/api/v1/audit-logs',
  '/api/v1/costs',
  '/api/v1/system/usage',
  '/api/v1/system/costs',
  '/api/v1/platform/billing',
  '/api/v1/platform/subscription',
  '/api/v1/metrics/live',
  '/api/v1/workspaces',
]

function matchesHandledPrefix(path) {
  return HANDLED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export async function handleWorkspaceRoutes({ request, env, url, path, method, origin, user, h }) {
  if (!matchesHandledPrefix(path)) return null

  const json = (body, status = 200) => h.jsonResponse(body, status, origin)
  await ensureWorkspaceSchema(env)

  // ── 1. Onboarding Analytics ───────────────────────────────────────────────
  if (path === '/api/v1/analytics/onboarding') {
    if (method === 'POST') {
      const body = await readBody(request)
      const step = String(body.step || 'unknown').trim().slice(0, 120) || 'unknown'
      const { step: _ignored, ...rest } = body
      const meta = Object.keys(rest).length > 0 ? JSON.stringify(rest).slice(0, 4000) : null
      const id = h.genId('onb')
      const now = new Date().toISOString()
      try {
        await env.DB.prepare(
          'INSERT INTO ws_onboarding_events (id, userId, step, meta, createdAt) VALUES (?, ?, ?, ?, ?)',
        )
          .bind(id, user.id, step, meta, now)
          .run()
      } catch {
        // Never fail onboarding beacons
      }
      return json({ ok: true, id, step, createdAt: now }, 200)
    }
    if (method === 'GET') {
      const rows = await safeAll(
        env,
        'SELECT id, step, meta, createdAt FROM ws_onboarding_events WHERE userId = ? ORDER BY createdAt DESC LIMIT 100',
        [user.id],
      )
      return json(
        rows.map((r) => ({
          id: r.id,
          step: r.step,
          meta: parseJson(r.meta, null),
          createdAt: r.createdAt,
        })),
      )
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  // ── 2. Artifacts & Templates ──────────────────────────────────────────────
  if (path === '/api/v1/artifacts/templates') {
    if (method === 'GET') {
      const rows = await safeAll(
        env,
        'SELECT * FROM ws_artifact_templates WHERE userId = ? ORDER BY updatedAt DESC LIMIT 100',
        [user.id],
      )
      return json(rows.map(mapArtifactTemplate))
    }
    if (method === 'POST') {
      const body = await readBody(request)
      const name = String(body.name || '').trim().slice(0, 120)
      if (!name) return json({ statusCode: 400, message: 'Template name is required.' }, 400)
      const type = VALID_ARTIFACT_TYPES.has(body.type) ? body.type : 'doc'
      const defaultFormat = String(body.defaultFormat || defaultFormatForType(type)).trim().slice(0, 40)
      const description = body.description ? String(body.description).trim().slice(0, 500) : null
      const outline = body.outline ? String(body.outline).trim().slice(0, 4000) : null
      const promptGuide = body.promptGuide ? String(body.promptGuide).trim().slice(0, 2000) : null
      const workspaceId = body.workspaceId ? String(body.workspaceId).trim().slice(0, 80) : null
      const fieldSchema = Array.isArray(body.fieldSchema)
        ? body.fieldSchema.map((f) => String(f).trim().slice(0, 80)).filter(Boolean).slice(0, 40)
        : []
      const id = h.genId('atpl')
      const now = new Date().toISOString()

      await env.DB.prepare(
        `INSERT INTO ws_artifact_templates
          (id, userId, workspaceId, name, description, type, defaultFormat, outline, promptGuide, fieldSchema, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, user.id, workspaceId, name, description, type, defaultFormat, outline, promptGuide, JSON.stringify(fieldSchema), now, now)
        .run()

      await writeAuditLog(env, h, user.id, {
        action: 'artifact_template_create',
        resourceType: 'artifact_template',
        resourceId: id,
        category: 'artifacts',
        description: `Created artifact template "${name}"`,
      })

      return json(
        mapArtifactTemplate({
          id,
          userId: user.id,
          workspaceId,
          name,
          description,
          type,
          defaultFormat,
          outline,
          promptGuide,
          fieldSchema: JSON.stringify(fieldSchema),
          createdAt: now,
          updatedAt: now,
        }),
        201,
      )
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  const templateDeleteMatch = path.match(/^\/api\/v1\/artifacts\/templates\/([^/]+)$/)
  if (templateDeleteMatch) {
    const tplId = decodeURIComponent(templateDeleteMatch[1])
    if (method === 'DELETE') {
      const existing = await safeFirst(env, 'SELECT id FROM ws_artifact_templates WHERE id = ? AND userId = ?', [tplId, user.id])
      if (!existing) return json({ statusCode: 404, message: 'Template not found.' }, 404)
      await env.DB.prepare('DELETE FROM ws_artifact_templates WHERE id = ? AND userId = ?').bind(tplId, user.id).run()
      return json({ ok: true })
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  if (path === '/api/v1/artifacts') {
    if (method === 'GET') {
      const rows = await safeAll(
        env,
        'SELECT * FROM ws_artifacts WHERE userId = ? ORDER BY updatedAt DESC LIMIT 100',
        [user.id],
      )
      if (rows.length === 0) return json([])
      const versions = await safeAll(
        env,
        'SELECT * FROM ws_artifact_versions WHERE userId = ? ORDER BY version ASC',
        [user.id],
      )
      const versionsByArt = new Map()
      for (const v of versions) {
        const list = versionsByArt.get(v.artifactId) || []
        list.push(v)
        versionsByArt.set(v.artifactId, list)
      }
      return json(rows.map((r) => buildArtifactDto(r, versionsByArt.get(r.id) || [])))
    }
    if (method === 'POST') {
      const body = await readBody(request)
      const title = String(body.title || '').trim().slice(0, 120)
      if (!title) return json({ statusCode: 400, message: 'Artifact title is required.' }, 400)
      const type = VALID_ARTIFACT_TYPES.has(body.type) ? body.type : 'doc'
      const status = VALID_ARTIFACT_STATUSES.has(body.status) ? body.status : 'draft'
      const summary = body.summary ? String(body.summary).trim().slice(0, 500) : null
      const workspaceId = body.workspaceId ? String(body.workspaceId).trim().slice(0, 80) : null
      const labels = Array.isArray(body.labels)
        ? body.labels.map((l) => String(l).trim().slice(0, 60)).filter(Boolean).slice(0, 20)
        : []
      const source = body.source && typeof body.source === 'object' ? body.source : {}
      const format = String(body.format || defaultFormatForType(type)).trim().slice(0, 40)
      const content = String(body.content || '').slice(0, MAX_ARTIFACT_CONTENT)
      const note = body.note ? String(body.note).trim().slice(0, 280) : null
      const metadata = body.metadata && typeof body.metadata === 'object' ? JSON.stringify(body.metadata).slice(0, 4000) : null

      const id = h.genId('art')
      const versionId = h.genId('artv')
      const now = new Date().toISOString()

      await env.DB.prepare(
        `INSERT INTO ws_artifacts
          (id, userId, workspaceId, title, type, status, summary, labels, source, currentVersionId, versionCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
        .bind(id, user.id, workspaceId, title, type, status, summary, JSON.stringify(labels), JSON.stringify(source), versionId, now, now)
        .run()

      await env.DB.prepare(
        `INSERT INTO ws_artifact_versions
          (id, artifactId, userId, version, format, content, note, metadata, createdAt)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      )
        .bind(versionId, id, user.id, format, content, note, metadata, now)
        .run()

      await writeAuditLog(env, h, user.id, {
        action: 'artifact_create',
        resourceType: 'artifact',
        resourceId: id,
        category: 'artifacts',
        description: `Created artifact "${title}"`,
        metadata: { type, status },
      })

      const vRow = { id: versionId, artifactId: id, userId: user.id, version: 1, format, content, note, metadata, createdAt: now }
      const artRow = {
        id,
        userId: user.id,
        workspaceId,
        title,
        type,
        status,
        summary,
        labels: JSON.stringify(labels),
        source: JSON.stringify(source),
        currentVersionId: versionId,
        versionCount: 1,
        createdAt: now,
        updatedAt: now,
      }
      const dto = buildArtifactDto(artRow, [vRow])
      return json({ ...dto, versions: [mapArtifactVersion(vRow)] }, 201)
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  const artVersionsMatch = path.match(/^\/api\/v1\/artifacts\/([^/]+)\/versions$/)
  if (artVersionsMatch) {
    if (method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const artId = decodeURIComponent(artVersionsMatch[1])
    const artRow = await safeFirst(env, 'SELECT * FROM ws_artifacts WHERE id = ? AND userId = ?', [artId, user.id])
    if (!artRow) return json({ statusCode: 404, message: 'Artifact not found.' }, 404)

    const body = await readBody(request)
    if (typeof body.content !== 'string') {
      return json({ statusCode: 400, message: 'Version content is required.' }, 400)
    }
    const content = body.content.slice(0, MAX_ARTIFACT_CONTENT)
    const existingVersions = await safeAll(
      env,
      'SELECT * FROM ws_artifact_versions WHERE artifactId = ? AND userId = ? ORDER BY version ASC',
      [artId, user.id],
    )
    const nextVersionNum = existingVersions.length > 0 ? Number(existingVersions[existingVersions.length - 1].version) + 1 : 1
    const format = String(
      body.format || existingVersions[existingVersions.length - 1]?.format || defaultFormatForType(artRow.type),
    )
      .trim()
      .slice(0, 40)
    const note = body.note ? String(body.note).trim().slice(0, 280) : null
    const metadata = body.metadata && typeof body.metadata === 'object' ? JSON.stringify(body.metadata).slice(0, 4000) : null
    const versionId = h.genId('artv')
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO ws_artifact_versions
        (id, artifactId, userId, version, format, content, note, metadata, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(versionId, artId, user.id, nextVersionNum, format, content, note, metadata, now)
      .run()

    await env.DB.prepare(
      'UPDATE ws_artifacts SET currentVersionId = ?, versionCount = ?, updatedAt = ? WHERE id = ? AND userId = ?',
    )
      .bind(versionId, nextVersionNum, now, artId, user.id)
      .run()

    const newVRow = { id: versionId, artifactId: artId, userId: user.id, version: nextVersionNum, format, content, note, metadata, createdAt: now }
    const allVersions = [...existingVersions, newVRow]
    const updatedRow = { ...artRow, currentVersionId: versionId, versionCount: nextVersionNum, updatedAt: now }
    const dto = buildArtifactDto(updatedRow, allVersions)
    return json({ ...dto, versions: allVersions.map(mapArtifactVersion) }, 201)
  }

  const artExportMatch = path.match(/^\/api\/v1\/artifacts\/([^/]+)\/export$/)
  if (artExportMatch) {
    if (method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const artId = decodeURIComponent(artExportMatch[1])
    const artRow = await safeFirst(env, 'SELECT * FROM ws_artifacts WHERE id = ? AND userId = ?', [artId, user.id])
    if (!artRow) return json({ statusCode: 404, message: 'Artifact not found.' }, 404)
    const versions = await safeAll(
      env,
      'SELECT * FROM ws_artifact_versions WHERE artifactId = ? AND userId = ? ORDER BY version ASC',
      [artId, user.id],
    )
    const latest = versions[versions.length - 1]
    const requestedFormat = url.searchParams.get('format') || latest?.format || defaultFormatForType(artRow.type)
    const { mimeType, ext } = exportMimeAndExt(requestedFormat)
    return json({
      artifactId: artRow.id,
      versionId: latest?.id || artRow.currentVersionId || `${artRow.id}_v1`,
      fileName: `${slugifyFileName(artRow.title)}.${ext}`,
      mimeType,
      content: latest?.content || '',
      exportedAt: new Date().toISOString(),
    })
  }

  const artDetailMatch = path.match(/^\/api\/v1\/artifacts\/([^/]+)$/)
  if (artDetailMatch) {
    const artId = decodeURIComponent(artDetailMatch[1])
    const artRow = await safeFirst(env, 'SELECT * FROM ws_artifacts WHERE id = ? AND userId = ?', [artId, user.id])
    if (!artRow) return json({ statusCode: 404, message: 'Artifact not found.' }, 404)

    if (method === 'GET') {
      const versions = await safeAll(
        env,
        'SELECT * FROM ws_artifact_versions WHERE artifactId = ? AND userId = ? ORDER BY version ASC',
        [artId, user.id],
      )
      const dto = buildArtifactDto(artRow, versions)
      return json({ ...dto, versions: versions.map(mapArtifactVersion) })
    }

    if (method === 'PATCH') {
      const body = await readBody(request)
      const title = body.title !== undefined ? String(body.title || '').trim().slice(0, 120) : artRow.title
      if (!title) return json({ statusCode: 400, message: 'Artifact title cannot be empty.' }, 400)
      const status = body.status !== undefined && VALID_ARTIFACT_STATUSES.has(body.status) ? body.status : artRow.status
      const summary = body.summary !== undefined ? (body.summary ? String(body.summary).trim().slice(0, 500) : null) : artRow.summary
      const workspaceId = body.workspaceId !== undefined ? (body.workspaceId ? String(body.workspaceId).trim().slice(0, 80) : null) : artRow.workspaceId
      const labels = Array.isArray(body.labels)
        ? JSON.stringify(body.labels.map((l) => String(l).trim().slice(0, 60)).filter(Boolean).slice(0, 20))
        : artRow.labels
      const now = new Date().toISOString()

      await env.DB.prepare(
        'UPDATE ws_artifacts SET title = ?, status = ?, summary = ?, workspaceId = ?, labels = ?, updatedAt = ? WHERE id = ? AND userId = ?',
      )
        .bind(title, status, summary, workspaceId, labels, now, artId, user.id)
        .run()

      const versions = await safeAll(
        env,
        'SELECT * FROM ws_artifact_versions WHERE artifactId = ? AND userId = ? ORDER BY version ASC',
        [artId, user.id],
      )
      const updated = { ...artRow, title, status, summary, workspaceId, labels, updatedAt: now }
      return json({ ...buildArtifactDto(updated, versions), versions: versions.map(mapArtifactVersion) })
    }

    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM ws_artifact_versions WHERE artifactId = ? AND userId = ?').bind(artId, user.id).run()
      await env.DB.prepare('DELETE FROM ws_artifacts WHERE id = ? AND userId = ?').bind(artId, user.id).run()
      await writeAuditLog(env, h, user.id, {
        action: 'artifact_delete',
        resourceType: 'artifact',
        resourceId: artId,
        category: 'artifacts',
        description: `Deleted artifact "${artRow.title}"`,
      })
      return json({ ok: true })
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  // ── 3. Library ────────────────────────────────────────────────────────────
  if (path === '/api/v1/library/search') {
    if (method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const q = String(url.searchParams.get('q') || '').trim()
    if (!q) return json([])
    const rawTopK = Number.parseInt(String(url.searchParams.get('topK') || '6'), 10)
    const topK = Number.isFinite(rawTopK) ? Math.min(30, Math.max(1, rawTopK)) : 6

    const rows = await safeAll(
      env,
      `SELECT c.documentId, c.ordinal, c.text, d.title
         FROM ws_library_chunks c
         JOIN ws_library_documents d ON d.id = c.documentId
        WHERE c.userId = ? AND d.userId = ?
        LIMIT 2000`,
      [user.id, user.id],
    )
    const queryLower = q.toLowerCase()
    const terms = tokenizeQuery(q)

    const hits = []
    for (const r of rows) {
      const score = scoreChunk(r.text || '', r.title || '', queryLower, terms)
      if (score > 0) {
        const snippet = String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 280)
        hits.push({
          documentId: r.documentId,
          title: r.title,
          text: r.text,
          score,
          ordinal: Number(r.ordinal) || 0,
          snippet,
          url: `library://${r.documentId}#chunk-${Number(r.ordinal) || 0}`,
        })
      }
    }
    hits.sort((a, b) => b.score - a.score)
    return json(hits.slice(0, topK))
  }

  if (path === '/api/v1/library') {
    if (method === 'GET') {
      const rows = await safeAll(
        env,
        'SELECT id, title, source, mimeType, status, chunkCount, updatedAt FROM ws_library_documents WHERE userId = ? ORDER BY updatedAt DESC LIMIT 100',
        [user.id],
      )
      return json(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          source: r.source || 'upload',
          mimeType: r.mimeType || 'text/plain',
          status: r.status || 'indexed',
          chunkCount: Number(r.chunkCount) || 0,
          updatedAt: r.updatedAt,
        })),
      )
    }
    if (method === 'POST') {
      const body = await readBody(request)
      const title = String(body.title || '').trim().slice(0, 200)
      const content = String(body.content || '').trim()
      if (!title || !content) {
        return json({ statusCode: 400, message: 'title and content are required.' }, 400)
      }
      if (content.length > MAX_LIBRARY_CONTENT) {
        return json({ statusCode: 400, message: `Content exceeds ${MAX_LIBRARY_CONTENT} character limit.` }, 400)
      }
      const source = String(body.source || 'upload').trim().slice(0, 200) || 'upload'
      const mimeType = String(body.mimeType || 'text/plain').trim().slice(0, 80) || 'text/plain'
      const chunks = chunkText(content)
      const id = h.genId('lib')
      const now = new Date().toISOString()

      await env.DB.prepare(
        `INSERT INTO ws_library_documents (id, userId, title, source, mimeType, status, chunkCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'indexed', ?, ?, ?)`,
      )
        .bind(id, user.id, title, source, mimeType, chunks.length, now, now)
        .run()

      for (let i = 0; i < chunks.length; i += 1) {
        await env.DB.prepare(
          'INSERT INTO ws_library_chunks (id, userId, documentId, ordinal, text, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        )
          .bind(h.genId('lchk'), user.id, id, i, chunks[i], now)
          .run()
      }

      await writeAuditLog(env, h, user.id, {
        action: 'library_add',
        resourceType: 'library_document',
        resourceId: id,
        category: 'library',
        description: `Indexed library document "${title}" (${chunks.length} chunks)`,
        metadata: { chunkCount: chunks.length, source },
      })

      return json(
        {
          id,
          title,
          source,
          mimeType,
          status: 'indexed',
          chunkCount: chunks.length,
          updatedAt: now,
        },
        201,
      )
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  const libraryItemMatch = path.match(/^\/api\/v1\/library\/([^/]+)$/)
  if (libraryItemMatch) {
    const docId = decodeURIComponent(libraryItemMatch[1])
    if (method === 'DELETE') {
      const existing = await safeFirst(env, 'SELECT id, title FROM ws_library_documents WHERE id = ? AND userId = ?', [docId, user.id])
      if (!existing) return json({ statusCode: 404, message: 'Document not found.' }, 404)
      await env.DB.prepare('DELETE FROM ws_library_chunks WHERE documentId = ? AND userId = ?').bind(docId, user.id).run()
      await env.DB.prepare('DELETE FROM ws_library_documents WHERE id = ? AND userId = ?').bind(docId, user.id).run()
      await writeAuditLog(env, h, user.id, {
        action: 'library_delete',
        resourceType: 'library_document',
        resourceId: docId,
        category: 'library',
        description: `Removed library document "${existing.title}"`,
      })
      return json({ ok: true })
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  // ── 4. Tools ──────────────────────────────────────────────────────────────
  if (path === '/api/v1/tools') {
    if (method === 'GET') {
      return json(WORKER_TOOL_CATALOG)
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  if (path === '/api/v1/tools/dry-run') {
    if (method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const body = await readBody(request)
    const toolName = String(body.toolName || '').trim()
    const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input : {}
    const tool = WORKER_TOOL_CATALOG.find((t) => t.name === toolName)
    if (!tool) return json({ statusCode: 404, message: `Unknown tool "${toolName}".` }, 404)

    const requiredFields = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : []
    const missing = requiredFields.filter((f) => input[f] === undefined || input[f] === null || String(input[f]).trim() === '')
    const warnings = []
    if (missing.length > 0) warnings.push(`Missing required field(s): ${missing.join(', ')}`)

    const isPhone = tool.name === 'phone_call'
    const twilioReady = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER)
    if (isPhone && !twilioReady) warnings.push('Twilio telephony credentials are not configured on this worker.')

    const predictedScope = isPhone ? 'external_write' : tool.name === 'library_search' ? 'local' : 'external_read'
    const riskScore = isPhone ? 68 : tool.name === 'chat_completion' || tool.name === 'avatar_tts' ? 20 : 10
    const decision = isPhone ? 'confirm' : 'auto'
    const now = new Date().toISOString()

    return json({
      toolName: tool.name,
      requiresApproval: tool.requiresApproval,
      ready: missing.length === 0 && (!isPhone || twilioReady),
      connectorId: isPhone ? 'twilio_voice' : null,
      connectorStatus: isPhone ? (twilioReady ? 'connected' : 'down') : 'connected',
      predictedScope,
      reversible: !isPhone,
      estimatedCostUsd: isPhone ? 0.02 : tool.name === 'chat_completion' ? 0.003 : 0,
      sideEffects: isPhone
        ? ['Initiates a real outbound telephone call via Twilio']
        : tool.name === 'artifact_create'
          ? ['Creates a versioned artifact record in D1']
          : tool.name === 'workspace_memory'
            ? ['Appends a memory entry to the target workspace']
            : ['Read-only or stateless inference call'],
      warnings,
      risk: {
        riskScore,
        decision,
        reason: isPhone
          ? 'External voice communication requires explicit user approval.'
          : 'Tool operates within normal workspace safety boundaries.',
        factors: [
          {
            label: 'Scope',
            score: riskScore,
            reason: `Predicted execution scope is ${predictedScope}.`,
          },
        ],
        evaluatedAt: now,
      },
      previewGeneratedAt: now,
    })
  }

  // ── 5. Audit Logs ─────────────────────────────────────────────────────────
  if (path === '/api/v1/audit-logs') {
    if (method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const actionFilter = String(url.searchParams.get('action') || '').trim().toLowerCase()
    const toolFilter = String(url.searchParams.get('tool') || '').trim().toLowerCase()
    const fromFilter = String(url.searchParams.get('from') || '').trim()
    const toFilter = String(url.searchParams.get('to') || '').trim()
    const rawLimit = Number.parseInt(String(url.searchParams.get('limit') || '200'), 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, rawLimit)) : 200

    const [wsRows, loginRows, usageRows] = await Promise.all([
      safeAll(
        env,
        'SELECT * FROM ws_audit_logs WHERE userId = ? ORDER BY createdAt DESC LIMIT 300',
        [user.id],
      ),
      safeAll(
        env,
        'SELECT id, userId, ip, userAgent, createdAt FROM login_events WHERE userId = ? ORDER BY createdAt DESC LIMIT 100',
        [user.id],
      ),
      safeAll(
        env,
        'SELECT id, userId, event, meta, createdAt FROM usage_events WHERE userId = ? ORDER BY createdAt DESC LIMIT 150',
        [user.id],
      ),
    ])

    const combined = []

    for (const r of wsRows) {
      combined.push({
        id: r.id,
        userId: r.userId,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        category: r.category || 'workspace',
        severity: r.severity || 'info',
        description: r.description || undefined,
        metadata: parseJson(r.metadata, null),
        reversible: Boolean(r.reversible) && !r.undoneAt,
        undoneAt: r.undoneAt || null,
        createdAt: r.createdAt,
        timestamp: r.createdAt,
      })
    }

    for (const r of loginRows) {
      combined.push({
        id: `login_${r.id}`,
        userId: r.userId,
        action: 'auth_login',
        resourceType: 'session',
        resourceId: r.id,
        category: 'auth',
        severity: 'info',
        description: 'User authenticated',
        metadata: { ip: r.ip || null, userAgent: r.userAgent || null },
        reversible: false,
        undoneAt: null,
        createdAt: r.createdAt,
        timestamp: r.createdAt,
      })
    }

    for (const r of usageRows) {
      combined.push({
        id: `usage_${r.id}`,
        userId: r.userId,
        action: r.event,
        resourceType: 'usage',
        resourceId: r.id,
        category: 'usage',
        severity: 'info',
        description: `Usage event: ${r.event}`,
        metadata: parseJson(r.meta, null),
        reversible: false,
        undoneAt: null,
        createdAt: r.createdAt,
        timestamp: r.createdAt,
      })
    }

    const fromMs = fromFilter ? new Date(fromFilter).getTime() : NaN
    const toMs = toFilter ? new Date(toFilter).getTime() : NaN

    const filtered = combined.filter((item) => {
      if (actionFilter && !String(item.action || '').toLowerCase().includes(actionFilter)) return false
      if (toolFilter) {
        const matchTool =
          String(item.resourceType || '').toLowerCase().includes(toolFilter) ||
          String(item.resourceId || '').toLowerCase().includes(toolFilter) ||
          String(item.action || '').toLowerCase().includes(toolFilter)
        if (!matchTool) return false
      }
      const itemMs = new Date(item.createdAt).getTime()
      if (Number.isFinite(fromMs) && itemMs < fromMs) return false
      if (Number.isFinite(toMs) && itemMs > toMs) return false
      return true
    })

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return json(filtered.slice(0, limit))
  }

  const auditUndoMatch = path.match(/^\/api\/v1\/audit-logs\/([^/]+)\/undo$/)
  if (auditUndoMatch) {
    if (method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const auditId = decodeURIComponent(auditUndoMatch[1])
    const row = await safeFirst(env, 'SELECT * FROM ws_audit_logs WHERE id = ? AND userId = ?', [auditId, user.id])
    if (!row || !row.reversible) {
      return json({ ok: false, reversible: false, message: 'This action is not reversible.' })
    }
    if (row.undoneAt) {
      return json({ ok: false, reversible: false, message: 'Already undone.', undoneAt: row.undoneAt })
    }
    const undoneAt = new Date().toISOString()
    await env.DB.prepare('UPDATE ws_audit_logs SET undoneAt = ? WHERE id = ? AND userId = ?')
      .bind(undoneAt, auditId, user.id)
      .run()
    return json({ ok: true, reversible: true, message: 'Action undone.', undoneAt })
  }

  // ── 6. Costs & Model Router ───────────────────────────────────────────────
  if (path === '/api/v1/costs/summary') {
    if (method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const rawDays = Number.parseInt(String(url.searchParams.get('days') || '30'), 10)
    const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, rawDays)) : 30
    const now = new Date()
    const fromDate = new Date(now.getTime() - (days - 1) * 86_400_000)
    fromDate.setUTCHours(0, 0, 0, 0)
    const fromIso = fromDate.toISOString()
    const toIso = now.toISOString()

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const todayKey = toDayKey(now)

    const [periodData, mtdData, routerSettings] = await Promise.all([
      computeUserUsageData(env, user.id, fromIso, toIso),
      computeUserUsageData(env, user.id, monthStart, toIso),
      getRouterSettings(env, user.id),
    ])

    const dailySeries = buildDailySeries(periodData.dailyMap, fromIso, toIso).map((d) => ({
      date: d.date,
      costUsd: d.costUsd,
      tokens: d.tokens,
      runs: d.runs,
    }))

    const todayUsd = periodData.dailyMap[todayKey]?.costUsd || 0
    const capUsd = routerSettings.monthlyBudgetUsd
    const spentUsd = mtdData.totalCostUsd
    const pct = capUsd > 0 ? Math.round((spentUsd / capUsd) * 1000) / 10 : 0

    const byProvider = {}
    for (const [k, v] of Object.entries(periodData.byProvider)) {
      byProvider[k] = { costUsd: v.costUsd, runs: v.runs, tokens: v.tokens }
    }
    const byModel = {}
    for (const [k, v] of Object.entries(periodData.byModel)) {
      byModel[k] = { provider: v.provider, costUsd: v.costUsd, runs: v.runs, tokens: v.tokens }
    }

    return json({
      totalCostUsd: periodData.totalCostUsd,
      totalInputTokens: periodData.totalInputTokens,
      totalOutputTokens: periodData.totalOutputTokens,
      totalTokens: periodData.totalTokens,
      totalRuns: periodData.totalRuns,
      byProvider,
      byModel,
      daily: dailySeries,
      monthToDateUsd: spentUsd,
      todayUsd: roundUsd(todayUsd),
      budget: {
        capUsd,
        alertThresholdPct: routerSettings.alertThresholdPct,
        spentUsd,
        pct,
        alert: capUsd > 0 && pct >= routerSettings.alertThresholdPct,
        exceeded: capUsd > 0 && spentUsd >= capUsd,
      },
      period: { from: fromIso, to: toIso },
    })
  }

  if (path === '/api/v1/costs/history') {
    if (method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const rawLimit = Number.parseInt(String(url.searchParams.get('limit') || '50'), 10)
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50
    const now = new Date()
    const fromIso = new Date(now.getTime() - 90 * 86_400_000).toISOString()
    const data = await computeUserUsageData(env, user.id, fromIso, now.toISOString())
    return json(data.historyEntries.slice(0, limit))
  }

  if (path === '/api/v1/costs/router') {
    if (method === 'GET') {
      return json(await getRouterSettings(env, user.id))
    }
    if (method === 'PUT' || method === 'PATCH') {
      const current = await getRouterSettings(env, user.id)
      const body = await readBody(request)
      const mode = body.mode && VALID_ROUTER_MODES.has(body.mode) ? body.mode : current.mode
      const tiers = {
        simple: {
          provider: String(body.tiers?.simple?.provider || current.tiers.simple.provider).trim().slice(0, 60),
          model: String(body.tiers?.simple?.model || current.tiers.simple.model).trim().slice(0, 120),
        },
        standard: {
          provider: String(body.tiers?.standard?.provider || current.tiers.standard.provider).trim().slice(0, 60),
          model: String(body.tiers?.standard?.model || current.tiers.standard.model).trim().slice(0, 120),
        },
        complex: {
          provider: String(body.tiers?.complex?.provider || current.tiers.complex.provider).trim().slice(0, 60),
          model: String(body.tiers?.complex?.model || current.tiers.complex.model).trim().slice(0, 120),
        },
      }
      const monthlyBudgetUsd =
        body.monthlyBudgetUsd !== undefined && Number.isFinite(Number(body.monthlyBudgetUsd))
          ? Math.max(0, Number(body.monthlyBudgetUsd))
          : current.monthlyBudgetUsd
      const alertThresholdPct =
        body.alertThresholdPct !== undefined && Number.isFinite(Number(body.alertThresholdPct))
          ? Math.min(100, Math.max(10, Math.round(Number(body.alertThresholdPct))))
          : current.alertThresholdPct
      const updatedAt = new Date().toISOString()

      await env.DB.prepare(
        `INSERT INTO ws_router_settings (userId, mode, tiers, monthlyBudgetUsd, alertThresholdPct, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET
           mode = excluded.mode,
           tiers = excluded.tiers,
           monthlyBudgetUsd = excluded.monthlyBudgetUsd,
           alertThresholdPct = excluded.alertThresholdPct,
           updatedAt = excluded.updatedAt`,
      )
        .bind(user.id, mode, JSON.stringify(tiers), monthlyBudgetUsd, alertThresholdPct, updatedAt)
        .run()

      await writeAuditLog(env, h, user.id, {
        action: 'cost_router_update',
        resourceType: 'router_settings',
        resourceId: user.id,
        category: 'costs',
        description: `Updated model router mode to "${mode}"`,
        metadata: { mode, monthlyBudgetUsd, alertThresholdPct },
      })

      return json({ mode, tiers, monthlyBudgetUsd, alertThresholdPct, updatedAt })
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  if (path === '/api/v1/costs/router/preview') {
    if (method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const body = await readBody(request)
    const prompt = String(body.prompt || '').slice(0, 12000)
    const toolCount = Number(body.toolCount) || 0

    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const [settings, mtdData] = await Promise.all([
      getRouterSettings(env, user.id),
      computeUserUsageData(env, user.id, monthStart, now.toISOString()),
    ])

    const { tier, score, reasons } = classifyPrompt(prompt, toolCount)
    const overBudget = settings.monthlyBudgetUsd > 0 && mtdData.totalCostUsd >= settings.monthlyBudgetUsd

    let effectiveTier = tier
    if (settings.mode === 'auto-cheapest') {
      effectiveTier = tier === 'complex' ? 'standard' : 'simple'
    } else if (settings.mode === 'best') {
      effectiveTier = tier === 'simple' ? 'standard' : 'complex'
    }
    if (settings.mode !== 'manual' && overBudget) {
      effectiveTier = 'simple'
      reasons.push('monthly budget cap reached')
    }
    const choice = settings.tiers[effectiveTier] || settings.tiers.standard
    return json({
      provider: choice.provider,
      model: choice.model,
      tier: effectiveTier,
      score,
      reasons,
      mode: settings.mode,
      overBudget,
    })
  }

  // ── 7. System Usage, System Costs, Platform Billing & Subscription ────────
  if (path === '/api/v1/system/usage') {
    if (method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const uptimeSec = Math.max(0, Math.floor((Date.now() - WORKER_STARTED_AT) / 1000))
    return json({
      capturedAt: new Date().toISOString(),
      host: {
        platform: 'cloudflare-workers',
        release: 'v8-isolate',
        arch: 'edge',
        hostname: url.host,
        nodeVersion: 'workers-runtime',
        uptimeSec,
      },
      cpu: {
        logicalCores: 1,
        model: 'Cloudflare Workers Edge Isolate',
        loadAvg1: 0,
        loadAvg5: 0,
        loadAvg15: 0,
        processCpuMs: 0,
      },
      memory: {
        systemTotalBytes: 134_217_728,
        systemFreeBytes: 134_217_728,
        systemUsedBytes: 0,
        processRssBytes: 0,
        processHeapUsedBytes: 0,
        processHeapTotalBytes: 0,
        processExternalBytes: 0,
      },
      disk: null,
    })
  }

  if (path === '/api/v1/system/costs' || path === '/api/v1/platform/billing') {
    if (method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 29 * 86_400_000)
    defaultStart.setUTCHours(0, 0, 0, 0)

    const startParam = url.searchParams.get('start')
    const endParam = url.searchParams.get('end')
    const rangeStart = startParam && Number.isFinite(new Date(startParam).getTime())
      ? new Date(startParam).toISOString()
      : defaultStart.toISOString()
    const rangeEnd = endParam && Number.isFinite(new Date(endParam).getTime())
      ? new Date(endParam).toISOString()
      : now.toISOString()

    const usage = await computeUserUsageData(env, user.id, rangeStart, rangeEnd)
    const daily = buildDailySeries(usage.dailyMap, rangeStart, rangeEnd).map((d) => ({
      date: d.date,
      runs: d.runs,
      llmCostUsd: d.llmCostUsd,
      toolCostUsd: d.toolCostUsd,
      totalCostUsd: d.totalCostUsd,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      toolCalls: d.toolCalls,
      toolSuccesses: d.toolSuccesses,
      toolFailures: d.toolFailures,
      toolSuccessRate: d.toolSuccessRate,
    }))

    const breakdown = {
      generatedAt: now.toISOString(),
      rangeStart,
      rangeEnd,
      totals: {
        runs: usage.totalRuns,
        llmCalls: usage.totalRuns,
        inputTokens: usage.totalInputTokens,
        outputTokens: usage.totalOutputTokens,
        toolCalls: usage.totalToolCalls,
        toolSuccesses: usage.totalToolSuccesses,
        toolFailures: usage.totalToolFailures,
        toolSuccessRate: usage.toolSuccessRate,
        estimatedLlmCostUsd: usage.totalCostUsd,
        estimatedToolCostUsd: 0,
        estimatedTotalCostUsd: usage.totalCostUsd,
      },
      providers: Object.values(usage.byProvider).map((p) => ({
        provider: p.provider,
        runs: p.runs,
        llmCalls: p.llmCalls,
        inputTokens: p.inputTokens,
        outputTokens: p.outputTokens,
        estimatedCostUsd: p.estimatedCostUsd,
      })),
      models: Object.values(usage.byModel).map((m) => ({
        provider: m.provider,
        model: m.model,
        runs: m.runs,
        llmCalls: m.llmCalls,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        estimatedCostUsd: m.estimatedCostUsd,
        avgCostPerRunUsd: m.avgCostPerRunUsd,
      })),
      tools: Object.values(usage.byTool),
      daily,
    }

    if (path === '/api/v1/system/costs') {
      return json(breakdown)
    }

    const subscription = await buildSubscriptionSnapshot(env, user.id)
    const channels =
      usage.messageCount > 0
        ? [
            {
              channelId: 'web',
              channelLabel: 'Web Chat',
              conversations: usage.conversationCount,
              messages: usage.messageCount,
              estimatedCostUsd: 0,
            },
          ]
        : []

    return json({
      generatedAt: now.toISOString(),
      rangeStart,
      rangeEnd,
      llmAndTool: breakdown,
      channels,
      totals: {
        llmAndToolUsd: usage.totalCostUsd,
        channelTransportUsd: 0,
        estimatedInvoiceUsd: roundUsd(usage.totalCostUsd + subscription.priceUsdMonthly),
      },
      subscription,
    })
  }

  if (path === '/api/v1/platform/subscription') {
    if (method === 'GET') {
      return json(await buildSubscriptionSnapshot(env, user.id))
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  // ── 8. Live Metrics ───────────────────────────────────────────────────────
  if (path === '/api/v1/metrics/live') {
    if (method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
    const since7d = new Date(now.getTime() - 6 * 86_400_000)
    since7d.setUTCHours(0, 0, 0, 0)
    const since7dIso = since7d.toISOString()

    const [
      totalSessionsRow,
      sessions24hRow,
      totalMessagesRow,
      messages24hRow,
      legacyMemoryRow,
      wsMemoryRow,
      libraryDocsRow,
      recentConvs,
    ] = await Promise.all([
      safeFirst(env, 'SELECT COUNT(*) AS cnt FROM conversations WHERE userId = ?', [user.id]),
      safeFirst(env, 'SELECT COUNT(*) AS cnt FROM conversations WHERE userId = ? AND COALESCE(lastMessageAt, updatedAt, createdAt) >= ?', [user.id, since24h]),
      safeFirst(
        env,
        'SELECT COUNT(*) AS cnt FROM messages m JOIN conversations c ON c.id = m.conversationId WHERE c.userId = ?',
        [user.id],
      ),
      safeFirst(
        env,
        'SELECT COUNT(*) AS cnt FROM messages m JOIN conversations c ON c.id = m.conversationId WHERE c.userId = ? AND m.createdAt >= ?',
        [user.id, since24h],
      ),
      safeFirst(env, 'SELECT COUNT(*) AS cnt FROM memories WHERE userId = ?', [user.id]),
      safeFirst(
        env,
        `SELECT COUNT(*) AS cnt
           FROM ws_workspace_memory wm
           JOIN ws_workspace_members m ON m.workspaceId = wm.workspaceId
          WHERE m.userId = ?`,
        [user.id],
      ),
      safeFirst(env, 'SELECT COUNT(*) AS cnt FROM ws_library_documents WHERE userId = ?', [user.id]),
      safeAll(
        env,
        'SELECT COALESCE(lastMessageAt, updatedAt, createdAt) AS ts FROM conversations WHERE userId = ? AND COALESCE(lastMessageAt, updatedAt, createdAt) >= ?',
        [user.id, since7dIso],
      ),
    ])

    const dailyActivity = {}
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * 86_400_000)
      dailyActivity[toDayKey(d)] = 0
    }
    for (const c of recentConvs) {
      const key = toDayKey(c.ts)
      if (key in dailyActivity) dailyActivity[key] += 1
    }

    return json({
      totalSessions: Number(totalSessionsRow?.cnt || 0),
      sessions24h: Number(sessions24hRow?.cnt || 0),
      totalMessages: Number(totalMessagesRow?.cnt || 0),
      messages24h: Number(messages24hRow?.cnt || 0),
      totalMemory:
        Number(legacyMemoryRow?.cnt || 0) +
        Number(wsMemoryRow?.cnt || 0) +
        Number(libraryDocsRow?.cnt || 0),
      dailyActivity,
      generatedAt: now.toISOString(),
    })
  }

  // ── 9. Workspaces ─────────────────────────────────────────────────────────
  if (path === '/api/v1/workspaces/invitations/pending') {
    if (method !== 'GET') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const email = String(user.email || '').trim().toLowerCase()
    if (!email) return json([])
    const nowIso = new Date().toISOString()
    const rows = await safeAll(
      env,
      `SELECT * FROM ws_workspace_invitations
        WHERE LOWER(email) = ? AND status = 'pending' AND expiresAt > ?
        ORDER BY createdAt DESC LIMIT 50`,
      [email, nowIso],
    )
    return json(
      rows.map((inv) => ({
        id: inv.id,
        workspaceId: inv.workspaceId,
        email: inv.email,
        role: inv.role,
        invitedBy: inv.invitedBy,
        expiresAt: inv.expiresAt,
        status: inv.status,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      })),
    )
  }

  const acceptInvMatch = path.match(/^\/api\/v1\/workspaces\/invitations\/([^/]+)\/accept$/)
  if (acceptInvMatch) {
    if (method !== 'POST') return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    const invId = decodeURIComponent(acceptInvMatch[1])
    const inv = await safeFirst(env, 'SELECT * FROM ws_workspace_invitations WHERE id = ?', [invId])
    if (!inv) return json({ statusCode: 404, message: 'Invitation not found.' }, 404)
    if (String(inv.email || '').toLowerCase() !== String(user.email || '').toLowerCase()) {
      return json({ statusCode: 403, message: 'This invitation belongs to a different email address.' }, 403)
    }
    if (inv.status !== 'pending') {
      return json({ statusCode: 400, message: `Invitation is already ${inv.status}.` }, 400)
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      await env.DB.prepare("UPDATE ws_workspace_invitations SET status = 'expired', updatedAt = ? WHERE id = ?")
        .bind(new Date().toISOString(), invId)
        .run()
      return json({ statusCode: 400, message: 'Invitation has expired.' }, 400)
    }

    const wsRow = await safeFirst(env, 'SELECT * FROM ws_workspaces WHERE id = ?', [inv.workspaceId])
    if (!wsRow) return json({ statusCode: 404, message: 'Workspace not found.' }, 404)

    const now = new Date().toISOString()
    const role = VALID_WORKSPACE_ROLES.has(inv.role) ? inv.role : 'editor'
    const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer

    await env.DB.prepare(
      `INSERT INTO ws_workspace_members (id, workspaceId, userId, role, permissions, invitedByUserId, joinedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspaceId, userId) DO UPDATE SET role = excluded.role, permissions = excluded.permissions`,
    )
      .bind(h.genId('wsm'), inv.workspaceId, user.id, role, JSON.stringify(perms), inv.invitedBy, now)
      .run()

    await env.DB.prepare("UPDATE ws_workspace_invitations SET status = 'accepted', updatedAt = ? WHERE id = ?")
      .bind(now, invId)
      .run()

    await writeAuditLog(env, h, user.id, {
      action: 'workspace_invitation_accept',
      resourceType: 'workspace',
      resourceId: inv.workspaceId,
      category: 'workspaces',
      description: `Joined workspace "${wsRow.name}" as ${role}`,
    })

    return json(await hydrateWorkspace(env, wsRow))
  }

  if (path === '/api/v1/workspaces') {
    if (method === 'GET') {
      const rows = await safeAll(
        env,
        `SELECT DISTINCT w.*
           FROM ws_workspaces w
           LEFT JOIN ws_workspace_members m ON m.workspaceId = w.id
          WHERE w.ownerId = ? OR m.userId = ?
          ORDER BY w.updatedAt DESC
          LIMIT 100`,
        [user.id, user.id],
      )
      const hydrated = await Promise.all(rows.map((r) => hydrateWorkspace(env, r)))
      return json(hydrated)
    }
    if (method === 'POST') {
      const body = await readBody(request)
      const name = String(body.name || '').trim().slice(0, 80)
      if (!name) return json({ statusCode: 400, message: 'Workspace name is required.' }, 400)
      const description = body.description ? String(body.description).trim().slice(0, 500) : null
      const settings = {
        ...DEFAULT_WORKSPACE_SETTINGS,
        ...(body.settings && typeof body.settings === 'object' ? body.settings : {}),
      }
      const id = h.genId('ws')
      const now = new Date().toISOString()

      await env.DB.prepare(
        `INSERT INTO ws_workspaces (id, ownerId, name, description, settings, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, user.id, name, description, JSON.stringify(settings), now, now)
        .run()

      await env.DB.prepare(
        `INSERT INTO ws_workspace_members (id, workspaceId, userId, role, permissions, invitedByUserId, joinedAt)
         VALUES (?, ?, ?, 'owner', ?, NULL, ?)`,
      )
        .bind(h.genId('wsm'), id, user.id, JSON.stringify(ROLE_PERMISSIONS.owner), now)
        .run()

      await writeAuditLog(env, h, user.id, {
        action: 'workspace_create',
        resourceType: 'workspace',
        resourceId: id,
        category: 'workspaces',
        description: `Created workspace "${name}"`,
      })

      return json(
        await hydrateWorkspace(env, {
          id,
          ownerId: user.id,
          name,
          description,
          settings: JSON.stringify(settings),
          createdAt: now,
          updatedAt: now,
        }),
        201,
      )
    }
    return json({ statusCode: 405, message: 'Method not allowed' }, 405)
  }

  // Workspace sub-routes: /api/v1/workspaces/:id/...
  const wsMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)(\/.*)?$/)
  if (wsMatch) {
    const wsId = decodeURIComponent(wsMatch[1])
    const sub = wsMatch[2] || ''

    const wsRow = await safeFirst(env, 'SELECT * FROM ws_workspaces WHERE id = ?', [wsId])
    if (!wsRow) return json({ statusCode: 404, message: 'Workspace not found.' }, 404)

    const membership = await getWorkspaceMembership(env, wsId, user.id)
    const isOwner = wsRow.ownerId === user.id
    if (!isOwner && !membership) {
      return json({ statusCode: 403, message: 'You do not have access to this workspace.' }, 403)
    }
    const effectiveRole = isOwner ? 'owner' : membership.role
    const canManage = effectiveRole === 'owner' || effectiveRole === 'admin'
    const canWrite = canManage || effectiveRole === 'editor'

    if (!sub) {
      if (method === 'GET') {
        return json(await hydrateWorkspace(env, wsRow))
      }
      if (method === 'PATCH') {
        if (!canManage) return json({ statusCode: 403, message: 'Only workspace owners or admins can update settings.' }, 403)
        const body = await readBody(request)
        const name = body.name !== undefined ? String(body.name || '').trim().slice(0, 80) : wsRow.name
        if (!name) return json({ statusCode: 400, message: 'Workspace name cannot be empty.' }, 400)
        const description =
          body.description !== undefined
            ? body.description === null
              ? null
              : String(body.description).trim().slice(0, 500) || null
            : wsRow.description
        const currentSettings = { ...DEFAULT_WORKSPACE_SETTINGS, ...parseJson(wsRow.settings, {}) }
        const nextSettings =
          body.settings && typeof body.settings === 'object' ? { ...currentSettings, ...body.settings } : currentSettings
        const now = new Date().toISOString()

        await env.DB.prepare(
          'UPDATE ws_workspaces SET name = ?, description = ?, settings = ?, updatedAt = ? WHERE id = ?',
        )
          .bind(name, description, JSON.stringify(nextSettings), now, wsId)
          .run()

        return json(
          await hydrateWorkspace(env, {
            ...wsRow,
            name,
            description,
            settings: JSON.stringify(nextSettings),
            updatedAt: now,
          }),
        )
      }
      if (method === 'DELETE') {
        if (!isOwner) return json({ statusCode: 403, message: 'Only the workspace owner can delete this workspace.' }, 403)
        await env.DB.prepare('DELETE FROM ws_workspace_shares WHERE workspaceId = ?').bind(wsId).run()
        await env.DB.prepare('DELETE FROM ws_workspace_memory WHERE workspaceId = ?').bind(wsId).run()
        await env.DB.prepare('DELETE FROM ws_workspace_invitations WHERE workspaceId = ?').bind(wsId).run()
        await env.DB.prepare('DELETE FROM ws_workspace_members WHERE workspaceId = ?').bind(wsId).run()
        await env.DB.prepare('DELETE FROM ws_workspaces WHERE id = ? AND ownerId = ?').bind(wsId, user.id).run()
        await writeAuditLog(env, h, user.id, {
          action: 'workspace_delete',
          resourceType: 'workspace',
          resourceId: wsId,
          category: 'workspaces',
          description: `Deleted workspace "${wsRow.name}"`,
        })
        return json({ ok: true })
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    if (sub === '/role' && method === 'GET') {
      return json({ role: effectiveRole, permissions: ROLE_PERMISSIONS[effectiveRole] || ['read'] })
    }

    if (sub === '/invitations' && method === 'POST') {
      const wsSettings = { ...DEFAULT_WORKSPACE_SETTINGS, ...parseJson(wsRow.settings, {}) }
      if (!canManage && !wsSettings.allowMemberInvites) {
        return json({ statusCode: 403, message: 'You do not have permission to invite members.' }, 403)
      }
      const body = await readBody(request)
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160)
      if (!EMAIL_RE.test(email)) return json({ statusCode: 400, message: 'Valid email address is required.' }, 400)
      const role = VALID_WORKSPACE_ROLES.has(body.role) && body.role !== 'owner' ? body.role : 'editor'
      const rawDays = Number.parseInt(String(body.expiresInDays || '7'), 10)
      const expiresInDays = Number.isFinite(rawDays) ? Math.min(30, Math.max(1, rawDays)) : 7
      const now = new Date()
      const nowIso = now.toISOString()
      const expiresAt = new Date(now.getTime() + expiresInDays * 86_400_000).toISOString()
      const invId = h.genId('wsi')

      await env.DB.prepare(
        `INSERT INTO ws_workspace_invitations
          (id, workspaceId, email, role, invitedBy, status, expiresAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
        .bind(invId, wsId, email, role, user.id, expiresAt, nowIso, nowIso)
        .run()

      await writeAuditLog(env, h, user.id, {
        action: 'workspace_invite',
        resourceType: 'workspace',
        resourceId: wsId,
        category: 'workspaces',
        description: `Invited ${email} to "${wsRow.name}" as ${role}`,
      })

      return json(
        {
          id: invId,
          workspaceId: wsId,
          email,
          role,
          invitedBy: user.id,
          expiresAt,
          status: 'pending',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        201,
      )
    }

    const invDelMatch = sub.match(/^\/invitations\/([^/]+)$/)
    if (invDelMatch && method === 'DELETE') {
      if (!canManage) return json({ statusCode: 403, message: 'Forbidden' }, 403)
      const invId = decodeURIComponent(invDelMatch[1])
      await env.DB.prepare('DELETE FROM ws_workspace_invitations WHERE id = ? AND workspaceId = ?').bind(invId, wsId).run()
      return json({ ok: true })
    }

    if (sub === '/memory' && method === 'POST') {
      if (!canWrite) return json({ statusCode: 403, message: 'Viewers cannot add workspace memory.' }, 403)
      const body = await readBody(request)
      const title = String(body.title || '').trim().slice(0, 100)
      const content = String(body.content || '').trim().slice(0, 8000)
      if (!title || !content) return json({ statusCode: 400, message: 'Title and content are required.' }, 400)
      const type = VALID_MEMORY_TYPES.has(body.type) ? body.type : 'note'
      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 20)
        : []
      const sourceRef = body.sourceRef ? String(body.sourceRef).trim().slice(0, 240) : null
      const entryId = h.genId('wmem')
      const now = new Date().toISOString()

      await env.DB.prepare(
        `INSERT INTO ws_workspace_memory
          (id, workspaceId, createdByUserId, type, title, content, tags, sourceRef, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(entryId, wsId, user.id, type, title, content, JSON.stringify(tags), sourceRef, now, now)
        .run()

      return json(
        {
          id: entryId,
          workspaceId: wsId,
          createdByUserId: user.id,
          type,
          title,
          content,
          tags,
          ...(sourceRef ? { sourceRef } : {}),
          createdAt: now,
          updatedAt: now,
        },
        201,
      )
    }

    const memDelMatch = sub.match(/^\/memory\/([^/]+)$/)
    if (memDelMatch && method === 'DELETE') {
      if (!canWrite) return json({ statusCode: 403, message: 'Forbidden' }, 403)
      const entryId = decodeURIComponent(memDelMatch[1])
      await env.DB.prepare('DELETE FROM ws_workspace_memory WHERE id = ? AND workspaceId = ?').bind(entryId, wsId).run()
      return json({ ok: true })
    }

    const shareMatch = sub.match(/^\/share\/(conversation|workflow|artifact)\/([^/]+)$/)
    if (shareMatch && method === 'POST') {
      if (!canWrite) return json({ statusCode: 403, message: 'Viewers cannot share items.' }, 403)
      const kind = shareMatch[1]
      const entityId = decodeURIComponent(shareMatch[2])
      let title = entityId

      if (kind === 'conversation') {
        const conv = await safeFirst(env, 'SELECT id, title FROM conversations WHERE id = ? AND userId = ?', [entityId, user.id])
        if (!conv) return json({ statusCode: 404, message: 'Conversation not found.' }, 404)
        title = conv.title || conv.id.slice(0, 8)
      } else if (kind === 'artifact') {
        const art = await safeFirst(env, 'SELECT id, title FROM ws_artifacts WHERE id = ? AND userId = ?', [entityId, user.id])
        if (!art) return json({ statusCode: 404, message: 'Artifact not found.' }, 404)
        title = art.title
      } else if (kind === 'workflow') {
        const wf = await safeFirst(env, 'SELECT id, name FROM workflows WHERE id = ? AND userId = ?', [entityId, user.id])
        title = wf?.name || `Workflow ${entityId.slice(0, 8)}`
      }

      const shareId = h.genId('wsh')
      const now = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO ws_workspace_shares (id, workspaceId, kind, entityId, title, sharedByUserId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspaceId, kind, entityId) DO UPDATE SET title = excluded.title`,
      )
        .bind(shareId, wsId, kind, entityId, title, user.id, now)
        .run()

      if (kind === 'conversation') {
        return json({ id: shareId, workspaceId: wsId, conversationId: entityId, title, sharedByUserId: user.id, createdAt: now }, 201)
      }
      if (kind === 'workflow') {
        return json({ id: shareId, workspaceId: wsId, workflowId: entityId, name: title, sharedByUserId: user.id, createdAt: now }, 201)
      }
      return json({ id: shareId, workspaceId: wsId, artifactId: entityId, title, sharedByUserId: user.id, createdAt: now }, 201)
    }

    const memberRoleMatch = sub.match(/^\/members\/([^/]+)\/role$/)
    if (memberRoleMatch && method === 'PATCH') {
      if (!canManage) return json({ statusCode: 403, message: 'Forbidden' }, 403)
      const memberUserId = decodeURIComponent(memberRoleMatch[1])
      if (memberUserId === wsRow.ownerId) {
        return json({ statusCode: 400, message: 'Cannot change workspace owner role.' }, 400)
      }
      const body = await readBody(request)
      const role = VALID_WORKSPACE_ROLES.has(body.role) && body.role !== 'owner' ? body.role : null
      if (!role) return json({ statusCode: 400, message: 'Invalid role.' }, 400)
      const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer
      await env.DB.prepare(
        'UPDATE ws_workspace_members SET role = ?, permissions = ? WHERE workspaceId = ? AND userId = ?',
      )
        .bind(role, JSON.stringify(perms), wsId, memberUserId)
        .run()
      const updated = await getWorkspaceMembership(env, wsId, memberUserId)
      if (!updated) return json({ statusCode: 404, message: 'Member not found.' }, 404)
      return json({
        id: updated.id,
        workspaceId: updated.workspaceId,
        userId: updated.userId,
        role: updated.role,
        permissions: parseJson(updated.permissions, perms),
        joinedAt: updated.joinedAt,
      })
    }

    const memberDelMatch = sub.match(/^\/members\/([^/]+)$/)
    if (memberDelMatch && method === 'DELETE') {
      if (!canManage) return json({ statusCode: 403, message: 'Forbidden' }, 403)
      const memberUserId = decodeURIComponent(memberDelMatch[1])
      if (memberUserId === wsRow.ownerId) {
        return json({ statusCode: 400, message: 'Cannot remove the workspace owner.' }, 400)
      }
      await env.DB.prepare('DELETE FROM ws_workspace_members WHERE workspaceId = ? AND userId = ?')
        .bind(wsId, memberUserId)
        .run()
      return json({ ok: true })
    }

    return json({ statusCode: 404, message: 'Workspace endpoint not found.' }, 404)
  }

  return null
}
