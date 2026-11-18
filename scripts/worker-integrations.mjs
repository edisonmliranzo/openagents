// Integrations routes for Cloudflare Worker:
//  - Connectors: /api/v1/connectors/*
//  - Channels:   /api/v1/channels/{whatsapp,telegram,slack,discord}/*
//  - MCP:        /api/v1/mcp/servers*
//  - Plugins:    /api/v1/plugins*
//  - API Keys:   /api/v1/apikeys/*
//  - A/B Tests:  /api/v1/ab-tests*
//
// Pure Web APIs only (Cloudflare Workers compatible, no Node built-ins or npm imports).

const CONNECTOR_CATALOG = {
  google_gmail: {
    displayName: 'Gmail',
    toolNames: ['gmail_search', 'gmail_read_thread', 'gmail_list_labels', 'gmail_draft_reply', 'gmail_send_draft'],
  },
  google_calendar: {
    displayName: 'Google Calendar',
    toolNames: ['calendar_get_availability', 'calendar_create_event', 'calendar_update_event', 'calendar_cancel_event'],
  },
  whatsapp: { displayName: 'WhatsApp', toolNames: [] },
  telegram: { displayName: 'Telegram', toolNames: [] },
  slack: { displayName: 'Slack', toolNames: [] },
  discord: { displayName: 'Discord', toolNames: [] },
}

const GOOGLE_SCOPES = {
  mailFull: 'https://mail.google.com/',
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailModify: 'https://www.googleapis.com/auth/gmail.modify',
  gmailCompose: 'https://www.googleapis.com/auth/gmail.compose',
  gmailMetadata: 'https://www.googleapis.com/auth/gmail.metadata',
  gmailLabels: 'https://www.googleapis.com/auth/gmail.labels',
  calendarFull: 'https://www.googleapis.com/auth/calendar',
  calendarReadonly: 'https://www.googleapis.com/auth/calendar.readonly',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  calendarEventsOwned: 'https://www.googleapis.com/auth/calendar.events.owned',
  calendarAppCreated: 'https://www.googleapis.com/auth/calendar.app.created',
  calendarFreeBusy: 'https://www.googleapis.com/auth/calendar.freebusy',
  calendarEventsFreeBusy: 'https://www.googleapis.com/auth/calendar.events.freebusy',
}

const GOOGLE_SCOPE_RULES = {
  google_gmail: [
    {
      toolName: 'gmail_search',
      displayName: 'Gmail Search',
      requiresApproval: false,
      mode: 'read',
      requiredAnyOf: [[GOOGLE_SCOPES.mailFull], [GOOGLE_SCOPES.gmailModify], [GOOGLE_SCOPES.gmailReadonly]],
      recommendedScopes: [GOOGLE_SCOPES.gmailModify],
    },
    {
      toolName: 'gmail_read_thread',
      displayName: 'Gmail Read Thread',
      requiresApproval: false,
      mode: 'read',
      requiredAnyOf: [[GOOGLE_SCOPES.mailFull], [GOOGLE_SCOPES.gmailModify], [GOOGLE_SCOPES.gmailReadonly], [GOOGLE_SCOPES.gmailMetadata]],
      recommendedScopes: [GOOGLE_SCOPES.gmailModify],
    },
    {
      toolName: 'gmail_list_labels',
      displayName: 'Gmail List Labels',
      requiresApproval: false,
      mode: 'read',
      requiredAnyOf: [[GOOGLE_SCOPES.mailFull], [GOOGLE_SCOPES.gmailModify], [GOOGLE_SCOPES.gmailReadonly], [GOOGLE_SCOPES.gmailMetadata], [GOOGLE_SCOPES.gmailLabels]],
      recommendedScopes: [GOOGLE_SCOPES.gmailModify],
    },
    {
      toolName: 'gmail_draft_reply',
      displayName: 'Gmail Draft Reply',
      requiresApproval: true,
      mode: 'write',
      requiredAnyOf: [[GOOGLE_SCOPES.mailFull], [GOOGLE_SCOPES.gmailModify], [GOOGLE_SCOPES.gmailCompose]],
      recommendedScopes: [GOOGLE_SCOPES.gmailCompose],
    },
    {
      toolName: 'gmail_send_draft',
      displayName: 'Gmail Send Draft',
      requiresApproval: true,
      mode: 'write',
      requiredAnyOf: [[GOOGLE_SCOPES.mailFull], [GOOGLE_SCOPES.gmailModify], [GOOGLE_SCOPES.gmailCompose]],
      recommendedScopes: [GOOGLE_SCOPES.gmailCompose],
    },
  ],
  google_calendar: [
    {
      toolName: 'calendar_get_availability',
      displayName: 'Calendar Availability',
      requiresApproval: false,
      mode: 'read',
      requiredAnyOf: [[GOOGLE_SCOPES.calendarFull], [GOOGLE_SCOPES.calendarReadonly], [GOOGLE_SCOPES.calendarFreeBusy], [GOOGLE_SCOPES.calendarEventsFreeBusy]],
      recommendedScopes: [GOOGLE_SCOPES.calendarReadonly],
    },
    {
      toolName: 'calendar_create_event',
      displayName: 'Calendar Create Event',
      requiresApproval: true,
      mode: 'write',
      requiredAnyOf: [[GOOGLE_SCOPES.calendarFull], [GOOGLE_SCOPES.calendarEvents], [GOOGLE_SCOPES.calendarAppCreated], [GOOGLE_SCOPES.calendarEventsOwned]],
      recommendedScopes: [GOOGLE_SCOPES.calendarEvents],
    },
    {
      toolName: 'calendar_update_event',
      displayName: 'Calendar Update Event',
      requiresApproval: true,
      mode: 'write',
      requiredAnyOf: [[GOOGLE_SCOPES.calendarFull], [GOOGLE_SCOPES.calendarEvents], [GOOGLE_SCOPES.calendarAppCreated], [GOOGLE_SCOPES.calendarEventsOwned]],
      recommendedScopes: [GOOGLE_SCOPES.calendarEvents],
    },
    {
      toolName: 'calendar_cancel_event',
      displayName: 'Calendar Cancel Event',
      requiresApproval: true,
      mode: 'write',
      requiredAnyOf: [[GOOGLE_SCOPES.calendarFull], [GOOGLE_SCOPES.calendarEvents], [GOOGLE_SCOPES.calendarAppCreated], [GOOGLE_SCOPES.calendarEventsOwned]],
      recommendedScopes: [GOOGLE_SCOPES.calendarEvents],
    },
  ],
}

const GOOGLE_RECOMMENDED_SCOPES = {
  google_gmail: [GOOGLE_SCOPES.gmailModify, GOOGLE_SCOPES.gmailCompose],
  google_calendar: [GOOGLE_SCOPES.calendarReadonly, GOOGLE_SCOPES.calendarEvents],
}

const OAUTH_DEFINITIONS = [
  {
    id: 'google_gmail',
    displayName: 'Gmail',
    provider: 'google',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    scopes: GOOGLE_RECOMMENDED_SCOPES.google_gmail,
    actions: [
      { name: 'list_messages', displayName: 'List Messages', description: 'List recent Gmail messages' },
      { name: 'list_labels', displayName: 'List Labels', description: 'List Gmail labels' },
    ],
  },
  {
    id: 'google_calendar',
    displayName: 'Google Calendar',
    provider: 'google',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    scopes: GOOGLE_RECOMMENDED_SCOPES.google_calendar,
    actions: [
      { name: 'list_events', displayName: 'List Events', description: 'List upcoming calendar events' },
    ],
  },
  {
    id: 'google_drive',
    displayName: 'Google Drive',
    provider: 'google',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    actions: [
      { name: 'list_files', displayName: 'List Files', description: 'List recent Drive files' },
    ],
  },
  {
    id: 'github',
    displayName: 'GitHub',
    provider: 'github',
    clientIdEnv: 'GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
    scopes: ['repo', 'read:user'],
    actions: [
      { name: 'list_repos', displayName: 'List Repositories', description: 'List GitHub repositories' },
    ],
  },
  {
    id: 'notion',
    displayName: 'Notion',
    provider: 'notion',
    clientIdEnv: 'NOTION_CLIENT_ID',
    clientSecretEnv: 'NOTION_CLIENT_SECRET',
    scopes: [],
    actions: [
      { name: 'search', displayName: 'Search Workspace', description: 'Search Notion pages and databases' },
    ],
  },
  {
    id: 'slack',
    displayName: 'Slack',
    provider: 'slack',
    clientIdEnv: 'SLACK_CLIENT_ID',
    clientSecretEnv: 'SLACK_CLIENT_SECRET',
    scopes: ['channels:read', 'chat:write'],
    actions: [
      { name: 'list_channels', displayName: 'List Channels', description: 'List Slack channels' },
    ],
  },
]

const PLUGIN_CATALOG = [
  {
    key: 'filesystem',
    name: 'Filesystem',
    description: 'Read, search, and edit files in an approved directory.',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
  },
  {
    key: 'fetch',
    name: 'Web Fetch',
    description: 'Fast page fetching with JS-to-markdown conversion for research.',
    category: 'research',
    command: 'uvx',
    args: ['mcp-server-fetch'],
  },
  {
    key: 'memory',
    name: 'Knowledge Graph Memory',
    description: 'Persistent entity-relationship memory across conversations.',
    category: 'memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    key: 'github',
    name: 'GitHub',
    description: 'Repos, issues, PRs, and code search via the official GitHub MCP server.',
    category: 'developer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiresEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  },
  {
    key: 'sqlite',
    name: 'SQLite',
    description: 'Query and analyze local SQLite databases.',
    category: 'data',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
  },
  {
    key: 'postgres',
    name: 'Postgres',
    description: 'Read-only SQL access to a Postgres database.',
    category: 'data',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    requiresEnv: ['POSTGRES_PLUGIN_URL'],
  },
  {
    key: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search powered by the Brave Search API.',
    category: 'research',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    requiresEnv: ['BRAVE_API_KEY'],
  },
  {
    key: 'slack',
    name: 'Slack',
    description: 'Channels, messages, and workspace search.',
    category: 'communication',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    requiresEnv: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
  },
  {
    key: 'puppeteer',
    name: 'Browser Automation',
    description: 'Drive a real headless browser: navigate, click, screenshot.',
    category: 'automation',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
  },
  {
    key: 'time',
    name: 'Time & Zones',
    description: 'Clock, timezone conversion, and date math.',
    category: 'utility',
    command: 'uvx',
    args: ['mcp-server-time'],
  },
]

const TRACKED_API_KEYS = [
  { name: 'APIsRouter (apisrouter.dev — Main)', envVar: 'APISROUTER_API_KEY', llmProvider: 'apisrouter' },
  { name: 'OpenAI', envVar: 'OPENAI_API_KEY', llmProvider: 'openai' },
  { name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', llmProvider: 'anthropic' },
  { name: 'Google Gemini', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY', llmProvider: 'google' },
  { name: 'Perplexity', envVar: 'PERPLEXITY_API_KEY', llmProvider: 'perplexity' },
  { name: 'AtlasCloud', envVar: 'ATLASCLOUD_API_KEY', llmProvider: 'atlascloud' },
  { name: 'MiniMax', envVar: 'MINIMAX_API_KEY', llmProvider: 'minimax' },
  { name: 'NVIDIA NIM', envVar: 'NVIDIA_API_KEY', llmProvider: 'nvidia' },
  { name: 'XAI / Grok', envVar: 'XAI_API_KEY', llmProvider: 'xai' },
  { name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', llmProvider: 'deepseek' },
  { name: 'Mistral', envVar: 'MISTRAL_API_KEY', llmProvider: 'mistral' },
  { name: 'Groq', envVar: 'GROQ_API_KEY', llmProvider: 'groq' },
  { name: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', llmProvider: 'openrouter' },
  { name: 'Together AI', envVar: 'TOGETHER_API_KEY', llmProvider: 'together' },
  { name: 'Meta Muse Spark', envVar: 'MODEL_API_KEY', llmProvider: 'meta' },
  { name: 'WhatsApp', envVar: 'WHATSAPP_TOKEN', llmProvider: null },
  { name: 'Telegram Bot', envVar: 'TELEGRAM_BOT_TOKEN', llmProvider: null },
  { name: 'Slack Bot', envVar: 'SLACK_BOT_TOKEN', llmProvider: null },
  { name: 'Airtable', envVar: 'AIRTABLE_API_KEY', llmProvider: null },
  { name: 'HubSpot', envVar: 'HUBSPOT_ACCESS_TOKEN', llmProvider: null },
  { name: 'ScreenshotOne', envVar: 'SCREENSHOTONE_API_KEY', llmProvider: null },
]

const TRACKED_KEY_MAP = new Map(TRACKED_API_KEYS.map((k) => [k.envVar, k]))
const PLUGIN_BY_KEY = new Map(PLUGIN_CATALOG.map((p) => [p.key, p]))
const OAUTH_BY_ID = new Map(OAUTH_DEFINITIONS.map((d) => [d.id, d]))
const TOKEN_EXPIRY_WARNING_MS = 72 * 3600 * 1000
const MAX_LATENCY_MS = 120_000

let schemaReady = false

async function ensureSchema(env) {
  if (schemaReady) return
  const stmts = [
    `CREATE TABLE IF NOT EXISTS intg_connector_connections (
       userId TEXT NOT NULL,
       connectorId TEXT NOT NULL,
       encryptedTokens TEXT,
       accountEmail TEXT,
       scopesJson TEXT NOT NULL DEFAULT '[]',
       tokenExpiresAt TEXT,
       connectedAt TEXT,
       updatedAt TEXT NOT NULL,
       PRIMARY KEY (userId, connectorId)
     )`,
    `CREATE TABLE IF NOT EXISTS intg_connector_health (
       userId TEXT NOT NULL,
       connectorId TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'down',
       lastSuccessAt TEXT,
       lastFailureAt TEXT,
       lastError TEXT,
       tokenExpiresAt TEXT,
       p95LatencyMs INTEGER,
       rateLimitHits INTEGER NOT NULL DEFAULT 0,
       failureStreak INTEGER NOT NULL DEFAULT 0,
       metadataJson TEXT,
       updatedAt TEXT NOT NULL,
       PRIMARY KEY (userId, connectorId)
     )`,
    `CREATE TABLE IF NOT EXISTS intg_channel_config (
       userId TEXT NOT NULL,
       channel TEXT NOT NULL,
       encryptedToken TEXT,
       botUsername TEXT,
       webhookUrl TEXT,
       metadataJson TEXT,
       updatedAt TEXT NOT NULL,
       PRIMARY KEY (userId, channel)
     )`,
    `CREATE TABLE IF NOT EXISTS intg_channel_links (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       channel TEXT NOT NULL,
       externalId TEXT NOT NULL,
       label TEXT,
       secondaryId TEXT,
       source TEXT NOT NULL DEFAULT 'paired',
       linkedAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL,
       lastSeenAt TEXT,
       lastConversationId TEXT,
       UNIQUE (userId, channel, externalId)
     )`,
    `CREATE TABLE IF NOT EXISTS intg_channel_pairings (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       channel TEXT NOT NULL,
       code TEXT NOT NULL,
       command TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending',
       targetId TEXT,
       expiresAt TEXT NOT NULL,
       linkedAt TEXT,
       createdAt TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS intg_mcp_servers (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       name TEXT NOT NULL,
       transport TEXT NOT NULL DEFAULT 'http',
       enabled INTEGER NOT NULL DEFAULT 1,
       command TEXT,
       argsJson TEXT NOT NULL DEFAULT '[]',
       cwd TEXT,
       url TEXT,
       envKeysJson TEXT NOT NULL DEFAULT '[]',
       encryptedEnv TEXT,
       headerNamesJson TEXT NOT NULL DEFAULT '[]',
       encryptedHeaders TEXT,
       toolsJson TEXT NOT NULL DEFAULT '[]',
       toolCount INTEGER NOT NULL DEFAULT 0,
       lastStatus TEXT NOT NULL DEFAULT 'idle',
       lastError TEXT,
       lastUsedAt TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS intg_plugins (
       userId TEXT NOT NULL,
       pluginKey TEXT NOT NULL,
       installed INTEGER NOT NULL DEFAULT 1,
       enabled INTEGER NOT NULL DEFAULT 1,
       updatedAt TEXT NOT NULL,
       PRIMARY KEY (userId, pluginKey)
     )`,
    `CREATE TABLE IF NOT EXISTS intg_api_keys (
       userId TEXT NOT NULL,
       envVar TEXT NOT NULL,
       encryptedValue TEXT NOT NULL,
       updatedAt TEXT NOT NULL,
       PRIMARY KEY (userId, envVar)
     )`,
    `CREATE TABLE IF NOT EXISTS intg_ab_tests (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       name TEXT NOT NULL,
       description TEXT,
       variantsJson TEXT NOT NULL,
       resultsJson TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'running',
       winnerVariantId TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
  ]
  for (const sql of stmts) {
    await env.DB.prepare(sql).run()
  }
  schemaReady = true
}

function parseJson(val, fallback) {
  try {
    return val ? JSON.parse(val) : fallback
  } catch {
    return fallback
  }
}

function optStr(v, maxLen = 500) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, maxLen) : null
}

function normalizeIso(v) {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v.trim())
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return []
  const seen = new Set()
  for (const item of scopes) {
    if (typeof item !== 'string') continue
    const s = item.trim().slice(0, 200)
    if (s) seen.add(s)
    if (seen.size >= 50) break
  }
  return [...seen]
}

function maskKey(val) {
  if (!val || val.length < 8) return '••••••••'
  return `••••••••${val.slice(-4)}`
}

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length]
  return out
}

function isSafeExternalUrl(raw) {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^fc00:|^fd00:|^fe80:/i.test(host)
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

// ─── Connectors helpers ──────────────────────────────────────────────────────

function isGoogleConnector(id) {
  return id === 'google_gmail' || id === 'google_calendar'
}

function buildGoogleScopeDiagnostics(connectorId, tokenInfo) {
  const rules = GOOGLE_SCOPE_RULES[connectorId]
  const recommendedScopes = GOOGLE_RECOMMENDED_SCOPES[connectorId] || []
  if (!rules) return null
  const grantedScopes = tokenInfo?.scopes || []
  const grantedSet = new Set(grantedScopes)
  const hasToken = Boolean(tokenInfo?.accessToken)
  const tokenExpired = Boolean(tokenInfo?.tokenExpiresAt && new Date(tokenInfo.tokenExpiresAt).getTime() <= Date.now())

  const toolAccess = rules.map((rule) => {
    const satisfied = hasToken && !tokenExpired && rule.requiredAnyOf.some((group) => group.every((s) => grantedSet.has(s)))
    const missing = satisfied ? [] : rule.recommendedScopes.filter((s) => !grantedSet.has(s))
    return {
      toolName: rule.toolName,
      displayName: rule.displayName,
      requiresApproval: rule.requiresApproval,
      mode: rule.mode,
      status: satisfied ? 'available' : 'blocked',
      requiredScopes: rule.recommendedScopes,
      missingScopes: missing,
      summary: !hasToken
        ? 'Not connected. Paste an access token or complete OAuth to enable.'
        : tokenExpired
          ? 'Access token is expired.'
          : satisfied
            ? 'Required scopes granted.'
            : `Missing required scope(s): ${missing.join(', ') || rule.recommendedScopes.join(', ')}.`,
    }
  })

  const availableTools = toolAccess.filter((t) => t.status === 'available').map((t) => t.toolName)
  const blockedTools = toolAccess.filter((t) => t.status === 'blocked').map((t) => t.toolName)
  const missingScopes = [...new Set(toolAccess.flatMap((t) => t.missingScopes))]

  const summary = !hasToken
    ? 'No credentials saved for this connector.'
    : tokenExpired
      ? 'Stored access token has expired.'
      : blockedTools.length === 0
        ? `All ${availableTools.length} action(s) are ready.`
        : `${availableTools.length}/${toolAccess.length} action(s) ready; ${blockedTools.length} blocked by missing scopes.`

  return {
    connectorId,
    recommendedScopes,
    grantedScopes,
    missingScopes,
    availableTools,
    blockedTools,
    hasRefreshToken: Boolean(tokenInfo?.refreshToken),
    tokenExpired,
    toolAccess,
    summary,
  }
}

async function loadConnectorTokenInfo(env, h, row) {
  if (!row) return null
  let decrypted = null
  if (row.encryptedTokens) {
    const plain = await h.decryptSecret(env, row.encryptedTokens).catch(() => null)
    decrypted = parseJson(plain, null)
  }
  return {
    accessToken: decrypted?.accessToken || null,
    refreshToken: decrypted?.refreshToken || null,
    tokenExpiresAt: decrypted?.tokenExpiresAt || row.tokenExpiresAt || null,
    scopes: Array.isArray(decrypted?.scopes) ? decrypted.scopes : parseJson(row.scopesJson, []),
    accountEmail: decrypted?.accountEmail || row.accountEmail || null,
    connectedAt: decrypted?.connectedAt || row.connectedAt || null,
    updatedAt: decrypted?.updatedAt || row.updatedAt || null,
  }
}

async function getConnectorConnection(env, h, userId, connectorId) {
  const catalog = CONNECTOR_CATALOG[connectorId]
  const toolNames = catalog ? [...catalog.toolNames] : []
  const row = await env.DB.prepare(
    'SELECT * FROM intg_connector_connections WHERE userId = ? AND connectorId = ?',
  ).bind(userId, connectorId).first()

  const info = await loadConnectorTokenInfo(env, h, row)
  const diagnostics = isGoogleConnector(connectorId) ? buildGoogleScopeDiagnostics(connectorId, info) : null

  return {
    connectorId,
    connected: Boolean(info?.accessToken),
    accountEmail: info?.accountEmail || null,
    scopes: info?.scopes || [],
    tokenExpiresAt: info?.tokenExpiresAt || null,
    connectedAt: info?.connectedAt || null,
    updatedAt: info?.updatedAt || null,
    toolNames,
    diagnostics,
  }
}

async function buildConnectorsHealthSnapshot(env, h, userId) {
  const nowIso = new Date().toISOString()
  const nowMs = Date.now()
  const [healthRes, connRes, linksRes, cfgRes] = await Promise.all([
    env.DB.prepare('SELECT * FROM intg_connector_health WHERE userId = ?').bind(userId).all(),
    env.DB.prepare('SELECT * FROM intg_connector_connections WHERE userId = ?').bind(userId).all(),
    env.DB.prepare('SELECT channel, linkedAt, lastSeenAt FROM intg_channel_links WHERE userId = ?').bind(userId).all(),
    env.DB.prepare('SELECT channel, encryptedToken, updatedAt FROM intg_channel_config WHERE userId = ?').bind(userId).all(),
  ])

  const healthById = new Map((healthRes.results || []).map((r) => [r.connectorId, r]))
  const connById = new Map((connRes.results || []).map((r) => [r.connectorId, r]))
  const cfgByChannel = new Map((cfgRes.results || []).map((r) => [r.channel, r]))
  const linksByChannel = new Map()
  for (const l of linksRes.results || []) {
    if (!linksByChannel.has(l.channel)) linksByChannel.set(l.channel, [])
    linksByChannel.get(l.channel).push(l)
  }

  const connectors = []
  for (const [connectorId, meta] of Object.entries(CONNECTOR_CATALOG)) {
    const hRow = healthById.get(connectorId) || null
    const cRow = connById.get(connectorId) || null
    const cInfo = await loadConnectorTokenInfo(env, h, cRow)
    const chLinks = linksByChannel.get(connectorId) || []
    const chCfg = cfgByChannel.get(connectorId) || null

    let status = hRow?.status || 'down'
    let lastSuccessAt = hRow?.lastSuccessAt || null
    let lastFailureAt = hRow?.lastFailureAt || null
    let lastError = hRow?.lastError || null
    let tokenExpiresAt = hRow?.tokenExpiresAt || cInfo?.tokenExpiresAt || null
    const p95LatencyMs = hRow?.p95LatencyMs ?? null
    const rateLimitHits = Number(hRow?.rateLimitHits || 0)
    const failureStreak = Number(hRow?.failureStreak || 0)
    let updatedAt = hRow?.updatedAt || cInfo?.updatedAt || nowIso

    if (!hRow) {
      if (isGoogleConnector(connectorId)) {
        if (cInfo?.accessToken) {
          status = 'connected'
          lastSuccessAt = cInfo.connectedAt || cInfo.updatedAt
        } else {
          status = 'down'
          lastError = 'Connector has no saved credentials.'
        }
      } else {
        const hasBot = Boolean(chCfg?.encryptedToken)
        if (chLinks.length > 0 || hasBot) {
          status = 'connected'
          lastSuccessAt = chLinks[0]?.lastSeenAt || chLinks[0]?.linkedAt || chCfg?.updatedAt || nowIso
        } else {
          status = 'down'
          lastError = `No linked ${meta.displayName.toLowerCase()} routes.`
        }
      }
    }

    const alerts = []
    if (tokenExpiresAt) {
      const expMs = new Date(tokenExpiresAt).getTime()
      if (Number.isFinite(expMs)) {
        if (expMs <= nowMs) {
          status = 'down'
          alerts.push({ code: 'token_expired', severity: 'critical', message: 'Access token has expired.' })
        } else if (expMs - nowMs <= TOKEN_EXPIRY_WARNING_MS) {
          if (status === 'connected') status = 'degraded'
          alerts.push({ code: 'token_expiring', severity: 'warning', message: 'Access token expires within 72 hours.' })
        }
      }
    }
    if (isGoogleConnector(connectorId) && cInfo?.accessToken) {
      const diag = buildGoogleScopeDiagnostics(connectorId, cInfo)
      if (diag?.blockedTools?.length) {
        if (status === 'connected') status = 'degraded'
        alerts.push({
          code: 'missing_scopes',
          severity: 'warning',
          message: `${diag.blockedTools.length} tool(s) blocked by missing scopes.`,
        })
      }
    }
    if (failureStreak >= 3) {
      alerts.push({ code: 'failure_streak', severity: failureStreak >= 6 ? 'critical' : 'warning', message: `${failureStreak} consecutive failures.` })
    }

    connectors.push({
      connectorId,
      displayName: meta.displayName,
      status,
      lastSuccessAt,
      lastFailureAt,
      lastError,
      tokenExpiresAt,
      p95LatencyMs,
      rateLimitHits,
      failureStreak,
      alerts,
      updatedAt,
    })
  }

  connectors.sort((a, b) => a.displayName.localeCompare(b.displayName))
  return { connectors, generatedAt: nowIso }
}

// ─── Channels helpers ────────────────────────────────────────────────────────

function pairingDto(channel, row) {
  const expired = row.status === 'pending' && new Date(row.expiresAt).getTime() <= Date.now()
  const status = expired ? 'expired' : row.status
  const base = {
    id: row.id,
    code: row.code,
    command: row.command,
    status,
    expiresAt: row.expiresAt,
    linkedAt: row.linkedAt || null,
  }
  if (channel === 'whatsapp') {
    return { ...base, phone: row.targetId || null, linkText: row.command, linkUrl: null, qrImageUrl: null }
  }
  if (channel === 'telegram') {
    return { ...base, chatId: row.targetId || null }
  }
  if (channel === 'slack') {
    return { ...base, teamId: row.targetId || null }
  }
  return { ...base, guildId: row.targetId || null }
}

function linkDto(channel, row) {
  if (channel === 'whatsapp') {
    return {
      id: row.id,
      phone: row.externalId,
      label: row.label || null,
      source: row.source === 'allowlisted' ? 'allowlisted' : 'paired',
      linkedAt: row.linkedAt,
      updatedAt: row.updatedAt,
      lastSeenAt: row.lastSeenAt || null,
      lastConversationId: row.lastConversationId || null,
    }
  }
  if (channel === 'telegram') {
    return {
      id: row.id,
      chatId: row.externalId,
      label: row.label || null,
      linkedAt: row.linkedAt,
      updatedAt: row.updatedAt,
      lastSeenAt: row.lastSeenAt || null,
      lastConversationId: row.lastConversationId || null,
    }
  }
  if (channel === 'slack') {
    return {
      id: row.id,
      teamId: row.externalId,
      teamName: row.label || null,
      channelId: row.secondaryId || null,
      linkedAt: row.linkedAt,
      updatedAt: row.updatedAt,
      lastSeenAt: row.lastSeenAt || null,
      lastConversationId: row.lastConversationId || null,
    }
  }
  return {
    id: row.id,
    guildId: row.externalId,
    guildName: row.label || null,
    channelId: row.secondaryId || null,
    linkedAt: row.linkedAt,
    updatedAt: row.updatedAt,
    lastSeenAt: row.lastSeenAt || null,
    lastConversationId: row.lastConversationId || null,
  }
}

async function listChannelPairings(env, userId, channel) {
  const res = await env.DB.prepare(
    'SELECT * FROM intg_channel_pairings WHERE userId = ? AND channel = ? ORDER BY createdAt DESC LIMIT 50',
  ).bind(userId, channel).all()
  return (res.results || []).map((r) => pairingDto(channel, r))
}

async function createChannelPairing(env, h, userId, channel, expiresInMinutesRaw) {
  const mins = Math.min(240, Math.max(3, Math.floor(Number(expiresInMinutesRaw) || 15)))
  const now = new Date()
  const expiresAt = new Date(now.getTime() + mins * 60_000).toISOString()
  const code = `OA-${randomCode(6)}`
  const command =
    channel === 'whatsapp'
      ? `pair ${code}`
      : channel === 'telegram'
        ? `/pair ${code}`
        : `/openagents pair ${code}`
  const id = h.genId('pair')
  await env.DB.prepare(
    `INSERT INTO intg_channel_pairings (id, userId, channel, code, command, status, targetId, expiresAt, linkedAt, createdAt)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, NULL, ?)`,
  ).bind(id, userId, channel, code, command, expiresAt, now.toISOString()).run()
  const row = await env.DB.prepare('SELECT * FROM intg_channel_pairings WHERE id = ? AND userId = ?').bind(id, userId).first()
  return pairingDto(channel, row)
}

async function listChannelLinks(env, userId, channel) {
  const res = await env.DB.prepare(
    'SELECT * FROM intg_channel_links WHERE userId = ? AND channel = ? ORDER BY linkedAt DESC LIMIT 100',
  ).bind(userId, channel).all()
  return (res.results || []).map((r) => linkDto(channel, r))
}

async function unlinkChannelItem(env, userId, channel, idOrExternalId) {
  await env.DB.prepare(
    'DELETE FROM intg_channel_links WHERE userId = ? AND channel = ? AND (id = ? OR externalId = ?)',
  ).bind(userId, channel, idOrExternalId, idOrExternalId).run()
}

// ─── MCP helpers ─────────────────────────────────────────────────────────────

function mcpServerView(row) {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport === 'stdio' ? 'stdio' : 'http',
    enabled: Boolean(row.enabled),
    ...(row.command ? { command: row.command } : {}),
    args: parseJson(row.argsJson, []),
    envKeys: parseJson(row.envKeysJson, []),
    ...(row.url ? { url: row.url } : {}),
    headerNames: parseJson(row.headerNamesJson, []),
    toolCount: Number(row.toolCount || 0),
    lastStatus: row.lastStatus || 'idle',
    lastError: row.lastError || null,
    lastUsedAt: row.lastUsedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function sanitizeStringMap(obj, maxEntries = 30, maxValLen = 1000) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  let count = 0
  for (const [k, v] of Object.entries(obj)) {
    if (count >= maxEntries) break
    const key = String(k || '').trim().slice(0, 120)
    if (!key) continue
    out[key] = String(v ?? '').slice(0, maxValLen)
    count++
  }
  return out
}

async function probeMcpServer(env, h, row) {
  if (row.transport === 'stdio') {
    return {
      ok: false,
      toolCount: 0,
      tools: [],
      error: 'stdio MCP servers require a local runtime and cannot be executed on Cloudflare Workers. Use an HTTP MCP server URL instead.',
    }
  }
  if (!row.url || !isSafeExternalUrl(row.url)) {
    return { ok: false, toolCount: 0, tools: [], error: 'Invalid or disallowed MCP server URL.' }
  }

  let headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
  if (row.encryptedHeaders) {
    const plain = await h.decryptSecret(env, row.encryptedHeaders).catch(() => null)
    const parsed = parseJson(plain, {})
    for (const [k, v] of Object.entries(parsed)) {
      if (k && typeof v === 'string') headers[k] = v
    }
  }

  try {
    const initRes = await fetch(row.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'openagents-worker', version: '1.0.0' },
        },
      }),
      signal: AbortSignal.timeout(6000),
    })

    if (!initRes.ok) {
      const errText = (await initRes.text().catch(() => '')).slice(0, 200)
      return { ok: false, toolCount: 0, tools: [], error: `HTTP ${initRes.status}: ${errText || initRes.statusText}` }
    }

    const sessionId = initRes.headers.get('mcp-session-id')
    const listHeaders = sessionId ? { ...headers, 'mcp-session-id': sessionId } : headers

    const listRes = await fetch(row.url, {
      method: 'POST',
      headers: listHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(6000),
    }).catch(() => null)

    let tools = []
    if (listRes && listRes.ok) {
      const raw = await listRes.text().catch(() => '')
      let payload = parseJson(raw, null)
      if (!payload && raw.includes('data:')) {
        const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))
        if (dataLine) payload = parseJson(dataLine.slice(5).trim(), null)
      }
      if (Array.isArray(payload?.result?.tools)) {
        tools = payload.result.tools.slice(0, 100)
      }
    }

    return { ok: true, toolCount: tools.length, tools }
  } catch (err) {
    return {
      ok: false,
      toolCount: 0,
      tools: [],
      error: err instanceof Error ? err.message.slice(0, 250) : 'Failed to reach MCP server.',
    }
  }
}

// ─── A/B Tests helpers ───────────────────────────────────────────────────────

function abTestDto(row) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description || undefined,
    variants: parseJson(row.variantsJson, []),
    winnerVariantId: row.winnerVariantId || undefined,
    status: row.status || 'running',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    results: parseJson(row.resultsJson, {}),
  }
}

// ─── Main Router ─────────────────────────────────────────────────────────────

export async function handleIntegrationRoutes({ request, env, url, path, method, origin, user, h }) {
  const isConnectors = path === '/api/v1/connectors' || path.startsWith('/api/v1/connectors/')
  const isChannels = path.startsWith('/api/v1/channels/')
  const isMcp = path === '/api/v1/mcp/servers' || path.startsWith('/api/v1/mcp/servers/')
  const isPlugins = path === '/api/v1/plugins' || path.startsWith('/api/v1/plugins/')
  const isApiKeys = path === '/api/v1/apikeys' || path.startsWith('/api/v1/apikeys/')
  const isAbTests = path === '/api/v1/ab-tests' || path.startsWith('/api/v1/ab-tests/')

  if (!isConnectors && !isChannels && !isMcp && !isPlugins && !isApiKeys && !isAbTests) {
    return null
  }

  const json = (body, status = 200) => h.jsonResponse(body, status, origin)
  await ensureSchema(env)

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CONNECTORS (/api/v1/connectors/*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isConnectors) {
    if (path === '/api/v1/connectors/health' && method === 'GET') {
      return json(await buildConnectorsHealthSnapshot(env, h, user.id))
    }

    if (path === '/api/v1/connectors/health/report' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const connectorId = String(body.connectorId || '').trim().toLowerCase()
      if (!Object.prototype.hasOwnProperty.call(CONNECTOR_CATALOG, connectorId)) {
        return json({ statusCode: 400, message: `Unknown connector "${connectorId}".` }, 400)
      }
      const success = Boolean(body.success)
      const nowIso = new Date().toISOString()
      const prev = await env.DB.prepare(
        'SELECT * FROM intg_connector_health WHERE userId = ? AND connectorId = ?',
      ).bind(user.id, connectorId).first()

      const latency = typeof body.latencyMs === 'number' && Number.isFinite(body.latencyMs)
        ? Math.min(MAX_LATENCY_MS, Math.max(0, Math.round(body.latencyMs)))
        : null
      const prevP95 = prev?.p95LatencyMs ?? null
      const nextP95 = latency == null ? prevP95 : (prevP95 == null ? latency : Math.round(prevP95 * 0.8 + latency * 0.2))
      const failureStreak = success ? 0 : Math.max(1, Number(prev?.failureStreak || 0) + 1)
      const rateLimitHits = Number(prev?.rateLimitHits || 0) + (body.rateLimited ? 1 : 0)
      const status = success ? 'connected' : (failureStreak >= 6 ? 'down' : 'degraded')
      const tokenExpiresAt = normalizeIso(body.tokenExpiresAt) ?? prev?.tokenExpiresAt ?? null
      const lastError = success ? null : (optStr(body.error, 500) || 'Connector operation failed.')
      const metadataJson = body.metadata && typeof body.metadata === 'object' ? JSON.stringify(body.metadata).slice(0, 4000) : (prev?.metadataJson ?? null)

      await env.DB.prepare(
        `INSERT OR REPLACE INTO intg_connector_health
         (userId, connectorId, status, lastSuccessAt, lastFailureAt, lastError, tokenExpiresAt, p95LatencyMs, rateLimitHits, failureStreak, metadataJson, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        user.id,
        connectorId,
        status,
        success ? nowIso : (prev?.lastSuccessAt ?? null),
        success ? (prev?.lastFailureAt ?? null) : nowIso,
        lastError,
        tokenExpiresAt,
        nextP95,
        rateLimitHits,
        failureStreak,
        metadataJson,
        nowIso,
      ).run()

      const snap = await buildConnectorsHealthSnapshot(env, h, user.id)
      const entry = snap.connectors.find((c) => c.connectorId === connectorId)
      return json(entry || { connectorId, status })
    }

    if (path === '/api/v1/connectors/oauth/definitions' && method === 'GET') {
      const defs = OAUTH_DEFINITIONS.map((d) => ({
        id: d.id,
        displayName: d.displayName,
        provider: d.provider,
        scopes: d.scopes,
        configured: Boolean(env[d.clientIdEnv] && env[d.clientSecretEnv]),
        actions: d.actions,
      }))
      return json(defs)
    }

    const oauthStartMatch = path.match(/^\/api\/v1\/connectors\/([^/]+)\/oauth\/start$/)
    if (oauthStartMatch && method === 'GET') {
      const connectorId = decodeURIComponent(oauthStartMatch[1]).toLowerCase()
      const def = OAUTH_BY_ID.get(connectorId)
      if (!def) return json({ statusCode: 404, message: `Unknown OAuth connector "${connectorId}".` }, 404)
      if (!env[def.clientIdEnv] || !env[def.clientSecretEnv]) {
        return json(
          {
            statusCode: 400,
            message: `${def.displayName} OAuth is not configured on this server. Set ${def.clientIdEnv} and ${def.clientSecretEnv}, or paste an access token in Channels.`,
          },
          400,
        )
      }
      return json({ statusCode: 400, message: `${def.displayName} OAuth callback flow is not enabled on this edge deployment.` }, 400)
    }

    const oauthStatusMatch = path.match(/^\/api\/v1\/connectors\/([^/]+)\/oauth\/status$/)
    if (oauthStatusMatch && method === 'GET') {
      const connectorId = decodeURIComponent(oauthStatusMatch[1]).toLowerCase()
      const conn = await getConnectorConnection(env, h, user.id, connectorId)
      return json({
        connectorId,
        connected: conn.connected,
        scopes: conn.scopes,
        connectedAt: conn.connectedAt,
      })
    }

    const actionMatch = path.match(/^\/api\/v1\/connectors\/([^/]+)\/actions\/([^/]+)$/)
    if (actionMatch && method === 'POST') {
      const connectorId = decodeURIComponent(actionMatch[1]).toLowerCase()
      const conn = await getConnectorConnection(env, h, user.id, connectorId)
      if (!conn.connected) {
        return json({ statusCode: 400, message: `Connector "${connectorId}" is not connected.` }, 400)
      }
      return json({ statusCode: 501, message: `Connector action execution is not available on this worker.` }, 501)
    }

    const connMatch = path.match(/^\/api\/v1\/connectors\/([^/]+)\/connection$/)
    if (connMatch) {
      const connectorId = decodeURIComponent(connMatch[1]).toLowerCase()
      if (!Object.prototype.hasOwnProperty.call(CONNECTOR_CATALOG, connectorId)) {
        return json({ statusCode: 404, message: `Unknown connector "${connectorId}".` }, 404)
      }

      if (method === 'GET') {
        return json(await getConnectorConnection(env, h, user.id, connectorId))
      }

      if (method === 'PUT' || method === 'POST') {
        if (!isGoogleConnector(connectorId)) {
          return json({ statusCode: 400, message: `Manual credential storage is not supported for "${connectorId}".` }, 400)
        }
        const body = await request.json().catch(() => ({}))
        const accessToken = optStr(body.accessToken, 4096)
        if (!accessToken) {
          return json({ statusCode: 400, message: 'Access token is required.' }, 400)
        }
        const refreshToken = optStr(body.refreshToken, 4096)
        const tokenExpiresAt = normalizeIso(body.tokenExpiresAt)
        const scopes = normalizeScopes(body.scopes)
        const accountEmail = optStr(body.accountEmail, 254)
        const nowIso = new Date().toISOString()

        const payload = {
          accessToken,
          ...(refreshToken ? { refreshToken } : {}),
          ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
          scopes,
          ...(accountEmail ? { accountEmail } : {}),
          connectedAt: nowIso,
          updatedAt: nowIso,
        }
        const encryptedTokens = await h.encryptSecret(env, JSON.stringify(payload))

        await env.DB.prepare(
          `INSERT OR REPLACE INTO intg_connector_connections
           (userId, connectorId, encryptedTokens, accountEmail, scopesJson, tokenExpiresAt, connectedAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(user.id, connectorId, encryptedTokens, accountEmail, JSON.stringify(scopes), tokenExpiresAt, nowIso, nowIso).run()

        await env.DB.prepare(
          `INSERT OR REPLACE INTO intg_connector_health
           (userId, connectorId, status, lastSuccessAt, lastFailureAt, lastError, tokenExpiresAt, p95LatencyMs, rateLimitHits, failureStreak, metadataJson, updatedAt)
           VALUES (?, ?, 'connected', ?, NULL, NULL, ?, NULL, 0, 0, ?, ?)`,
        ).bind(user.id, connectorId, nowIso, tokenExpiresAt, JSON.stringify({ scopes, accountEmail }), nowIso).run()

        const snap = await buildConnectorsHealthSnapshot(env, h, user.id)
        const connector = snap.connectors.find((c) => c.connectorId === connectorId)
        const connection = await getConnectorConnection(env, h, user.id, connectorId)
        return json({ connector, connection })
      }

      if (method === 'DELETE') {
        await env.DB.prepare(
          'DELETE FROM intg_connector_connections WHERE userId = ? AND connectorId = ?',
        ).bind(user.id, connectorId).run()
        const nowIso = new Date().toISOString()
        await env.DB.prepare(
          `INSERT OR REPLACE INTO intg_connector_health
           (userId, connectorId, status, lastSuccessAt, lastFailureAt, lastError, tokenExpiresAt, p95LatencyMs, rateLimitHits, failureStreak, metadataJson, updatedAt)
           VALUES (?, ?, 'down', NULL, NULL, 'Connector credentials removed.', NULL, NULL, 0, 0, NULL, ?)`,
        ).bind(user.id, connectorId, nowIso).run()
        return json({ ok: true })
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    const reconnectMatch = path.match(/^\/api\/v1\/connectors\/([^/]+)\/reconnect$/)
    if (reconnectMatch && method === 'POST') {
      const connectorId = decodeURIComponent(reconnectMatch[1]).toLowerCase()
      if (!Object.prototype.hasOwnProperty.call(CONNECTOR_CATALOG, connectorId)) {
        return json({ statusCode: 404, message: `Unknown connector "${connectorId}".` }, 404)
      }
      if (isGoogleConnector(connectorId)) {
        const conn = await getConnectorConnection(env, h, user.id, connectorId)
        if (!conn.connected) {
          return json({ statusCode: 400, message: `Connector "${connectorId}" has no saved credentials.` }, 400)
        }
      }
      const nowIso = new Date().toISOString()
      await env.DB.prepare(
        `INSERT OR REPLACE INTO intg_connector_health
         (userId, connectorId, status, lastSuccessAt, lastFailureAt, lastError, tokenExpiresAt, p95LatencyMs, rateLimitHits, failureStreak, metadataJson, updatedAt)
         VALUES (?, ?, 'connected', ?, NULL, NULL, NULL, NULL, 0, 0, NULL, ?)`,
      ).bind(user.id, connectorId, nowIso, nowIso).run()
      const snap = await buildConnectorsHealthSnapshot(env, h, user.id)
      const connector = snap.connectors.find((c) => c.connectorId === connectorId)
      return json({ connector, reconnectedAt: nowIso })
    }

    return json({ statusCode: 404, message: 'Connector route not found.' }, 404)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CHANNELS (/api/v1/channels/{whatsapp,telegram,slack,discord}/*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isChannels) {
    // ── WhatsApp ──
    if (path === '/api/v1/channels/whatsapp/health' && method === 'GET') {
      const userKey = await env.DB.prepare(
        "SELECT 1 AS ok FROM intg_api_keys WHERE userId = ? AND envVar = 'WHATSAPP_TOKEN'",
      ).bind(user.id).first()
      return json({
        configured: Boolean(env.WHATSAPP_TOKEN || env.TWILIO_ACCOUNT_SID || userKey?.ok),
        twilioConfigured: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
        defaultRouteConfigured: false,
        webhookTokenEnabled: Boolean(env.WHATSAPP_WEBHOOK_TOKEN),
        allowlistEnforced: true,
        legacyDefaultRouteEnabled: false,
      })
    }
    if (path === '/api/v1/channels/whatsapp/devices' && method === 'GET') {
      return json(await listChannelLinks(env, user.id, 'whatsapp'))
    }
    if (path === '/api/v1/channels/whatsapp/devices/allowlist' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const phone = optStr(body.phone, 64)
      if (!phone) return json({ statusCode: 400, message: 'Phone number is required.' }, 400)
      const label = optStr(body.label, 80)
      const nowIso = new Date().toISOString()
      const existing = await env.DB.prepare(
        "SELECT * FROM intg_channel_links WHERE userId = ? AND channel = 'whatsapp' AND externalId = ?",
      ).bind(user.id, phone).first()
      const id = existing?.id || h.genId('wadev')
      await env.DB.prepare(
        `INSERT OR REPLACE INTO intg_channel_links
         (id, userId, channel, externalId, label, secondaryId, source, linkedAt, updatedAt, lastSeenAt, lastConversationId)
         VALUES (?, ?, 'whatsapp', ?, ?, NULL, 'allowlisted', ?, ?, ?, ?)`,
      ).bind(id, user.id, phone, label, existing?.linkedAt || nowIso, nowIso, existing?.lastSeenAt || null, existing?.lastConversationId || null).run()
      const row = await env.DB.prepare('SELECT * FROM intg_channel_links WHERE id = ? AND userId = ?').bind(id, user.id).first()
      return json(linkDto('whatsapp', row), existing ? 200 : 201)
    }
    const waDevMatch = path.match(/^\/api\/v1\/channels\/whatsapp\/devices\/([^/]+)$/)
    if (waDevMatch && method === 'DELETE') {
      await unlinkChannelItem(env, user.id, 'whatsapp', decodeURIComponent(waDevMatch[1]))
      return json({ ok: true })
    }
    if (path === '/api/v1/channels/whatsapp/pairings') {
      if (method === 'GET') return json(await listChannelPairings(env, user.id, 'whatsapp'))
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await createChannelPairing(env, h, user.id, 'whatsapp', body.expiresInMinutes), 201)
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    // ── Telegram ──
    if (path === '/api/v1/channels/telegram/health' && method === 'GET') {
      const cfg = await env.DB.prepare(
        "SELECT encryptedToken, botUsername, webhookUrl FROM intg_channel_config WHERE userId = ? AND channel = 'telegram'",
      ).bind(user.id).first()
      return json({
        configured: Boolean(cfg?.encryptedToken || env.TELEGRAM_BOT_TOKEN),
        webhookSecretEnabled: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
        botUsername: cfg?.botUsername || null,
        webhookUrl: cfg?.webhookUrl || null,
      })
    }

    if (
      (path === '/api/v1/channels/telegram/token' || path === '/api/v1/channels/telegram/config') &&
      (method === 'POST' || method === 'PUT')
    ) {
      if (await h.hitRateLimit(env, `tg:token:${user.id}`, 10, 60 * 1000)) {
        return json({ statusCode: 429, message: 'Too many requests.' }, 429)
      }
      const body = await request.json().catch(() => ({}))
      const rawToken = optStr(body.botToken ?? body.token, 256)
      if (!rawToken || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(rawToken)) {
        return json({ statusCode: 400, message: 'Invalid Telegram bot token format.' }, 400)
      }
      // Verify via Telegram Bot API getMe
      const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(rawToken)}/getMe`, {
        signal: AbortSignal.timeout(6000),
      }).catch(() => null)
      if (!tgRes || !tgRes.ok) {
        return json({ statusCode: 400, message: 'Telegram rejected this bot token (getMe failed).' }, 400)
      }
      const tgData = await tgRes.json().catch(() => ({}))
      if (!tgData?.ok || !tgData?.result) {
        return json({ statusCode: 400, message: tgData?.description || 'Telegram getMe returned an error.' }, 400)
      }
      const encryptedToken = await h.encryptSecret(env, rawToken)
      const nowIso = new Date().toISOString()
      const existing = await env.DB.prepare(
        "SELECT webhookUrl FROM intg_channel_config WHERE userId = ? AND channel = 'telegram'",
      ).bind(user.id).first()
      await env.DB.prepare(
        `INSERT OR REPLACE INTO intg_channel_config (userId, channel, encryptedToken, botUsername, webhookUrl, metadataJson, updatedAt)
         VALUES (?, 'telegram', ?, ?, ?, ?, ?)`,
      ).bind(
        user.id,
        encryptedToken,
        tgData.result.username || null,
        existing?.webhookUrl || null,
        JSON.stringify({ id: tgData.result.id, firstName: tgData.result.first_name || null }),
        nowIso,
      ).run()
      return json({
        ok: true,
        configured: true,
        bot: {
          id: tgData.result.id,
          username: tgData.result.username || null,
          firstName: tgData.result.first_name || null,
        },
      })
    }

    if (path === '/api/v1/channels/telegram/token' && method === 'DELETE') {
      await env.DB.prepare("DELETE FROM intg_channel_config WHERE userId = ? AND channel = 'telegram'").bind(user.id).run()
      return json({ ok: true })
    }

    if (path === '/api/v1/channels/telegram/test' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      let token = optStr(body.botToken ?? body.token, 256)
      if (!token) {
        const cfg = await env.DB.prepare(
          "SELECT encryptedToken FROM intg_channel_config WHERE userId = ? AND channel = 'telegram'",
        ).bind(user.id).first()
        if (cfg?.encryptedToken) {
          token = await h.decryptSecret(env, cfg.encryptedToken).catch(() => null)
        }
      }
      if (!token) {
        return json({ ok: false, error: 'Telegram bot token is not configured.' }, 400)
      }
      const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`, {
        signal: AbortSignal.timeout(6000),
      }).catch(() => null)
      if (!tgRes || !tgRes.ok) {
        return json({ ok: false, error: 'Telegram getMe request failed.' }, 400)
      }
      const tgData = await tgRes.json().catch(() => ({}))
      if (!tgData?.ok) {
        return json({ ok: false, error: tgData?.description || 'Telegram getMe failed.' }, 400)
      }
      return json({
        ok: true,
        bot: {
          id: tgData.result?.id,
          username: tgData.result?.username || null,
          firstName: tgData.result?.first_name || null,
        },
      })
    }

    if (path === '/api/v1/channels/telegram/chats' && method === 'GET') {
      return json(await listChannelLinks(env, user.id, 'telegram'))
    }
    const tgChatMatch = path.match(/^\/api\/v1\/channels\/telegram\/chats\/([^/]+)$/)
    if (tgChatMatch && method === 'DELETE') {
      await unlinkChannelItem(env, user.id, 'telegram', decodeURIComponent(tgChatMatch[1]))
      return json({ ok: true })
    }
    if (path === '/api/v1/channels/telegram/pairings') {
      if (method === 'GET') return json(await listChannelPairings(env, user.id, 'telegram'))
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await createChannelPairing(env, h, user.id, 'telegram', body.expiresInMinutes), 201)
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }
    if (path === '/api/v1/channels/telegram/webhook/register' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const webhookUrl = optStr(body.webhookUrl, 500)
      if (!webhookUrl || !isSafeExternalUrl(webhookUrl) || !webhookUrl.startsWith('https://')) {
        return json({ ok: false, description: 'A valid public https:// webhookUrl is required.' }, 400)
      }
      const cfg = await env.DB.prepare(
        "SELECT encryptedToken, botUsername, metadataJson FROM intg_channel_config WHERE userId = ? AND channel = 'telegram'",
      ).bind(user.id).first()
      let token = cfg?.encryptedToken ? await h.decryptSecret(env, cfg.encryptedToken).catch(() => null) : null
      if (!token && env.TELEGRAM_BOT_TOKEN) token = env.TELEGRAM_BOT_TOKEN
      if (!token) {
        return json({ ok: false, description: 'Telegram bot token is not configured. Save a bot token first.' }, 400)
      }
      const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
        signal: AbortSignal.timeout(6000),
      }).catch(() => null)
      const tgData = tgRes ? await tgRes.json().catch(() => ({})) : {}
      if (!tgRes || !tgRes.ok || !tgData.ok) {
        return json({ ok: false, description: tgData?.description || 'Failed to register Telegram webhook.' }, 400)
      }
      if (cfg?.encryptedToken) {
        await env.DB.prepare(
          "UPDATE intg_channel_config SET webhookUrl = ?, updatedAt = ? WHERE userId = ? AND channel = 'telegram'",
        ).bind(webhookUrl, new Date().toISOString(), user.id).run()
      }
      return json({ ok: true, description: tgData.description || 'Webhook registered.' })
    }

    // ── Slack ──
    if (path === '/api/v1/channels/slack/health' && method === 'GET') {
      const userKey = await env.DB.prepare(
        "SELECT 1 AS ok FROM intg_api_keys WHERE userId = ? AND envVar = 'SLACK_BOT_TOKEN'",
      ).bind(user.id).first()
      return json({
        configured: Boolean(env.SLACK_BOT_TOKEN || userKey?.ok),
        signingSecretEnabled: Boolean(env.SLACK_SIGNING_SECRET),
      })
    }
    if (path === '/api/v1/channels/slack/workspaces' && method === 'GET') {
      return json(await listChannelLinks(env, user.id, 'slack'))
    }
    const slackWsMatch = path.match(/^\/api\/v1\/channels\/slack\/workspaces\/([^/]+)$/)
    if (slackWsMatch && method === 'DELETE') {
      await unlinkChannelItem(env, user.id, 'slack', decodeURIComponent(slackWsMatch[1]))
      return json({ ok: true })
    }
    if (path === '/api/v1/channels/slack/pairings') {
      if (method === 'GET') return json(await listChannelPairings(env, user.id, 'slack'))
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await createChannelPairing(env, h, user.id, 'slack', body.expiresInMinutes), 201)
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    // ── Discord ──
    if (path === '/api/v1/channels/discord/health' && method === 'GET') {
      return json({
        configured: Boolean(env.DISCORD_BOT_TOKEN),
        publicKeyEnabled: Boolean(env.DISCORD_PUBLIC_KEY),
      })
    }
    if (path === '/api/v1/channels/discord/servers' && method === 'GET') {
      return json(await listChannelLinks(env, user.id, 'discord'))
    }
    const discordSrvMatch = path.match(/^\/api\/v1\/channels\/discord\/servers\/([^/]+)$/)
    if (discordSrvMatch && method === 'DELETE') {
      await unlinkChannelItem(env, user.id, 'discord', decodeURIComponent(discordSrvMatch[1]))
      return json({ ok: true })
    }
    if (path === '/api/v1/channels/discord/pairings') {
      if (method === 'GET') return json(await listChannelPairings(env, user.id, 'discord'))
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        return json(await createChannelPairing(env, h, user.id, 'discord', body.expiresInMinutes), 201)
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    return json({ statusCode: 404, message: 'Channel route not found.' }, 404)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MCP SERVERS (/api/v1/mcp/servers*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isMcp) {
    if (path === '/api/v1/mcp/servers/stream' && method === 'GET') {
      const res = await env.DB.prepare(
        'SELECT * FROM intg_mcp_servers WHERE userId = ? ORDER BY createdAt DESC LIMIT 100',
      ).bind(user.id).all()
      const servers = (res.results || []).map(mcpServerView)
      const accept = (request.headers.get('accept') || '').toLowerCase()
      if (accept.includes('text/event-stream')) {
        const sseBody = `event: mcp_snapshot\ndata: ${JSON.stringify({ servers })}\n\n`
        return new Response(sseBody, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
          },
        })
      }
      return json({ servers })
    }

    if (path === '/api/v1/mcp/servers') {
      if (method === 'GET') {
        const res = await env.DB.prepare(
          'SELECT * FROM intg_mcp_servers WHERE userId = ? ORDER BY createdAt DESC LIMIT 100',
        ).bind(user.id).all()
        return json((res.results || []).map(mcpServerView))
      }

      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const name = optStr(body.name, 100)
        if (!name) return json({ statusCode: 400, message: 'Server name is required.' }, 400)
        const transport = body.transport === 'stdio' ? 'stdio' : 'http'
        const serverUrl = transport === 'http' ? optStr(body.url, 1000) : null
        const command = transport === 'stdio' ? optStr(body.command, 200) : null
        if (transport === 'http' && (!serverUrl || !isSafeExternalUrl(serverUrl))) {
          return json({ statusCode: 400, message: 'A valid public HTTP/HTTPS URL is required for HTTP MCP servers.' }, 400)
        }
        if (transport === 'stdio' && !command) {
          return json({ statusCode: 400, message: 'Command is required for stdio MCP servers.' }, 400)
        }
        const args = Array.isArray(body.args) ? body.args.slice(0, 30).map((a) => String(a).slice(0, 300)) : []
        const cwd = optStr(body.cwd, 300)
        const mergedEnv = { ...sanitizeStringMap(body.env), ...sanitizeStringMap(body.secretEnv) }
        const mergedHeaders = { ...sanitizeStringMap(body.headers), ...sanitizeStringMap(body.secretHeaders) }
        const envKeys = Object.keys(mergedEnv)
        const headerNames = Object.keys(mergedHeaders)
        const encryptedEnv = envKeys.length > 0 ? await h.encryptSecret(env, JSON.stringify(mergedEnv)) : null
        const encryptedHeaders = headerNames.length > 0 ? await h.encryptSecret(env, JSON.stringify(mergedHeaders)) : null
        const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : 1
        const id = h.genId('mcp')
        const nowIso = new Date().toISOString()

        await env.DB.prepare(
          `INSERT INTO intg_mcp_servers
           (id, userId, name, transport, enabled, command, argsJson, cwd, url, envKeysJson, encryptedEnv, headerNamesJson, encryptedHeaders, toolsJson, toolCount, lastStatus, lastError, lastUsedAt, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, 'idle', NULL, NULL, ?, ?)`,
        ).bind(
          id, user.id, name, transport, enabled, command, JSON.stringify(args), cwd, serverUrl,
          JSON.stringify(envKeys), encryptedEnv, JSON.stringify(headerNames), encryptedHeaders,
          nowIso, nowIso,
        ).run()

        const row = await env.DB.prepare('SELECT * FROM intg_mcp_servers WHERE id = ? AND userId = ?').bind(id, user.id).first()
        return json(mcpServerView(row), 201)
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    const mcpSubMatch = path.match(/^\/api\/v1\/mcp\/servers\/([^/]+)\/(connect|test|tools)$/)
    if (mcpSubMatch) {
      const serverId = decodeURIComponent(mcpSubMatch[1])
      const action = mcpSubMatch[2]
      const row = await env.DB.prepare(
        'SELECT * FROM intg_mcp_servers WHERE id = ? AND userId = ?',
      ).bind(serverId, user.id).first()
      if (!row) return json({ statusCode: 404, message: 'MCP server not found.' }, 404)

      if (action === 'tools' && method === 'GET') {
        return json(parseJson(row.toolsJson, []))
      }
      if (action === 'test' && method === 'POST') {
        const result = await probeMcpServer(env, h, row)
        return json(result)
      }
      if (action === 'connect' && method === 'POST') {
        const result = await probeMcpServer(env, h, row)
        const nowIso = new Date().toISOString()
        await env.DB.prepare(
          `UPDATE intg_mcp_servers
           SET lastStatus = ?, lastError = ?, toolsJson = ?, toolCount = ?, lastUsedAt = ?, updatedAt = ?
           WHERE id = ? AND userId = ?`,
        ).bind(
          result.ok ? 'connected' : 'error',
          result.ok ? null : (result.error || 'Connection failed'),
          JSON.stringify(result.tools || []),
          result.toolCount || 0,
          nowIso,
          nowIso,
          serverId,
          user.id,
        ).run()
        return json(result)
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    const mcpIdMatch = path.match(/^\/api\/v1\/mcp\/servers\/([^/]+)$/)
    if (mcpIdMatch) {
      const serverId = decodeURIComponent(mcpIdMatch[1])
      const row = await env.DB.prepare(
        'SELECT * FROM intg_mcp_servers WHERE id = ? AND userId = ?',
      ).bind(serverId, user.id).first()
      if (!row) return json({ statusCode: 404, message: 'MCP server not found.' }, 404)

      if (method === 'GET') return json(mcpServerView(row))

      if (method === 'PATCH' || method === 'PUT') {
        const body = await request.json().catch(() => ({}))
        const name = body.name !== undefined ? (optStr(body.name, 100) || row.name) : row.name
        const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : row.enabled
        const transport = body.transport === 'stdio' || body.transport === 'http' ? body.transport : row.transport
        const command = body.command !== undefined ? optStr(body.command, 200) : row.command
        const argsJson = Array.isArray(body.args)
          ? JSON.stringify(body.args.slice(0, 30).map((a) => String(a).slice(0, 300)))
          : row.argsJson
        let serverUrl = row.url
        if (body.url !== undefined) {
          const nextUrl = optStr(body.url, 1000)
          if (nextUrl && !isSafeExternalUrl(nextUrl)) {
            return json({ statusCode: 400, message: 'Invalid or disallowed MCP server URL.' }, 400)
          }
          serverUrl = nextUrl
        }
        let envKeysJson = row.envKeysJson
        let encryptedEnv = row.encryptedEnv
        if (body.env !== undefined || body.secretEnv !== undefined) {
          const mergedEnv = { ...sanitizeStringMap(body.env), ...sanitizeStringMap(body.secretEnv) }
          envKeysJson = JSON.stringify(Object.keys(mergedEnv))
          encryptedEnv = Object.keys(mergedEnv).length > 0 ? await h.encryptSecret(env, JSON.stringify(mergedEnv)) : null
        }
        let headerNamesJson = row.headerNamesJson
        let encryptedHeaders = row.encryptedHeaders
        if (body.headers !== undefined || body.secretHeaders !== undefined) {
          const mergedHeaders = { ...sanitizeStringMap(body.headers), ...sanitizeStringMap(body.secretHeaders) }
          headerNamesJson = JSON.stringify(Object.keys(mergedHeaders))
          encryptedHeaders = Object.keys(mergedHeaders).length > 0 ? await h.encryptSecret(env, JSON.stringify(mergedHeaders)) : null
        }
        const nowIso = new Date().toISOString()
        await env.DB.prepare(
          `UPDATE intg_mcp_servers
           SET name = ?, transport = ?, enabled = ?, command = ?, argsJson = ?, url = ?,
               envKeysJson = ?, encryptedEnv = ?, headerNamesJson = ?, encryptedHeaders = ?, updatedAt = ?
           WHERE id = ? AND userId = ?`,
        ).bind(
          name, transport, enabled, command, argsJson, serverUrl,
          envKeysJson, encryptedEnv, headerNamesJson, encryptedHeaders, nowIso,
          serverId, user.id,
        ).run()
        const updated = await env.DB.prepare('SELECT * FROM intg_mcp_servers WHERE id = ? AND userId = ?').bind(serverId, user.id).first()
        return json(mcpServerView(updated))
      }

      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM intg_mcp_servers WHERE id = ? AND userId = ?').bind(serverId, user.id).run()
        return json({ ok: true })
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    return json({ statusCode: 404, message: 'MCP route not found.' }, 404)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PLUGINS (/api/v1/plugins*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isPlugins) {
    if (path === '/api/v1/plugins' && method === 'GET') {
      const res = await env.DB.prepare(
        'SELECT pluginKey, installed, enabled FROM intg_plugins WHERE userId = ?',
      ).bind(user.id).all()
      const stateByKey = new Map((res.results || []).map((r) => [r.pluginKey, r]))
      const rows = PLUGIN_CATALOG.map((p) => {
        const st = stateByKey.get(p.key)
        return {
          key: p.key,
          name: p.name,
          description: p.description,
          category: p.category,
          ...(p.requiresEnv ? { requiresEnv: p.requiresEnv } : {}),
          installed: Boolean(st?.installed),
          enabled: Boolean(st?.enabled),
        }
      })
      return json(rows)
    }

    const pluginMatch = path.match(/^\/api\/v1\/plugins\/([^/]+)\/(enable|disable|toggle|install)$/)
    if (pluginMatch && method === 'POST') {
      const key = decodeURIComponent(pluginMatch[1])
      const action = pluginMatch[2]
      const meta = PLUGIN_BY_KEY.get(key)
      if (!meta) return json({ statusCode: 404, message: `Unknown plugin "${key}".` }, 404)

      const existing = await env.DB.prepare(
        'SELECT installed, enabled FROM intg_plugins WHERE userId = ? AND pluginKey = ?',
      ).bind(user.id, key).first()

      let nextEnabled = true
      if (action === 'disable') nextEnabled = false
      else if (action === 'toggle') nextEnabled = !Boolean(existing?.enabled)
      const nowIso = new Date().toISOString()

      await env.DB.prepare(
        `INSERT OR REPLACE INTO intg_plugins (userId, pluginKey, installed, enabled, updatedAt)
         VALUES (?, ?, 1, ?, ?)`,
      ).bind(user.id, key, nextEnabled ? 1 : 0, nowIso).run()

      return json({
        key: meta.key,
        name: meta.name,
        description: meta.description,
        category: meta.category,
        ...(meta.requiresEnv ? { requiresEnv: meta.requiresEnv } : {}),
        installed: true,
        enabled: nextEnabled,
      })
    }

    return json({ statusCode: 404, message: 'Plugin route not found.' }, 404)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. API KEYS HEALTH (/api/v1/apikeys/*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isApiKeys) {
    if (path === '/api/v1/apikeys/health' && method === 'GET') {
      const [llmRes, customRes, tgRow] = await Promise.all([
        env.DB.prepare('SELECT provider, apiKey, isActive, updatedAt FROM llm_keys WHERE userId = ?').bind(user.id).all(),
        env.DB.prepare('SELECT envVar, encryptedValue, updatedAt FROM intg_api_keys WHERE userId = ?').bind(user.id).all(),
        env.DB.prepare("SELECT encryptedToken, updatedAt FROM intg_channel_config WHERE userId = ? AND channel = 'telegram'").bind(user.id).first(),
      ])

      const llmByProvider = new Map((llmRes.results || []).map((r) => [String(r.provider || '').toLowerCase(), r]))
      const customByVar = new Map((customRes.results || []).map((r) => [r.envVar, r]))
      const checkedAt = new Date().toISOString()

      const results = []
      for (const spec of TRACKED_API_KEYS) {
        let plain = null
        let updatedAt = checkedAt

        if (spec.llmProvider) {
          const llmRow = llmByProvider.get(spec.llmProvider)
          if (llmRow?.apiKey && llmRow.isActive !== 0) {
            plain = await h.decryptSecret(env, llmRow.apiKey).catch(() => null)
            updatedAt = llmRow.updatedAt || checkedAt
          }
        } else if (spec.envVar === 'TELEGRAM_BOT_TOKEN' && tgRow?.encryptedToken) {
          plain = await h.decryptSecret(env, tgRow.encryptedToken).catch(() => null)
          updatedAt = tgRow.updatedAt || checkedAt
        } else {
          const cRow = customByVar.get(spec.envVar)
          if (cRow?.encryptedValue) {
            plain = await h.decryptSecret(env, cRow.encryptedValue).catch(() => null)
            updatedAt = cRow.updatedAt || checkedAt
          }
        }

        const configured = Boolean(plain && plain.length > 4)
        results.push({
          name: spec.name,
          envVar: spec.envVar,
          configured,
          masked: configured ? maskKey(plain) : '—',
          lastChecked: updatedAt,
          status: configured ? 'healthy' : 'missing',
        })
      }
      return json(results)
    }

    if (path === '/api/v1/apikeys/rotate' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const cleanVar = String(body.envVar || '').trim()
      const spec = TRACKED_KEY_MAP.get(cleanVar)
      if (!spec) {
        return json({ success: false, message: `Environment variable "${cleanVar}" is not in the rotatable API key allowlist.` }, 400)
      }
      const cleanVal = String(body.newValue || '').trim()
      if (!cleanVal || cleanVal.length > 512 || /[\r\n\0]/.test(cleanVal)) {
        return json({ success: false, message: 'Invalid API key value.' }, 400)
      }
      const encrypted = await h.encryptSecret(env, cleanVal)
      const nowIso = new Date().toISOString()

      if (spec.llmProvider) {
        const existing = await env.DB.prepare(
          'SELECT baseUrl, createdAt FROM llm_keys WHERE userId = ? AND provider = ?',
        ).bind(user.id, spec.llmProvider).first()
        await env.DB.prepare(
          `INSERT OR REPLACE INTO llm_keys (userId, provider, apiKey, baseUrl, isActive, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
        ).bind(user.id, spec.llmProvider, encrypted, existing?.baseUrl ?? null, existing?.createdAt ?? nowIso, nowIso).run()
      } else if (spec.envVar === 'TELEGRAM_BOT_TOKEN') {
        const existing = await env.DB.prepare(
          "SELECT botUsername, webhookUrl, metadataJson FROM intg_channel_config WHERE userId = ? AND channel = 'telegram'",
        ).bind(user.id).first()
        await env.DB.prepare(
          `INSERT OR REPLACE INTO intg_channel_config (userId, channel, encryptedToken, botUsername, webhookUrl, metadataJson, updatedAt)
           VALUES (?, 'telegram', ?, ?, ?, ?, ?)`,
        ).bind(user.id, encrypted, existing?.botUsername ?? null, existing?.webhookUrl ?? null, existing?.metadataJson ?? null, nowIso).run()
      } else {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO intg_api_keys (userId, envVar, encryptedValue, updatedAt)
           VALUES (?, ?, ?, ?)`,
        ).bind(user.id, cleanVar, encrypted, nowIso).run()
      }

      return json({ success: true, message: `${cleanVar} rotated and encrypted in your workspace.` })
    }

    const delKeyMatch = path.match(/^\/api\/v1\/apikeys\/([^/]+)$/)
    if (delKeyMatch && method === 'DELETE') {
      const cleanVar = decodeURIComponent(delKeyMatch[1]).trim()
      const spec = TRACKED_KEY_MAP.get(cleanVar)
      if (!spec) return json({ statusCode: 404, message: 'Unknown API key.' }, 404)
      if (spec.llmProvider) {
        await env.DB.prepare('DELETE FROM llm_keys WHERE userId = ? AND provider = ?').bind(user.id, spec.llmProvider).run()
      } else if (spec.envVar === 'TELEGRAM_BOT_TOKEN') {
        await env.DB.prepare("DELETE FROM intg_channel_config WHERE userId = ? AND channel = 'telegram'").bind(user.id).run()
      } else {
        await env.DB.prepare('DELETE FROM intg_api_keys WHERE userId = ? AND envVar = ?').bind(user.id, cleanVar).run()
      }
      return json({ success: true })
    }

    return json({ statusCode: 404, message: 'API keys route not found.' }, 404)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. A/B TESTS (/api/v1/ab-tests*)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isAbTests) {
    if (path === '/api/v1/ab-tests') {
      if (method === 'GET') {
        const res = await env.DB.prepare(
          'SELECT * FROM intg_ab_tests WHERE userId = ? ORDER BY createdAt DESC LIMIT 100',
        ).bind(user.id).all()
        return json((res.results || []).map(abTestDto))
      }

      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const name = optStr(body.name, 120)
        if (!name) return json({ statusCode: 400, message: 'Test name is required.' }, 400)
        const description = optStr(body.description, 500)
        const rawVariants = Array.isArray(body.variants) ? body.variants.slice(0, 10) : []
        if (rawVariants.length === 0) {
          return json({ statusCode: 400, message: 'At least one variant is required.' }, 400)
        }
        const variants = rawVariants.map((v, idx) => ({
          id: optStr(v?.id, 64) || h.genId('var'),
          name: optStr(v?.name, 80) || `Variant ${idx + 1}`,
          systemPrompt: String(v?.systemPrompt ?? '').slice(0, 8000),
          ...(optStr(v?.model, 100) ? { model: optStr(v.model, 100) } : {}),
          ...(typeof v?.temperature === 'number' && Number.isFinite(v.temperature) ? { temperature: v.temperature } : {}),
        }))
        const results = {}
        for (const v of variants) {
          results[v.id] = { runs: 0, avgLatencyMs: 0, avgTokens: 0, satisfactionScore: 0 }
        }
        const id = h.genId('abt')
        const nowIso = new Date().toISOString()
        await env.DB.prepare(
          `INSERT INTO intg_ab_tests (id, userId, name, description, variantsJson, resultsJson, status, winnerVariantId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 'running', NULL, ?, ?)`,
        ).bind(id, user.id, name, description, JSON.stringify(variants), JSON.stringify(results), nowIso, nowIso).run()

        const row = await env.DB.prepare('SELECT * FROM intg_ab_tests WHERE id = ? AND userId = ?').bind(id, user.id).first()
        return json(abTestDto(row), 201)
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    const abSubMatch = path.match(/^\/api\/v1\/ab-tests\/([^/]+)\/(pick|record|run|winner)$/)
    if (abSubMatch && method === 'POST') {
      const testId = decodeURIComponent(abSubMatch[1])
      const action = abSubMatch[2]
      const row = await env.DB.prepare(
        'SELECT * FROM intg_ab_tests WHERE id = ? AND userId = ?',
      ).bind(testId, user.id).first()
      if (!row) return json({ statusCode: 404, message: 'A/B test not found.' }, 404)
      const test = abTestDto(row)

      if (action === 'pick') {
        if (test.variants.length === 0) return json({ error: 'No variant available' }, 400)
        const sorted = [...test.variants].sort(
          (a, b) => (test.results[a.id]?.runs ?? 0) - (test.results[b.id]?.runs ?? 0),
        )
        return json(sorted[0])
      }

      if (action === 'record' || action === 'run') {
        const body = await request.json().catch(() => ({}))
        const variantId = String(body.variantId || '').trim()
        const current = test.results[variantId]
        if (!current) return json({ statusCode: 400, message: 'Unknown variantId.' }, 400)
        const latencyMs = Math.max(0, Number(body.latencyMs) || 0)
        const tokens = Math.max(0, Number(body.tokens) || 0)
        const runs = current.runs + 1
        const next = {
          runs,
          avgLatencyMs: (current.avgLatencyMs * current.runs + latencyMs) / runs,
          avgTokens: (current.avgTokens * current.runs + tokens) / runs,
          satisfactionScore:
            typeof body.satisfaction === 'number' && Number.isFinite(body.satisfaction)
              ? (current.satisfactionScore * current.runs + body.satisfaction) / runs
              : current.satisfactionScore,
        }
        const nextResults = { ...test.results, [variantId]: next }
        const nowIso = new Date().toISOString()
        await env.DB.prepare(
          'UPDATE intg_ab_tests SET resultsJson = ?, updatedAt = ? WHERE id = ? AND userId = ?',
        ).bind(JSON.stringify(nextResults), nowIso, testId, user.id).run()
        return json({ success: true })
      }

      if (action === 'winner') {
        const body = await request.json().catch(() => ({}))
        const variantId = String(body.variantId || '').trim()
        if (!test.variants.some((v) => v.id === variantId)) {
          return json({ statusCode: 400, message: 'Unknown variantId.' }, 400)
        }
        const nowIso = new Date().toISOString()
        await env.DB.prepare(
          "UPDATE intg_ab_tests SET winnerVariantId = ?, status = 'completed', updatedAt = ? WHERE id = ? AND userId = ?",
        ).bind(variantId, nowIso, testId, user.id).run()
        const updated = await env.DB.prepare('SELECT * FROM intg_ab_tests WHERE id = ? AND userId = ?').bind(testId, user.id).first()
        return json(abTestDto(updated))
      }
    }

    const abIdMatch = path.match(/^\/api\/v1\/ab-tests\/([^/]+)$/)
    if (abIdMatch) {
      const testId = decodeURIComponent(abIdMatch[1])
      const row = await env.DB.prepare(
        'SELECT * FROM intg_ab_tests WHERE id = ? AND userId = ?',
      ).bind(testId, user.id).first()
      if (!row) return json({ statusCode: 404, message: 'A/B test not found.' }, 404)

      if (method === 'GET') return json(abTestDto(row))

      if (method === 'PATCH' || method === 'PUT') {
        const body = await request.json().catch(() => ({}))
        const status = ['running', 'paused', 'completed'].includes(body.status) ? body.status : row.status
        const name = body.name !== undefined ? (optStr(body.name, 120) || row.name) : row.name
        const description = body.description !== undefined ? optStr(body.description, 500) : row.description
        const nowIso = new Date().toISOString()
        await env.DB.prepare(
          'UPDATE intg_ab_tests SET name = ?, description = ?, status = ?, updatedAt = ? WHERE id = ? AND userId = ?',
        ).bind(name, description, status, nowIso, testId, user.id).run()
        const updated = await env.DB.prepare('SELECT * FROM intg_ab_tests WHERE id = ? AND userId = ?').bind(testId, user.id).first()
        return json(abTestDto(updated))
      }

      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM intg_ab_tests WHERE id = ? AND userId = ?').bind(testId, user.id).run()
        return json({ success: true })
      }
      return json({ statusCode: 405, message: 'Method not allowed' }, 405)
    }

    return json({ statusCode: 404, message: 'A/B test route not found.' }, 404)
  }

  return null
}
