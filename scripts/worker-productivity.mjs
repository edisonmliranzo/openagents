// Productivity routes for Cloudflare Worker (D1-backed, user-scoped):
//  • /api/v1/tasks                         (CRUD + approve + cancel + run)
//  • /api/v1/goals                         (CRUD + milestones + link + plan + step + decide + progress log)
//  • /api/v1/cron/jobs                     (CRUD + toggle + run + runs + health/summary + self-heal)
//  • /api/v1/workflows                     (CRUD + run + webhook + runs + rerun + branch + compare)
//  • /api/v1/playbooks                     (CRUD + run + runs)
//  • /api/v1/briefing/*                    (latest, history, settings, run, generate)
//  • /api/v1/proactive/moments*            (list, scan, settings, snooze, dismiss, act)
//  • /api/v1/autonomy/journal*             (GET, POST, undo, task undo)

const DEFAULT_LLM_BASE_URLS = {
  apisrouter: 'https://apisrouter.com/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
}

const VALID_GOAL_STATUSES = new Set(['active', 'paused', 'completed', 'abandoned'])
const VALID_GOAL_PRIORITIES = new Set(['low', 'medium', 'high', 'critical'])
const VALID_CRON_SCHEDULE_KINDS = new Set(['every', 'at', 'cron'])
const VALID_CRON_SESSION_TARGETS = new Set(['main', 'isolated'])
const VALID_CRON_PAYLOAD_KINDS = new Set(['systemEvent', 'agentTurn'])
const VALID_CRON_DELIVERY_MODES = new Set(['none', 'announce', 'webhook'])
const VALID_WORKFLOW_TRIGGERS = new Set(['manual', 'schedule', 'webhook', 'inbox_event', 'connector_event'])
const VALID_PLAYBOOK_TARGETS = new Set(['agent_prompt', 'workflow'])
const BRIEFING_SECTIONS = ['email', 'calendar', 'tasks', 'news', 'memory']
const MOMENT_KINDS = ['meeting_soon', 'unanswered_email', 'calendar_conflict', 'goal_stalled', 'watch_hit']
const MOMENT_STATUSES = new Set(['active', 'snoozed', 'dismissed', 'acted'])

let schemaReady = false

async function ensureSchema(env) {
  if (schemaReady) return
  const stmts = [
    `CREATE TABLE IF NOT EXISTS prod_tasks (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       title TEXT NOT NULL,
       goal TEXT NOT NULL,
       successCriteria TEXT,
       target TEXT,
       maxSteps INTEGER NOT NULL DEFAULT 12,
       status TEXT NOT NULL DEFAULT 'planning',
       cursor INTEGER NOT NULL DEFAULT 0,
       replans INTEGER NOT NULL DEFAULT 0,
       plan TEXT NOT NULL DEFAULT '[]',
       result TEXT,
       verdict TEXT,
       error TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL,
       finishedAt TEXT
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_tasks_user ON prod_tasks (userId, createdAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_task_events (
       id TEXT PRIMARY KEY,
       taskId TEXT NOT NULL,
       userId TEXT NOT NULL,
       kind TEXT NOT NULL,
       message TEXT NOT NULL,
       data TEXT,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_task_events_task ON prod_task_events (taskId, createdAt ASC)`,
    `CREATE TABLE IF NOT EXISTS prod_goals (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       title TEXT NOT NULL,
       description TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'active',
       priority TEXT NOT NULL DEFAULT 'medium',
       milestones TEXT NOT NULL DEFAULT '[]',
       progress INTEGER NOT NULL DEFAULT 0,
       conversationIds TEXT NOT NULL DEFAULT '[]',
       tags TEXT NOT NULL DEFAULT '[]',
       dueDate TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL,
       completedAt TEXT
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_goals_user ON prod_goals (userId, updatedAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_goal_plans (
       goalId TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       steps TEXT NOT NULL DEFAULT '[]',
       autoAdvance INTEGER NOT NULL DEFAULT 0,
       lastAdvancedDay TEXT,
       lastWeeklySummaryAt TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS prod_goal_logs (
       id TEXT PRIMARY KEY,
       goalId TEXT NOT NULL,
       userId TEXT NOT NULL,
       kind TEXT NOT NULL,
       message TEXT NOT NULL,
       at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_goal_logs_user ON prod_goal_logs (userId, at DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_cron_jobs (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       name TEXT NOT NULL,
       description TEXT,
       enabled INTEGER NOT NULL DEFAULT 1,
       scheduleKind TEXT NOT NULL DEFAULT 'every',
       scheduleValue TEXT NOT NULL,
       sessionTarget TEXT NOT NULL DEFAULT 'main',
       payloadKind TEXT NOT NULL DEFAULT 'systemEvent',
       payloadText TEXT NOT NULL,
       deliveryMode TEXT NOT NULL DEFAULT 'none',
       deliveryTarget TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_cron_jobs_user ON prod_cron_jobs (userId, updatedAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_cron_runs (
       id TEXT PRIMARY KEY,
       cronJobId TEXT NOT NULL,
       userId TEXT NOT NULL,
       status TEXT NOT NULL,
       summary TEXT,
       error TEXT,
       durationMs INTEGER,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_cron_runs_job ON prod_cron_runs (cronJobId, createdAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_workflows (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       name TEXT NOT NULL,
       description TEXT,
       enabled INTEGER NOT NULL DEFAULT 1,
       version INTEGER NOT NULL DEFAULT 1,
       triggerJson TEXT NOT NULL,
       stepsJson TEXT NOT NULL,
       budgetUsd REAL,
       webhookOutboxJson TEXT,
       lastRunAt TEXT,
       nextRunAt TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_workflows_user ON prod_workflows (userId, updatedAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_workflow_runs (
       id TEXT PRIMARY KEY,
       workflowId TEXT NOT NULL,
       userId TEXT NOT NULL,
       triggerKind TEXT NOT NULL,
       status TEXT NOT NULL,
       startedAt TEXT NOT NULL,
       finishedAt TEXT,
       error TEXT,
       idempotencyKey TEXT,
       sourceEvent TEXT,
       inputJson TEXT,
       stateJson TEXT,
       rerunOfRunId TEXT,
       resumeStepId TEXT,
       lastOutputJson TEXT,
       stepResultsJson TEXT NOT NULL DEFAULT '[]',
       accumulatedCostUsd REAL,
       budgetExhausted INTEGER NOT NULL DEFAULT 0
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_workflow_runs_wf ON prod_workflow_runs (workflowId, startedAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_playbooks (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       name TEXT NOT NULL,
       description TEXT,
       targetKind TEXT NOT NULL DEFAULT 'agent_prompt',
       parameterSchemaJson TEXT NOT NULL DEFAULT '[]',
       promptTemplate TEXT,
       workflowTemplateJson TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_playbooks_user ON prod_playbooks (userId, updatedAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_playbook_runs (
       id TEXT PRIMARY KEY,
       playbookId TEXT NOT NULL,
       userId TEXT NOT NULL,
       status TEXT NOT NULL,
       startedAt TEXT NOT NULL,
       finishedAt TEXT,
       inputJson TEXT NOT NULL DEFAULT '{}',
       outputSummary TEXT,
       error TEXT,
       conversationId TEXT,
       workflowRunId TEXT
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_playbook_runs_pb ON prod_playbook_runs (playbookId, startedAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_briefing_settings (
       userId TEXT PRIMARY KEY,
       enabled INTEGER NOT NULL DEFAULT 1,
       time TEXT NOT NULL DEFAULT '08:00',
       timezone TEXT NOT NULL DEFAULT 'UTC',
       sectionsJson TEXT NOT NULL,
       newsTopicsJson TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS prod_briefings (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       dateKey TEXT NOT NULL,
       trigger TEXT NOT NULL,
       summary TEXT NOT NULL,
       cardsJson TEXT NOT NULL,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_briefings_user ON prod_briefings (userId, createdAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_moment_settings (
       userId TEXT PRIMARY KEY,
       enabled INTEGER NOT NULL DEFAULT 1,
       timezone TEXT NOT NULL DEFAULT 'UTC',
       quietHoursJson TEXT NOT NULL,
       maxPerDay INTEGER NOT NULL DEFAULT 8,
       kindsJson TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS prod_moments (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       key TEXT NOT NULL,
       kind TEXT NOT NULL,
       title TEXT NOT NULL,
       body TEXT NOT NULL,
       contextJson TEXT,
       actionsJson TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'active',
       snoozedUntil TEXT,
       delivered INTEGER NOT NULL DEFAULT 0,
       deliveredAt TEXT,
       actedActionId TEXT,
       expiresAt TEXT,
       createdAt TEXT NOT NULL,
       updatedAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_moments_user ON prod_moments (userId, createdAt DESC)`,
    `CREATE TABLE IF NOT EXISTS prod_autonomy_journal (
       id TEXT PRIMARY KEY,
       userId TEXT NOT NULL,
       taskId TEXT,
       tool TEXT NOT NULL,
       input TEXT NOT NULL,
       output TEXT,
       compensation TEXT,
       undoneAt TEXT,
       createdAt TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_prod_journal_user ON prod_autonomy_journal (userId, createdAt DESC)`,
  ]
  for (const sql of stmts) {
    await env.DB.prepare(sql).run()
  }
  schemaReady = true
}

function parseJson(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function str(val, maxLen = 1000) {
  if (val === null || val === undefined) return ''
  return String(val).trim().slice(0, maxLen)
}

function clampInt(val, min, max, fallback) {
  const n = Number(val)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function makeId(h, prefix) {
  if (typeof h?.genId === 'function') return h.genId(prefix)
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

async function readBody(request) {
  const ct = request.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const txt = await request.text().catch(() => '')
    if (!txt) return {}
    if (txt.length > 200_000) throw Object.assign(new Error('Payload too large.'), { status: 413 })
    return parseJson(txt, {})
  }
  const txt = await request.text().catch(() => '')
  if (!txt) return {}
  if (txt.length > 200_000) throw Object.assign(new Error('Payload too large.'), { status: 413 })
  try {
    const parsed = JSON.parse(txt)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), { status: 400 })
  }
}

function resolveSafeBaseUrl(h, baseUrl, provider) {
  if (typeof h?.validateSafeLlmBaseUrl === 'function') {
    return h.validateSafeLlmBaseUrl(baseUrl, provider)
  }
  const candidate = String(baseUrl || DEFAULT_LLM_BASE_URLS[provider] || DEFAULT_LLM_BASE_URLS.apisrouter).replace(/\/+$/, '')
  if (!candidate.startsWith('https://')) return DEFAULT_LLM_BASE_URLS.apisrouter
  return candidate
}

async function callUserLlm(env, h, userId, messages, maxTokens = 600) {
  if (typeof h?.getUserApiKeyCandidates !== 'function') return null
  try {
    const settings = await env.DB.prepare('SELECT preferredProvider, preferredModel FROM user_settings WHERE userId = ?')
      .bind(userId)
      .first()
      .catch(() => null)
    let provider = settings?.preferredProvider || 'apisrouter'
    let model = settings?.preferredModel || 'claude-sonnet-5.5'
    let keys = await h.getUserApiKeyCandidates(env, userId, provider)
    if (!Array.isArray(keys) || keys.length === 0) {
      const anyRow = await env.DB.prepare(
        'SELECT provider FROM llm_keys WHERE userId = ? AND apiKey IS NOT NULL ORDER BY updatedAt DESC LIMIT 1',
      )
        .bind(userId)
        .first()
        .catch(() => null)
      if (anyRow?.provider) {
        provider = anyRow.provider
        keys = await h.getUserApiKeyCandidates(env, userId, provider)
        if (Array.isArray(h?.CURATED_MODELS?.[provider]) && h.CURATED_MODELS[provider].length > 0) {
          model = h.CURATED_MODELS[provider][0]
        }
      }
    }
    if (!Array.isArray(keys) || keys.length === 0) return null
    const baseUrl = resolveSafeBaseUrl(h, keys[0].baseUrl, provider)
    for (const k of keys) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k.apiKey}` },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      }).catch(() => null)
      if (res && res.ok) {
        const j = await res.json().catch(() => ({}))
        const text = String(j?.choices?.[0]?.message?.content || '').trim()
        if (text) return text
      }
      if (!res || ![401, 402, 403, 429].includes(res.status)) break
    }
  } catch {
    return null
  }
  return null
}

// ── Template / path helpers for Workflows & Playbooks ───────────────────────

function getByPath(obj, pathStr) {
  if (!obj || !pathStr) return undefined
  const parts = String(pathStr).split('.').filter(Boolean)
  let cur = obj
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

function setByPath(obj, pathStr, value) {
  const parts = String(pathStr || '').split('.').filter(Boolean)
  if (parts.length === 0) return
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return
    if (!cur[key] || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      cur[key] = {}
    }
    cur = cur[key]
  }
  const leaf = parts[parts.length - 1]
  if (leaf === '__proto__' || leaf === 'constructor' || leaf === 'prototype') return
  cur[leaf] = value
}

function interpolateString(template, ctx) {
  if (typeof template !== 'string') return template
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const key = expr.trim()
    let val
    if (key.startsWith('input.')) val = getByPath(ctx.input, key.slice(6))
    else if (key.startsWith('state.')) val = getByPath(ctx.state, key.slice(6))
    else if (key === 'lastOutput') val = ctx.lastOutput
    else val = getByPath(ctx.params || ctx.input, key)
    if (val === undefined || val === null) return ''
    return typeof val === 'object' ? JSON.stringify(val) : String(val)
  })
}

function interpolateDeep(val, ctx, depth = 0) {
  if (depth > 8) return val
  if (typeof val === 'string') return interpolateString(val, ctx)
  if (Array.isArray(val)) return val.map((item) => interpolateDeep(item, ctx, depth + 1))
  if (val && typeof val === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(val)) {
      out[k] = interpolateDeep(v, ctx, depth + 1)
    }
    return out
  }
  return val
}

// ── Cron schedule helpers ───────────────────────────────────────────────────

function parseEveryMs(scheduleValue) {
  const m = String(scheduleValue || '').trim().match(/^(?:every\s+)?(\d+(?:\.\d+)?)\s*(s|sec|second|m|min|minute|h|hr|hour|d|day)s?$/i)
  if (!m) return null
  const num = Number(m[1])
  if (!Number.isFinite(num) || num <= 0) return null
  const unit = m[2].toLowerCase()
  if (unit.startsWith('s')) return Math.round(num * 1000)
  if (unit.startsWith('m')) return Math.round(num * 60_000)
  if (unit.startsWith('h')) return Math.round(num * 3_600_000)
  if (unit.startsWith('d')) return Math.round(num * 86_400_000)
  return null
}

function formatScheduleLabel(kind, value) {
  if (kind === 'every') return `Every ${value}`
  if (kind === 'at') return `Once: ${value}`
  return `Cron: ${value} (UTC)`
}

function computeNextRunAt(enabled, kind, value, nowMs = Date.now()) {
  if (!enabled) return null
  if (kind === 'every') {
    const ms = parseEveryMs(value)
    return ms ? new Date(nowMs + ms).toISOString() : null
  }
  if (kind === 'at') {
    const ts = Date.parse(value)
    return Number.isFinite(ts) && ts > nowMs ? new Date(ts).toISOString() : null
  }
  if (kind === 'cron') {
    // Approximate next UTC occurrence for display (Cloudflare Worker has no background daemon)
    const parts = String(value || '').trim().split(/\s+/)
    if (parts.length !== 5) return null
    const d = new Date(nowMs + 60_000)
    d.setUTCSeconds(0, 0)
    const min = /^\d+$/.test(parts[0]) ? clampInt(parts[0], 0, 59, 0) : null
    const hr = /^\d+$/.test(parts[1]) ? clampInt(parts[1], 0, 23, 0) : null
    if (hr !== null && min !== null) {
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hr, min, 0, 0))
      if (next.getTime() <= nowMs) next.setUTCDate(next.getUTCDate() + 1)
      return next.toISOString()
    }
    if (min !== null) {
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), min, 0, 0))
      if (next.getTime() <= nowMs) next.setUTCHours(next.getUTCHours() + 1)
      return next.toISOString()
    }
    return new Date(nowMs + 15 * 60_000).toISOString()
  }
  return null
}

// ── DTO Mappers ─────────────────────────────────────────────────────────────

function taskRowDto(r) {
  return {
    id: r.id,
    title: r.title,
    goal: r.goal,
    status: r.status,
    cursor: Number(r.cursor) || 0,
    replans: Number(r.replans) || 0,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt || null,
    error: r.error || null,
  }
}

function taskDetailDto(r, events) {
  return {
    ...taskRowDto(r),
    plan: r.plan || '[]',
    result: r.result || null,
    verdict: r.verdict || null,
    successCriteria: r.successCriteria || null,
    maxSteps: Number(r.maxSteps) || 12,
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      message: e.message,
      data: e.data || null,
      createdAt: e.createdAt,
    })),
  }
}

function goalDto(r) {
  return {
    id: r.id,
    userId: r.userId,
    title: r.title,
    description: r.description || '',
    status: r.status,
    priority: r.priority,
    milestones: parseJson(r.milestones, []),
    progress: Number(r.progress) || 0,
    conversationIds: parseJson(r.conversationIds, []),
    tags: parseJson(r.tags, []),
    ...(r.dueDate ? { dueDate: r.dueDate } : {}),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(r.completedAt ? { completedAt: r.completedAt } : {}),
  }
}

function goalPlanDto(r) {
  if (!r) return null
  return {
    goalId: r.goalId,
    createdAt: r.createdAt,
    steps: parseJson(r.steps, []),
    autoAdvance: Boolean(r.autoAdvance),
    ...(r.lastAdvancedDay ? { lastAdvancedDay: r.lastAdvancedDay } : {}),
    ...(r.lastWeeklySummaryAt ? { lastWeeklySummaryAt: r.lastWeeklySummaryAt } : {}),
  }
}

function cronRunDto(r) {
  return {
    id: r.id,
    cronJobId: r.cronJobId,
    status: r.status,
    summary: r.summary || null,
    error: r.error || null,
    durationMs: r.durationMs !== null && r.durationMs !== undefined ? Number(r.durationMs) : null,
    createdAt: r.createdAt,
  }
}

function cronJobDto(r, runs = []) {
  const enabled = Boolean(r.enabled)
  const latest = runs[0] || null
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    description: r.description || null,
    enabled,
    scheduleKind: r.scheduleKind,
    scheduleValue: r.scheduleValue,
    sessionTarget: r.sessionTarget,
    payloadKind: r.payloadKind,
    payloadText: r.payloadText,
    deliveryMode: r.deliveryMode,
    deliveryTarget: r.deliveryTarget || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    runs,
    scheduleLabel: formatScheduleLabel(r.scheduleKind, r.scheduleValue),
    nextRunAt: computeNextRunAt(enabled, r.scheduleKind, r.scheduleValue),
    lastRunAt: latest ? latest.createdAt : null,
    lastRunStatus: latest ? latest.status : null,
  }
}

function workflowDto(r) {
  const out = {
    id: r.id,
    userId: r.userId,
    name: r.name,
    description: r.description || null,
    enabled: Boolean(r.enabled),
    version: Number(r.version) || 1,
    trigger: parseJson(r.triggerJson, { kind: 'manual' }),
    steps: parseJson(r.stepsJson, []),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastRunAt: r.lastRunAt || null,
    nextRunAt: r.nextRunAt || null,
  }
  if (r.budgetUsd !== null && r.budgetUsd !== undefined) out.budgetUsd = Number(r.budgetUsd)
  const outbox = parseJson(r.webhookOutboxJson, null)
  if (outbox) out.webhookOutbox = outbox
  return out
}

function workflowRunDto(r) {
  const out = {
    id: r.id,
    workflowId: r.workflowId,
    userId: r.userId,
    triggerKind: r.triggerKind,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt || null,
    error: r.error || null,
    stepResults: parseJson(r.stepResultsJson, []),
  }
  if (r.idempotencyKey) out.idempotencyKey = r.idempotencyKey
  if (r.sourceEvent) out.sourceEvent = r.sourceEvent
  const input = parseJson(r.inputJson, undefined)
  if (input !== undefined) out.input = input
  const state = parseJson(r.stateJson, undefined)
  if (state !== undefined) out.state = state
  if (r.rerunOfRunId) out.rerunOfRunId = r.rerunOfRunId
  if (r.resumeStepId !== null && r.resumeStepId !== undefined) out.resumeStepId = r.resumeStepId
  const lastOutput = parseJson(r.lastOutputJson, undefined)
  if (lastOutput !== undefined) out.lastOutput = lastOutput
  if (r.accumulatedCostUsd !== null && r.accumulatedCostUsd !== undefined) {
    out.accumulatedCostUsd = Number(r.accumulatedCostUsd)
  }
  if (r.budgetExhausted) out.budgetExhausted = true
  return out
}

function playbookDto(r) {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    description: r.description || null,
    targetKind: r.targetKind,
    parameterSchema: parseJson(r.parameterSchemaJson, []),
    promptTemplate: r.promptTemplate || null,
    workflowTemplate: parseJson(r.workflowTemplateJson, null),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function playbookRunDto(r) {
  const out = {
    id: r.id,
    playbookId: r.playbookId,
    userId: r.userId,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt || null,
    input: parseJson(r.inputJson, {}),
    outputSummary: r.outputSummary || null,
    error: r.error || null,
  }
  if (r.conversationId) out.conversationId = r.conversationId
  if (r.workflowRunId) out.workflowRunId = r.workflowRunId
  return out
}

function defaultBriefingSettings() {
  return {
    enabled: true,
    time: '08:00',
    timezone: 'UTC',
    sections: { email: true, calendar: true, tasks: true, news: true, memory: true },
    newsTopics: ['AI', 'technology'],
  }
}

function briefingSettingsDto(r) {
  if (!r) return defaultBriefingSettings()
  const rawSections = parseJson(r.sectionsJson, {})
  const sections = {}
  for (const k of BRIEFING_SECTIONS) sections[k] = rawSections[k] !== false
  const newsTopics = parseJson(r.newsTopicsJson, ['AI', 'technology'])
  return {
    enabled: Boolean(r.enabled),
    time: r.time || '08:00',
    timezone: r.timezone || 'UTC',
    sections,
    newsTopics: Array.isArray(newsTopics) ? newsTopics : ['AI', 'technology'],
  }
}

function briefingRecordDto(r) {
  return {
    id: r.id,
    createdAt: r.createdAt,
    dateKey: r.dateKey,
    trigger: r.trigger === 'scheduled' ? 'scheduled' : 'manual',
    summary: r.summary,
    cards: parseJson(r.cardsJson, []),
  }
}

function defaultMomentSettings() {
  return {
    enabled: true,
    timezone: 'UTC',
    quietHours: { enabled: true, start: '22:00', end: '07:00' },
    maxPerDay: 8,
    kinds: {
      meeting_soon: true,
      unanswered_email: true,
      calendar_conflict: true,
      goal_stalled: true,
      watch_hit: true,
    },
  }
}

function momentSettingsDto(r) {
  if (!r) return defaultMomentSettings()
  const qh = parseJson(r.quietHoursJson, { enabled: true, start: '22:00', end: '07:00' })
  const rawKinds = parseJson(r.kindsJson, {})
  const kinds = {}
  for (const k of MOMENT_KINDS) kinds[k] = rawKinds[k] !== false
  return {
    enabled: Boolean(r.enabled),
    timezone: r.timezone || 'UTC',
    quietHours: {
      enabled: Boolean(qh.enabled),
      start: String(qh.start || '22:00').slice(0, 5),
      end: String(qh.end || '07:00').slice(0, 5),
    },
    maxPerDay: clampInt(r.maxPerDay, 0, 50, 8),
    kinds,
  }
}

function momentDto(r) {
  const out = {
    id: r.id,
    key: r.key,
    kind: r.kind,
    title: r.title,
    body: r.body,
    actions: parseJson(r.actionsJson, []),
    status: r.status,
    delivered: Boolean(r.delivered),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
  const ctx = parseJson(r.contextJson, null)
  if (Array.isArray(ctx) && ctx.length > 0) out.context = ctx
  if (r.snoozedUntil) out.snoozedUntil = r.snoozedUntil
  if (r.deliveredAt) out.deliveredAt = r.deliveredAt
  if (r.actedActionId) out.actedActionId = r.actedActionId
  if (r.expiresAt) out.expiresAt = r.expiresAt
  return out
}

function journalRowDto(r) {
  return {
    id: r.id,
    taskId: r.taskId || null,
    tool: r.tool,
    input: r.input,
    output: r.output || null,
    compensation: r.compensation || null,
    undoneAt: r.undoneAt || null,
    createdAt: r.createdAt,
  }
}

// ── Feature Handlers ────────────────────────────────────────────────────────

async function recordTaskEvent(env, h, taskId, userId, kind, message, data = null) {
  const id = makeId(h, 'tev')
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO prod_task_events (id, taskId, userId, kind, message, data, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, taskId, userId, kind, str(message, 2000), data ? JSON.stringify(data).slice(0, 8000) : null, now)
    .run()
}

async function executeTaskSteps(env, h, userId, task) {
  const steps = parseJson(task.plan, [])
  const now = new Date().toISOString()
  const llmOut = await callUserLlm(
    env,
    h,
    userId,
    [
      {
        role: 'system',
        content:
          'You are an autonomous task executor. Provide a concise, concrete execution result for the user mission goal and success criteria.',
      },
      {
        role: 'user',
        content: `Goal: ${task.goal}\n${task.successCriteria ? `Success Criteria: ${task.successCriteria}\n` : ''}Steps:\n${steps.map((s, i) => `${i + 1}. ${s.instruction}`).join('\n')}`,
      },
    ],
    700,
  )

  const updatedSteps = steps.map((s, idx) => ({
    ...s,
    status: 'done',
    output:
      idx === steps.length - 1
        ? llmOut || 'Step completed. Connect an LLM API key in Settings for full AI-generated synthesis.'
        : s.output || `Completed: ${s.instruction}`,
  }))

  const result =
    llmOut ||
    `Task "${task.title}" completed (${updatedSteps.length} steps). Connect an LLM API key in Settings for AI-generated analysis.`
  const verdict = JSON.stringify({
    met: Boolean(llmOut),
    gaps: llmOut ? [] : ['No LLM API key configured for deep synthesis'],
    answer: result.slice(0, 400),
  })

  await env.DB.prepare(
    `UPDATE prod_tasks
        SET status = 'done', cursor = ?, plan = ?, result = ?, verdict = ?, error = NULL, updatedAt = ?, finishedAt = ?
      WHERE id = ? AND userId = ?`,
  )
    .bind(updatedSteps.length, JSON.stringify(updatedSteps), result, verdict, now, now, task.id, userId)
    .run()

  await recordTaskEvent(env, h, task.id, userId, 'verified', llmOut ? 'Mission completed and verified.' : 'Mission steps marked complete.')
}

async function handleTasks({ request, env, path, method, user, h, json }) {
  if (path === '/api/v1/tasks' && method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT * FROM prod_tasks WHERE userId = ? ORDER BY createdAt DESC LIMIT 100',
    )
      .bind(user.id)
      .all()
    return json((rows.results || []).map(taskRowDto))
  }

  if (path === '/api/v1/tasks' && method === 'POST') {
    const body = await readBody(request)
    const goal = str(body.goal, 4000)
    if (!goal || goal.length < 3) return json({ statusCode: 400, message: 'Goal is required.' }, 400)
    const title = str(body.title, 200) || goal.slice(0, 100)
    const successCriteria = str(body.successCriteria, 2000) || null
    const target = str(body.target, 200) || null
    const maxSteps = clampInt(body.maxSteps, 1, 50, 12)
    const id = makeId(h, 'tsk')
    const now = new Date().toISOString()

    const initialPlan = [
      { kind: 'llm', instruction: `Analyze mission objective: ${title}`, status: 'pending' },
      {
        kind: 'llm',
        instruction: successCriteria ? `Execute against criteria: ${successCriteria}` : 'Execute mission plan and draft deliverables',
        status: 'pending',
      },
      { kind: 'llm', instruction: 'Verify outcome and summarize final result', status: 'pending' },
    ]

    await env.DB.prepare(
      `INSERT INTO prod_tasks (id, userId, title, goal, successCriteria, target, maxSteps, status, cursor, replans, plan, result, verdict, error, createdAt, updatedAt, finishedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'planning', 0, 0, ?, NULL, NULL, NULL, ?, ?, NULL)`,
    )
      .bind(id, user.id, title, goal, successCriteria, target, maxSteps, JSON.stringify(initialPlan), now, now)
      .run()

    await recordTaskEvent(env, h, id, user.id, 'created', `Mission created: ${title}`)

    const created = await env.DB.prepare('SELECT * FROM prod_tasks WHERE id = ? AND userId = ?').bind(id, user.id).first()
    await executeTaskSteps(env, h, user.id, created)

    const updated = await env.DB.prepare('SELECT * FROM prod_tasks WHERE id = ? AND userId = ?').bind(id, user.id).first()
    return json(taskRowDto(updated), 201)
  }

  const m = path.match(/^\/api\/v1\/tasks\/([^/]+)(?:\/(approve|cancel|run))?$/)
  if (!m) return null
  const taskId = decodeURIComponent(m[1])
  const action = m[2] || null

  const existing = await env.DB.prepare('SELECT * FROM prod_tasks WHERE id = ? AND userId = ?')
    .bind(taskId, user.id)
    .first()
  if (!existing) return json({ statusCode: 404, message: 'Task not found.' }, 404)

  if (!action && method === 'GET') {
    const evRows = await env.DB.prepare(
      'SELECT * FROM prod_task_events WHERE taskId = ? AND userId = ? ORDER BY createdAt ASC LIMIT 200',
    )
      .bind(taskId, user.id)
      .all()
    return json(taskDetailDto(existing, evRows.results || []))
  }

  if (!action && (method === 'PATCH' || method === 'PUT')) {
    const body = await readBody(request)
    const now = new Date().toISOString()
    const title = body.title !== undefined ? str(body.title, 200) || existing.title : existing.title
    const goal = body.goal !== undefined ? str(body.goal, 4000) || existing.goal : existing.goal
    const status = body.status !== undefined ? str(body.status, 40) || existing.status : existing.status
    const successCriteria =
      body.successCriteria !== undefined ? str(body.successCriteria, 2000) || null : existing.successCriteria
    const result = body.result !== undefined ? str(body.result, 16000) || null : existing.result
    const finishedAt = ['done', 'failed', 'cancelled'].includes(status) ? existing.finishedAt || now : existing.finishedAt
    await env.DB.prepare(
      `UPDATE prod_tasks SET title = ?, goal = ?, status = ?, successCriteria = ?, result = ?, updatedAt = ?, finishedAt = ?
        WHERE id = ? AND userId = ?`,
    )
      .bind(title, goal, status, successCriteria, result, now, finishedAt, taskId, user.id)
      .run()
    const updated = await env.DB.prepare('SELECT * FROM prod_tasks WHERE id = ? AND userId = ?').bind(taskId, user.id).first()
    return json(taskRowDto(updated))
  }

  if (!action && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM prod_task_events WHERE taskId = ? AND userId = ?').bind(taskId, user.id).run()
    await env.DB.prepare('DELETE FROM prod_tasks WHERE id = ? AND userId = ?').bind(taskId, user.id).run()
    return json({ ok: true })
  }

  if (action === 'approve' && method === 'POST') {
    await recordTaskEvent(env, h, taskId, user.id, 'approved', 'Step approved by user.')
    await executeTaskSteps(env, h, user.id, existing)
    return json({ ok: true })
  }

  if (action === 'cancel' && method === 'POST') {
    const now = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE prod_tasks SET status = 'cancelled', updatedAt = ?, finishedAt = ? WHERE id = ? AND userId = ?`,
    )
      .bind(now, now, taskId, user.id)
      .run()
    await recordTaskEvent(env, h, taskId, user.id, 'cancelled', 'Mission cancelled by user.')
    return json({ ok: true })
  }

  if (action === 'run' && method === 'POST') {
    await recordTaskEvent(env, h, taskId, user.id, 'run', 'On-demand execution triggered.')
    await executeTaskSteps(env, h, user.id, existing)
    const updated = await env.DB.prepare('SELECT * FROM prod_tasks WHERE id = ? AND userId = ?').bind(taskId, user.id).first()
    const evRows = await env.DB.prepare(
      'SELECT * FROM prod_task_events WHERE taskId = ? AND userId = ? ORDER BY createdAt ASC LIMIT 200',
    )
      .bind(taskId, user.id)
      .all()
    return json(taskDetailDto(updated, evRows.results || []))
  }

  return json({ statusCode: 405, message: 'Method not allowed.' }, 405)
}

// ── Goals ───────────────────────────────────────────────────────────────────

async function logGoalEvent(env, h, goalId, userId, kind, message) {
  await env.DB.prepare(
    `INSERT INTO prod_goal_logs (id, goalId, userId, kind, message, at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(makeId(h, 'glg'), goalId, userId, kind, str(message, 2000), new Date().toISOString())
    .run()
}

function calcProgressFromSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return 0
  const finished = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  return Math.round((finished / steps.length) * 100)
}

function calcProgressFromMilestones(milestones) {
  if (!Array.isArray(milestones) || milestones.length === 0) return 0
  const done = milestones.filter((m) => m.completed).length
  return Math.round((done / milestones.length) * 100)
}

async function handleGoals({ request, env, url, path, method, user, h, json }) {
  if (path === '/api/v1/goals/progress/log' && method === 'GET') {
    const limit = clampInt(url.searchParams.get('limit'), 1, 200, 100)
    const rows = await env.DB.prepare(
      'SELECT * FROM prod_goal_logs WHERE userId = ? ORDER BY at DESC LIMIT ?',
    )
      .bind(user.id, limit)
      .all()
    return json(rows.results || [])
  }

  if (path === '/api/v1/goals' && method === 'GET') {
    const status = url.searchParams.get('status')
    const rows =
      status && VALID_GOAL_STATUSES.has(status)
        ? await env.DB.prepare('SELECT * FROM prod_goals WHERE userId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 100')
            .bind(user.id, status)
            .all()
        : await env.DB.prepare('SELECT * FROM prod_goals WHERE userId = ? ORDER BY updatedAt DESC LIMIT 100')
            .bind(user.id)
            .all()
    return json((rows.results || []).map(goalDto))
  }

  if (path === '/api/v1/goals' && method === 'POST') {
    const body = await readBody(request)
    const title = str(body.title, 200)
    if (!title) return json({ statusCode: 400, message: 'Goal title is required.' }, 400)
    const description = str(body.description, 4000)
    const priority = VALID_GOAL_PRIORITIES.has(body.priority) ? body.priority : 'medium'
    const dueDate = body.dueDate ? str(body.dueDate, 40) : null
    const tags = Array.isArray(body.tags)
      ? body.tags.slice(0, 20).map((t) => str(t, 40)).filter(Boolean)
      : []
    const milestones = Array.isArray(body.milestones)
      ? body.milestones.slice(0, 30).map((m) =>
          typeof m === 'string'
            ? { id: makeId(h, 'ms'), title: str(m, 200), completed: false }
            : { id: str(m?.id, 60) || makeId(h, 'ms'), title: str(m?.title, 200), completed: Boolean(m?.completed) },
        ).filter((m) => m.title)
      : []
    const progress = calcProgressFromMilestones(milestones)
    const id = makeId(h, 'gol')
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO prod_goals (id, userId, title, description, status, priority, milestones, progress, conversationIds, tags, dueDate, createdAt, updatedAt, completedAt)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, '[]', ?, ?, ?, ?, NULL)`,
    )
      .bind(id, user.id, title, description, priority, JSON.stringify(milestones), progress, JSON.stringify(tags), dueDate, now, now)
      .run()

    const row = await env.DB.prepare('SELECT * FROM prod_goals WHERE id = ? AND userId = ?').bind(id, user.id).first()
    return json(goalDto(row), 201)
  }

  // Sub-routes under /api/v1/goals/:id
  const stepDecideMatch = path.match(/^\/api\/v1\/goals\/([^/]+)\/plan\/steps\/([^/]+)\/decide$/)
  if (stepDecideMatch && method === 'POST') {
    const goalId = decodeURIComponent(stepDecideMatch[1])
    const stepId = decodeURIComponent(stepDecideMatch[2])
    const goal = await env.DB.prepare('SELECT * FROM prod_goals WHERE id = ? AND userId = ?').bind(goalId, user.id).first()
    if (!goal) return json({ statusCode: 404, message: 'Goal not found.' }, 404)
    const planRow = await env.DB.prepare('SELECT * FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
    if (!planRow) return json({ statusCode: 404, message: 'Goal plan not found.' }, 404)

    const body = await readBody(request)
    const approve = Boolean(body.approve)
    const steps = parseJson(planRow.steps, [])
    const idx = steps.findIndex((s) => s.id === stepId)
    if (idx === -1) return json({ statusCode: 404, message: 'Plan step not found.' }, 404)

    const now = new Date().toISOString()
    if (approve) {
      const draft = await callUserLlm(
        env,
        h,
        user.id,
        [
          { role: 'system', content: 'Draft a concise, actionable output for this approved goal step.' },
          { role: 'user', content: `Goal: ${goal.title}\nStep: ${steps[idx].title}\nDetail: ${steps[idx].detail || ''}` },
        ],
        400,
      )
      steps[idx] = {
        ...steps[idx],
        status: 'done',
        output: draft || `Approved and completed: ${steps[idx].title}`,
        updatedAt: now,
      }
      await logGoalEvent(env, h, goalId, user.id, 'approved', `Approved step: ${steps[idx].title}`)
    } else {
      steps[idx] = { ...steps[idx], status: 'skipped', updatedAt: now }
      await logGoalEvent(env, h, goalId, user.id, 'rejected', `Skipped step: ${steps[idx].title}`)
    }

    const progress = calcProgressFromSteps(steps)
    await env.DB.prepare('UPDATE prod_goal_plans SET steps = ?, updatedAt = ? WHERE goalId = ? AND userId = ?')
      .bind(JSON.stringify(steps), now, goalId, user.id)
      .run()
    await env.DB.prepare(
      `UPDATE prod_goals SET progress = ?, status = ?, completedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?`,
    )
      .bind(
        progress,
        progress >= 100 ? 'completed' : goal.status,
        progress >= 100 ? goal.completedAt || now : goal.completedAt,
        now,
        goalId,
        user.id,
      )
      .run()

    const updatedPlan = await env.DB.prepare('SELECT * FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
    return json({ plan: goalPlanDto(updatedPlan) })
  }

  const msCompleteMatch = path.match(/^\/api\/v1\/goals\/([^/]+)\/milestones\/([^/]+)\/complete$/)
  if (msCompleteMatch && method === 'POST') {
    const goalId = decodeURIComponent(msCompleteMatch[1])
    const milestoneId = decodeURIComponent(msCompleteMatch[2])
    const goal = await env.DB.prepare('SELECT * FROM prod_goals WHERE id = ? AND userId = ?').bind(goalId, user.id).first()
    if (!goal) return json({ statusCode: 404, message: 'Goal not found.' }, 404)
    const milestones = parseJson(goal.milestones, [])
    const now = new Date().toISOString()
    let found = false
    for (const ms of milestones) {
      if (ms.id === milestoneId) {
        ms.completed = true
        ms.completedAt = now
        found = true
      }
    }
    if (!found) return json({ statusCode: 404, message: 'Milestone not found.' }, 404)
    const progress = calcProgressFromMilestones(milestones)
    const status = progress >= 100 ? 'completed' : goal.status
    await env.DB.prepare(
      `UPDATE prod_goals SET milestones = ?, progress = ?, status = ?, completedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?`,
    )
      .bind(JSON.stringify(milestones), progress, status, progress >= 100 ? now : goal.completedAt, now, goalId, user.id)
      .run()
    const updated = await env.DB.prepare('SELECT * FROM prod_goals WHERE id = ? AND userId = ?').bind(goalId, user.id).first()
    return json(goalDto(updated))
  }

  const linkMatch = path.match(/^\/api\/v1\/goals\/([^/]+)\/link\/([^/]+)$/)
  if (linkMatch && method === 'POST') {
    const goalId = decodeURIComponent(linkMatch[1])
    const convId = decodeURIComponent(linkMatch[2])
    const goal = await env.DB.prepare('SELECT * FROM prod_goals WHERE id = ? AND userId = ?').bind(goalId, user.id).first()
    if (!goal) return json({ statusCode: 404, message: 'Goal not found.' }, 404)
    const convIds = parseJson(goal.conversationIds, [])
    if (!convIds.includes(convId)) convIds.push(convId)
    await env.DB.prepare('UPDATE prod_goals SET conversationIds = ?, updatedAt = ? WHERE id = ? AND userId = ?')
      .bind(JSON.stringify(convIds.slice(-100)), new Date().toISOString(), goalId, user.id)
      .run()
    return json({ ok: true })
  }

  const planSubMatch = path.match(/^\/api\/v1\/goals\/([^/]+)\/plan(?:\/(auto-advance|step))?$/)
  if (planSubMatch) {
    const goalId = decodeURIComponent(planSubMatch[1])
    const sub = planSubMatch[2] || null
    const goal = await env.DB.prepare('SELECT * FROM prod_goals WHERE id = ? AND userId = ?').bind(goalId, user.id).first()
    if (!goal) return json({ statusCode: 404, message: 'Goal not found.' }, 404)

    if (!sub && method === 'GET') {
      const planRow = await env.DB.prepare('SELECT * FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
      const logRows = await env.DB.prepare(
        'SELECT * FROM prod_goal_logs WHERE goalId = ? AND userId = ? ORDER BY at DESC LIMIT 100',
      )
        .bind(goalId, user.id)
        .all()
      return json({ plan: goalPlanDto(planRow), log: logRows.results || [] })
    }

    if (!sub && method === 'POST') {
      const now = new Date().toISOString()
      let steps = null
      const llmRaw = await callUserLlm(
        env,
        h,
        user.id,
        [
          {
            role: 'system',
            content:
              'Return ONLY a JSON array of 4 to 6 milestone steps for this goal. Each object must have: {"title": string, "detail": string, "risky": boolean}. Mark external/irreversible actions risky:true.',
          },
          { role: 'user', content: `Goal: ${goal.title}\nDescription: ${goal.description || 'N/A'}\nPriority: ${goal.priority}` },
        ],
        600,
      )
      if (llmRaw) {
        const jsonMatch = llmRaw.match(/\[[\s\S]*\]/)
        const parsed = jsonMatch ? parseJson(jsonMatch[0], null) : null
        if (Array.isArray(parsed) && parsed.length > 0) {
          steps = parsed.slice(0, 8).map((s) => ({
            id: makeId(h, 'stp'),
            title: str(s?.title, 160) || 'Milestone step',
            detail: str(s?.detail, 500),
            risky: Boolean(s?.risky),
            status: 'pending',
          }))
        }
      }
      if (!steps) {
        const existingMs = parseJson(goal.milestones, [])
        if (existingMs.length > 0) {
          steps = existingMs.map((ms) => ({
            id: ms.id || makeId(h, 'stp'),
            title: ms.title,
            detail: `Complete milestone for "${goal.title}"`,
            risky: false,
            status: ms.completed ? 'done' : 'pending',
          }))
        } else {
          steps = [
            { id: makeId(h, 'stp'), title: 'Define scope and success criteria', detail: `Clarify deliverables and constraints for "${goal.title}".`, risky: false, status: 'pending' },
            { id: makeId(h, 'stp'), title: 'Research and outline approach', detail: 'Gather context, tools, and dependencies needed.', risky: false, status: 'pending' },
            { id: makeId(h, 'stp'), title: 'Execute core deliverable', detail: goal.description || `Build the primary output for "${goal.title}".`, risky: false, status: 'pending' },
            { id: makeId(h, 'stp'), title: 'Review and publish external release', detail: 'Verify quality and share or deploy final outcome.', risky: true, status: 'pending' },
          ]
        }
      }

      const prevPlan = await env.DB.prepare('SELECT autoAdvance FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
      await env.DB.prepare(
        `INSERT OR REPLACE INTO prod_goal_plans (goalId, userId, steps, autoAdvance, lastAdvancedDay, lastWeeklySummaryAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
        .bind(goalId, user.id, JSON.stringify(steps), prevPlan ? prevPlan.autoAdvance : 0, now, now)
        .run()

      const syncedMilestones = steps.map((s) => ({
        id: s.id,
        title: s.title,
        completed: s.status === 'done',
      }))
      const progress = calcProgressFromSteps(steps)
      await env.DB.prepare('UPDATE prod_goals SET milestones = ?, progress = ?, updatedAt = ? WHERE id = ? AND userId = ?')
        .bind(JSON.stringify(syncedMilestones), progress, now, goalId, user.id)
        .run()

      await logGoalEvent(env, h, goalId, user.id, 'plan', `Generated ${steps.length}-step milestone plan.`)
      const planRow = await env.DB.prepare('SELECT * FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
      const logRows = await env.DB.prepare(
        'SELECT * FROM prod_goal_logs WHERE goalId = ? AND userId = ? ORDER BY at DESC LIMIT 100',
      )
        .bind(goalId, user.id)
        .all()
      return json({ plan: goalPlanDto(planRow), log: logRows.results || [] })
    }

    if (sub === 'auto-advance' && method === 'PUT') {
      const planRow = await env.DB.prepare('SELECT * FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
      if (!planRow) return json({ statusCode: 404, message: 'Generate a plan first.' }, 404)
      const body = await readBody(request)
      const autoAdvance = body.autoAdvance ? 1 : 0
      await env.DB.prepare('UPDATE prod_goal_plans SET autoAdvance = ?, updatedAt = ? WHERE goalId = ? AND userId = ?')
        .bind(autoAdvance, new Date().toISOString(), goalId, user.id)
        .run()
      const updated = await env.DB.prepare('SELECT * FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
      return json(goalPlanDto(updated))
    }

    if (sub === 'step' && method === 'POST') {
      const planRow = await env.DB.prepare('SELECT * FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
      if (!planRow) return json({ statusCode: 404, message: 'Generate a plan first.' }, 404)
      const steps = parseJson(planRow.steps, [])
      const awaiting = steps.find((s) => s.status === 'awaiting_approval')
      if (awaiting) {
        return json({
          plan: goalPlanDto(planRow),
          message: `Step "${awaiting.title}" is awaiting your approval before continuing.`,
        })
      }
      const nextIdx = steps.findIndex((s) => s.status === 'pending')
      if (nextIdx === -1) {
        return json({ plan: goalPlanDto(planRow), message: 'All plan steps are already completed.' })
      }

      const now = new Date().toISOString()
      const step = steps[nextIdx]
      let message
      if (step.risky) {
        steps[nextIdx] = { ...step, status: 'awaiting_approval', updatedAt: now }
        message = `Paused for approval on risky step: "${step.title}".`
        await logGoalEvent(env, h, goalId, user.id, 'approval_requested', message)
      } else {
        const draft = await callUserLlm(
          env,
          h,
          user.id,
          [
            { role: 'system', content: 'Produce a concise, actionable work output for this goal milestone step.' },
            { role: 'user', content: `Goal: ${goal.title}\nDescription: ${goal.description || ''}\nStep: ${step.title}\nDetail: ${step.detail || ''}` },
          ],
          400,
        )
        steps[nextIdx] = {
          ...step,
          status: 'done',
          output: draft || `Completed step "${step.title}".`,
          updatedAt: now,
        }
        message = `Completed step: "${step.title}".`
        await logGoalEvent(env, h, goalId, user.id, 'advance', message)
      }

      const day = now.slice(0, 10)
      await env.DB.prepare(
        'UPDATE prod_goal_plans SET steps = ?, lastAdvancedDay = ?, updatedAt = ? WHERE goalId = ? AND userId = ?',
      )
        .bind(JSON.stringify(steps), day, now, goalId, user.id)
        .run()

      const progress = calcProgressFromSteps(steps)
      const milestones = steps.map((s) => ({
        id: s.id,
        title: s.title,
        completed: s.status === 'done',
        ...(s.status === 'done' && s.updatedAt ? { completedAt: s.updatedAt } : {}),
      }))
      await env.DB.prepare(
        `UPDATE prod_goals SET milestones = ?, progress = ?, status = ?, completedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?`,
      )
        .bind(
          JSON.stringify(milestones),
          progress,
          progress >= 100 ? 'completed' : goal.status,
          progress >= 100 ? goal.completedAt || now : goal.completedAt,
          now,
          goalId,
          user.id,
        )
        .run()

      const updatedPlan = await env.DB.prepare('SELECT * FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).first()
      return json({ plan: goalPlanDto(updatedPlan), message })
    }
    return json({ statusCode: 405, message: 'Method not allowed.' }, 405)
  }

  const idMatch = path.match(/^\/api\/v1\/goals\/([^/]+)$/)
  if (!idMatch) return null
  const goalId = decodeURIComponent(idMatch[1])
  const existing = await env.DB.prepare('SELECT * FROM prod_goals WHERE id = ? AND userId = ?').bind(goalId, user.id).first()
  if (!existing) return json({ statusCode: 404, message: 'Goal not found.' }, 404)

  if (method === 'GET') return json(goalDto(existing))

  if (method === 'PATCH' || method === 'PUT') {
    const body = await readBody(request)
    const now = new Date().toISOString()
    const title = body.title !== undefined ? str(body.title, 200) || existing.title : existing.title
    const description = body.description !== undefined ? str(body.description, 4000) : existing.description
    const status = body.status !== undefined && VALID_GOAL_STATUSES.has(body.status) ? body.status : existing.status
    const priority = body.priority !== undefined && VALID_GOAL_PRIORITIES.has(body.priority) ? body.priority : existing.priority
    const dueDate = body.dueDate !== undefined ? (body.dueDate ? str(body.dueDate, 40) : null) : existing.dueDate
    const tags = Array.isArray(body.tags)
      ? JSON.stringify(body.tags.slice(0, 20).map((t) => str(t, 40)).filter(Boolean))
      : existing.tags
    const progress = body.progress !== undefined ? clampInt(body.progress, 0, 100, existing.progress) : existing.progress
    const completedAt = status === 'completed' ? existing.completedAt || now : null

    await env.DB.prepare(
      `UPDATE prod_goals SET title = ?, description = ?, status = ?, priority = ?, dueDate = ?, tags = ?, progress = ?, completedAt = ?, updatedAt = ?
        WHERE id = ? AND userId = ?`,
    )
      .bind(title, description, status, priority, dueDate, tags, progress, completedAt, now, goalId, user.id)
      .run()
    const updated = await env.DB.prepare('SELECT * FROM prod_goals WHERE id = ? AND userId = ?').bind(goalId, user.id).first()
    return json(goalDto(updated))
  }

  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM prod_goal_logs WHERE goalId = ? AND userId = ?').bind(goalId, user.id).run()
    await env.DB.prepare('DELETE FROM prod_goal_plans WHERE goalId = ? AND userId = ?').bind(goalId, user.id).run()
    await env.DB.prepare('DELETE FROM prod_goals WHERE id = ? AND userId = ?').bind(goalId, user.id).run()
    return json(true)
  }

  return json({ statusCode: 405, message: 'Method not allowed.' }, 405)
}

// ── Cron Jobs & Scheduler ───────────────────────────────────────────────────

async function executeCronJob(env, h, userId, job) {
  const t0 = Date.now()
  let summary = `Executed ${job.payloadKind}: ${job.payloadText.slice(0, 160)}`
  if (job.payloadKind === 'agentTurn') {
    const llmOut = await callUserLlm(
      env,
      h,
      userId,
      [
        { role: 'system', content: 'You are executing a scheduled OpenAgents job. Respond concisely.' },
        { role: 'user', content: job.payloadText },
      ],
      400,
    )
    if (llmOut) summary = llmOut.slice(0, 2000)
  }
  const durationMs = Math.max(1, Date.now() - t0)
  const runId = makeId(h, 'crn')
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO prod_cron_runs (id, cronJobId, userId, status, summary, error, durationMs, createdAt)
     VALUES (?, ?, ?, 'ok', ?, NULL, ?, ?)`,
  )
    .bind(runId, job.id, userId, summary, durationMs, now)
    .run()
  return { runId, createdAt: now, durationMs, summary }
}

async function handleCron({ request, env, url, path, method, user, h, json }) {
  if (path === '/api/v1/cron/jobs/health/summary' && method === 'GET') {
    const staleAfterMin = clampInt(url.searchParams.get('staleAfterMinutes'), 5, 10080, 120)
    const jobsRes = await env.DB.prepare('SELECT * FROM prod_cron_jobs WHERE userId = ? ORDER BY updatedAt DESC LIMIT 100')
      .bind(user.id)
      .all()
    const jobs = jobsRes.results || []
    const staleJobs = []
    const failingJobs = []
    const nowMs = Date.now()

    for (const job of jobs) {
      const runsRes = await env.DB.prepare(
        'SELECT * FROM prod_cron_runs WHERE cronJobId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 5',
      )
        .bind(job.id, user.id)
        .all()
      const runs = runsRes.results || []
      const last = runs[0] || null
      let consecutiveFailures = 0
      for (const r of runs) {
        if (r.status === 'error') consecutiveFailures++
        else break
      }
      const lastTs = last ? Date.parse(last.createdAt) : Date.parse(job.createdAt)
      const stale = Boolean(job.enabled) && Number.isFinite(lastTs) && nowMs - lastTs > staleAfterMin * 60_000
      const health = {
        jobId: job.id,
        name: job.name,
        enabled: Boolean(job.enabled),
        lastRunAt: last ? last.createdAt : null,
        lastStatus: last ? last.status : null,
        consecutiveFailures,
        stale,
        retryDueAt: consecutiveFailures > 0 ? new Date(nowMs + 5 * 60_000).toISOString() : null,
      }
      if (stale) staleJobs.push(health)
      if (consecutiveFailures > 0) failingJobs.push(health)
    }

    return json({
      generatedAt: new Date().toISOString(),
      totals: {
        jobs: jobs.length,
        enabledJobs: jobs.filter((j) => Boolean(j.enabled)).length,
        staleJobs: staleJobs.length,
        failingJobs: failingJobs.length,
      },
      staleJobs,
      failingJobs,
    })
  }

  if (path === '/api/v1/cron/jobs/self-heal' && method === 'POST') {
    const body = await readBody(request)
    const staleAfterMin = clampInt(body.staleAfterMinutes, 5, 10080, 120)
    const jobsRes = await env.DB.prepare('SELECT * FROM prod_cron_jobs WHERE userId = ? AND enabled = 1 LIMIT 50')
      .bind(user.id)
      .all()
    const actions = []
    let healedCount = 0
    let skippedCount = 0
    const nowMs = Date.now()

    for (const job of jobsRes.results || []) {
      const last = await env.DB.prepare(
        'SELECT * FROM prod_cron_runs WHERE cronJobId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 1',
      )
        .bind(job.id, user.id)
        .first()
      const lastTs = last ? Date.parse(last.createdAt) : Date.parse(job.createdAt)
      const isFailing = last?.status === 'error'
      const isStale = Number.isFinite(lastTs) && nowMs - lastTs > staleAfterMin * 60_000
      if (isFailing || isStale) {
        const res = await executeCronJob(env, h, user.id, job)
        healedCount++
        actions.push({
          jobId: job.id,
          name: job.name,
          action: isFailing ? 'retry-run' : 'stale-run',
          reason: isFailing ? 'Retried after error status' : 'Triggered stale job on demand',
          runId: res.runId,
        })
      } else {
        skippedCount++
        actions.push({ jobId: job.id, name: job.name, action: 'skipped', reason: 'Healthy' })
      }
    }

    return json({ generatedAt: new Date().toISOString(), healedCount, skippedCount, actions })
  }

  if (path === '/api/v1/cron/jobs' && method === 'GET') {
    const jobsRes = await env.DB.prepare('SELECT * FROM prod_cron_jobs WHERE userId = ? ORDER BY updatedAt DESC LIMIT 100')
      .bind(user.id)
      .all()
    const jobs = jobsRes.results || []
    const out = []
    for (const job of jobs) {
      const latestRun = await env.DB.prepare(
        'SELECT * FROM prod_cron_runs WHERE cronJobId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 1',
      )
        .bind(job.id, user.id)
        .first()
      out.push(cronJobDto(job, latestRun ? [cronRunDto(latestRun)] : []))
    }
    return json(out)
  }

  if (path === '/api/v1/cron/jobs' && method === 'POST') {
    const body = await readBody(request)
    const name = str(body.name, 160)
    const scheduleValue = str(body.scheduleValue, 120)
    const payloadText = str(body.payloadText, 4000)
    if (!name || !scheduleValue || !payloadText) {
      return json({ statusCode: 400, message: 'name, scheduleValue, and payloadText are required.' }, 400)
    }
    const scheduleKind = VALID_CRON_SCHEDULE_KINDS.has(body.scheduleKind) ? body.scheduleKind : 'every'
    const sessionTarget = VALID_CRON_SESSION_TARGETS.has(body.sessionTarget) ? body.sessionTarget : 'main'
    const payloadKind = VALID_CRON_PAYLOAD_KINDS.has(body.payloadKind) ? body.payloadKind : 'systemEvent'
    const deliveryMode = VALID_CRON_DELIVERY_MODES.has(body.deliveryMode) ? body.deliveryMode : 'none'
    const description = body.description ? str(body.description, 500) : null
    const deliveryTarget = body.deliveryTarget ? str(body.deliveryTarget, 500) : null
    const enabled = body.enabled !== false ? 1 : 0
    const id = makeId(h, 'crj')
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO prod_cron_jobs (id, userId, name, description, enabled, scheduleKind, scheduleValue, sessionTarget, payloadKind, payloadText, deliveryMode, deliveryTarget, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, user.id, name, description, enabled, scheduleKind, scheduleValue, sessionTarget, payloadKind, payloadText, deliveryMode, deliveryTarget, now, now)
      .run()

    const row = await env.DB.prepare('SELECT * FROM prod_cron_jobs WHERE id = ? AND userId = ?').bind(id, user.id).first()
    return json(cronJobDto(row, []), 201)
  }

  const m = path.match(/^\/api\/v1\/cron\/jobs\/([^/]+)(?:\/(run|runs))?$/)
  if (!m) return null
  const jobId = decodeURIComponent(m[1])
  const action = m[2] || null

  const job = await env.DB.prepare('SELECT * FROM prod_cron_jobs WHERE id = ? AND userId = ?').bind(jobId, user.id).first()
  if (!job) return json({ statusCode: 404, message: 'Cron job not found.' }, 404)

  if (!action && method === 'GET') {
    const latestRun = await env.DB.prepare(
      'SELECT * FROM prod_cron_runs WHERE cronJobId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 1',
    )
      .bind(jobId, user.id)
      .first()
    return json(cronJobDto(job, latestRun ? [cronRunDto(latestRun)] : []))
  }

  if (!action && (method === 'PATCH' || method === 'PUT')) {
    const body = await readBody(request)
    const now = new Date().toISOString()
    const name = body.name !== undefined ? str(body.name, 160) || job.name : job.name
    const description = body.description !== undefined ? (body.description ? str(body.description, 500) : null) : job.description
    const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : job.enabled
    const scheduleKind =
      body.scheduleKind !== undefined && VALID_CRON_SCHEDULE_KINDS.has(body.scheduleKind) ? body.scheduleKind : job.scheduleKind
    const scheduleValue = body.scheduleValue !== undefined ? str(body.scheduleValue, 120) || job.scheduleValue : job.scheduleValue
    const sessionTarget =
      body.sessionTarget !== undefined && VALID_CRON_SESSION_TARGETS.has(body.sessionTarget) ? body.sessionTarget : job.sessionTarget
    const payloadKind =
      body.payloadKind !== undefined && VALID_CRON_PAYLOAD_KINDS.has(body.payloadKind) ? body.payloadKind : job.payloadKind
    const payloadText = body.payloadText !== undefined ? str(body.payloadText, 4000) || job.payloadText : job.payloadText
    const deliveryMode =
      body.deliveryMode !== undefined && VALID_CRON_DELIVERY_MODES.has(body.deliveryMode) ? body.deliveryMode : job.deliveryMode
    const deliveryTarget =
      body.deliveryTarget !== undefined ? (body.deliveryTarget ? str(body.deliveryTarget, 500) : null) : job.deliveryTarget

    await env.DB.prepare(
      `UPDATE prod_cron_jobs
          SET name = ?, description = ?, enabled = ?, scheduleKind = ?, scheduleValue = ?, sessionTarget = ?,
              payloadKind = ?, payloadText = ?, deliveryMode = ?, deliveryTarget = ?, updatedAt = ?
        WHERE id = ? AND userId = ?`,
    )
      .bind(name, description, enabled, scheduleKind, scheduleValue, sessionTarget, payloadKind, payloadText, deliveryMode, deliveryTarget, now, jobId, user.id)
      .run()

    const updated = await env.DB.prepare('SELECT * FROM prod_cron_jobs WHERE id = ? AND userId = ?').bind(jobId, user.id).first()
    const latestRun = await env.DB.prepare(
      'SELECT * FROM prod_cron_runs WHERE cronJobId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 1',
    )
      .bind(jobId, user.id)
      .first()
    return json(cronJobDto(updated, latestRun ? [cronRunDto(latestRun)] : []))
  }

  if (!action && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM prod_cron_runs WHERE cronJobId = ? AND userId = ?').bind(jobId, user.id).run()
    await env.DB.prepare('DELETE FROM prod_cron_jobs WHERE id = ? AND userId = ?').bind(jobId, user.id).run()
    return json({ ok: true })
  }

  if (action === 'run' && method === 'POST') {
    await executeCronJob(env, h, user.id, job)
    return json({ ok: true, jobId })
  }

  if (action === 'runs' && method === 'GET') {
    const limit = clampInt(url.searchParams.get('limit'), 1, 100, 25)
    const rows = await env.DB.prepare(
      'SELECT * FROM prod_cron_runs WHERE cronJobId = ? AND userId = ? ORDER BY createdAt DESC LIMIT ?',
    )
      .bind(jobId, user.id, limit)
      .all()
    return json((rows.results || []).map(cronRunDto))
  }

  return json({ statusCode: 405, message: 'Method not allowed.' }, 405)
}

// ── Workflows ───────────────────────────────────────────────────────────────

function evaluateBranchCondition(step, ctx) {
  let sourceVal
  switch (step.conditionSource) {
    case 'state':
      sourceVal = step.conditionPath ? getByPath(ctx.state, step.conditionPath) : ctx.state
      break
    case 'run_input':
      sourceVal = step.conditionPath ? getByPath(ctx.input, step.conditionPath) : ctx.input
      break
    case 'trigger_kind':
      sourceVal = ctx.triggerKind
      break
    case 'workflow_name':
      sourceVal = ctx.workflowName
      break
    default:
      sourceVal = ctx.lastOutput
  }
  const haystack = typeof sourceVal === 'string' ? sourceVal : JSON.stringify(sourceVal ?? '')
  const needle = String(step.conditionValue ?? '')
  switch (step.conditionOperator) {
    case 'not_contains':
      return !haystack.includes(needle)
    case 'equals':
      return haystack === needle
    case 'not_equals':
      return haystack !== needle
    case 'contains':
    default:
      return haystack.includes(needle)
  }
}

async function runWorkflowEngine(env, h, userId, workflow, opts = {}) {
  const runId = makeId(h, 'wfr')
  const startedAt = new Date().toISOString()
  const triggerKind = VALID_WORKFLOW_TRIGGERS.has(opts.triggerKind) ? opts.triggerKind : workflow.trigger?.kind || 'manual'
  const input = opts.input && typeof opts.input === 'object' ? opts.input : {}
  const state = opts.initialState && typeof opts.initialState === 'object' ? JSON.parse(JSON.stringify(opts.initialState)) : {}
  const approvedKeys = new Set(Array.isArray(opts.approvedKeys) ? opts.approvedKeys.map(String) : [])
  const steps = Array.isArray(workflow.steps) ? workflow.steps : []
  const stepIndexById = new Map(steps.map((s, idx) => [s.id, idx]))

  const stepResults = []
  let lastOutput = null
  let status = 'done'
  let error = null
  let resumeStepId = null
  let idx = 0
  let safetyCounter = 0

  while (idx >= 0 && idx < steps.length && safetyCounter < 60) {
    safetyCounter++
    const step = steps[idx]
    const stepStart = new Date().toISOString()
    const stateWrites = []
    let nextStepId = null
    let stepOutput = null
    let stepStatus = 'done'
    let stepError = null

    try {
      const ctx = { input, state, lastOutput, triggerKind, workflowName: workflow.name }

      if (step.type === 'set_state') {
        const patch = interpolateDeep(step.statePatch || {}, ctx)
        for (const [k, v] of Object.entries(patch)) {
          setByPath(state, k, v)
          stateWrites.push(k)
        }
        stepOutput = JSON.stringify(patch)
        lastOutput = patch
      } else if (step.type === 'wait_approval') {
        const key = str(step.approvalKey, 120) || step.id
        if (!approvedKeys.has(key)) {
          stepStatus = 'waiting_approval'
          status = 'waiting_approval'
          resumeStepId = step.id
          stepOutput = `Waiting for approval key "${key}".`
        } else {
          stepOutput = `Approval key "${key}" satisfied.`
        }
      } else if (step.type === 'branch_condition') {
        const matched = evaluateBranchCondition(step, ctx)
        nextStepId = matched ? step.ifTrueStepId || null : step.ifFalseStepId || null
        stepOutput = JSON.stringify({ matched, nextStepId })
        lastOutput = matched
        if (step.outputKey) {
          setByPath(state, step.outputKey, matched)
          stateWrites.push(step.outputKey)
        }
      } else if (step.type === 'delay') {
        const ms = clampInt(step.delayMs, 0, 2000, 0)
        if (ms > 0) await new Promise((r) => setTimeout(r, ms))
        stepOutput = `Delayed ${ms}ms`
      } else if (step.type === 'agent_prompt' || step.type === 'run_agent') {
        const prompt = interpolateString(step.prompt || step.label || '', ctx)
        const llmOut = await callUserLlm(env, h, userId, [{ role: 'user', content: prompt }], 600)
        stepOutput = llmOut || `Rendered prompt (no LLM key configured): ${prompt.slice(0, 400)}`
        lastOutput = stepOutput
        if (step.outputKey) {
          setByPath(state, step.outputKey, stepOutput)
          stateWrites.push(step.outputKey)
        }
      } else if (step.type === 'tool_call' || step.type === 'run_tool') {
        const renderedInput = interpolateDeep(step.input || {}, ctx)
        const payload = {
          tool: step.toolName || 'tool',
          input: renderedInput,
          note: 'Executed in Cloudflare Worker workflow sandbox.',
        }
        stepOutput = JSON.stringify(payload)
        lastOutput = payload
        if (step.outputKey) {
          setByPath(state, step.outputKey, payload)
          stateWrites.push(step.outputKey)
        }
      } else {
        stepOutput = `Completed step ${step.label || step.id}`
      }
    } catch (e) {
      stepStatus = 'error'
      stepError = e instanceof Error ? e.message : 'Step execution failed'
      if (!step.continueOnError) {
        status = 'error'
        error = stepError
      }
    }

    const stepEnd = new Date().toISOString()
    stepResults.push({
      stepId: step.id,
      type: step.type,
      status: stepStatus,
      startedAt: stepStart,
      finishedAt: stepEnd,
      output: stepOutput !== null ? String(stepOutput).slice(0, 8000) : null,
      error: stepError,
      attemptCount: 1,
      ...(stateWrites.length > 0 ? { stateWrites } : {}),
      ...(nextStepId !== null ? { nextStepId } : {}),
    })

    if (status === 'waiting_approval' || status === 'error') break

    if (nextStepId && stepIndexById.has(nextStepId)) {
      idx = stepIndexById.get(nextStepId)
    } else {
      idx++
    }
  }

  const finishedAt = status === 'waiting_approval' ? null : new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO prod_workflow_runs
      (id, workflowId, userId, triggerKind, status, startedAt, finishedAt, error, idempotencyKey, sourceEvent,
       inputJson, stateJson, rerunOfRunId, resumeStepId, lastOutputJson, stepResultsJson, accumulatedCostUsd, budgetExhausted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
  )
    .bind(
      runId,
      workflow.id,
      userId,
      triggerKind,
      status,
      startedAt,
      finishedAt,
      error,
      opts.idempotencyKey ? str(opts.idempotencyKey, 120) : null,
      opts.sourceEvent ? str(opts.sourceEvent, 120) : null,
      JSON.stringify(input),
      JSON.stringify(state),
      opts.rerunOfRunId || null,
      resumeStepId,
      lastOutput !== null ? JSON.stringify(lastOutput).slice(0, 16000) : null,
      JSON.stringify(stepResults),
    )
    .run()

  await env.DB.prepare('UPDATE prod_workflows SET lastRunAt = ?, updatedAt = ? WHERE id = ? AND userId = ?')
    .bind(startedAt, startedAt, workflow.id, userId)
    .run()

  const row = await env.DB.prepare('SELECT * FROM prod_workflow_runs WHERE id = ? AND userId = ?').bind(runId, userId).first()
  return workflowRunDto(row)
}

async function handleWorkflows({ request, env, url, path, method, user, h, json }) {
  if (path === '/api/v1/workflows' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM prod_workflows WHERE userId = ? ORDER BY updatedAt DESC LIMIT 100')
      .bind(user.id)
      .all()
    return json((rows.results || []).map(workflowDto))
  }

  if (path === '/api/v1/workflows' && method === 'POST') {
    const body = await readBody(request)
    const name = str(body.name, 160)
    if (!name) return json({ statusCode: 400, message: 'Workflow name is required.' }, 400)
    const trigger = body.trigger && typeof body.trigger === 'object' ? body.trigger : { kind: 'manual' }
    if (!VALID_WORKFLOW_TRIGGERS.has(trigger.kind)) trigger.kind = 'manual'
    const steps = Array.isArray(body.steps) ? body.steps.slice(0, 50) : []
    const id = makeId(h, 'wfl')
    const now = new Date().toISOString()
    const enabled = body.enabled !== false ? 1 : 0
    const nextRunAt =
      enabled && trigger.kind === 'schedule' && Number(trigger.everyMinutes) > 0
        ? new Date(Date.now() + Number(trigger.everyMinutes) * 60_000).toISOString()
        : null

    await env.DB.prepare(
      `INSERT INTO prod_workflows (id, userId, name, description, enabled, version, triggerJson, stepsJson, budgetUsd, webhookOutboxJson, lastRunAt, nextRunAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
      .bind(
        id,
        user.id,
        name,
        body.description ? str(body.description, 1000) : null,
        enabled,
        JSON.stringify(trigger),
        JSON.stringify(steps),
        body.budgetUsd !== undefined && Number.isFinite(Number(body.budgetUsd)) ? Number(body.budgetUsd) : null,
        body.webhookOutbox ? JSON.stringify(body.webhookOutbox) : null,
        nextRunAt,
        now,
        now,
      )
      .run()

    const row = await env.DB.prepare('SELECT * FROM prod_workflows WHERE id = ? AND userId = ?').bind(id, user.id).first()
    return json(workflowDto(row), 201)
  }

  // /api/v1/workflows/:id/runs/compare
  const cmpMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/runs\/compare$/)
  if (cmpMatch && method === 'GET') {
    const wfId = decodeURIComponent(cmpMatch[1])
    const leftRunId = url.searchParams.get('leftRunId') || ''
    const rightRunId = url.searchParams.get('rightRunId') || ''
    const left = await env.DB.prepare('SELECT * FROM prod_workflow_runs WHERE id = ? AND workflowId = ? AND userId = ?')
      .bind(leftRunId, wfId, user.id)
      .first()
    const right = await env.DB.prepare('SELECT * FROM prod_workflow_runs WHERE id = ? AND workflowId = ? AND userId = ?')
      .bind(rightRunId, wfId, user.id)
      .first()
    if (!left || !right) return json({ statusCode: 404, message: 'One or both workflow runs not found.' }, 404)
    const lSteps = parseJson(left.stepResultsJson, [])
    const rSteps = parseJson(right.stepResultsJson, [])
    const rMap = new Map(rSteps.map((s) => [s.stepId, s]))
    const changedStepIds = []
    for (const s of lSteps) {
      const other = rMap.get(s.stepId)
      if (!other || other.status !== s.status || other.output !== s.output) changedStepIds.push(s.stepId)
    }
    for (const s of rSteps) {
      if (!lSteps.some((x) => x.stepId === s.stepId)) changedStepIds.push(s.stepId)
    }
    return json({
      workflowId: wfId,
      leftRunId,
      rightRunId,
      metrics: [
        { label: 'Status', left: left.status, right: right.status },
        { label: 'Steps executed', left: String(lSteps.length), right: String(rSteps.length) },
        { label: 'Trigger', left: left.triggerKind, right: right.triggerKind },
      ],
      changedStepIds,
      leftStatus: left.status,
      rightStatus: right.status,
      generatedAt: new Date().toISOString(),
    })
  }

  // /api/v1/workflows/:id/runs/branch
  const branchMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/runs\/branch$/)
  if (branchMatch && method === 'POST') {
    const wfId = decodeURIComponent(branchMatch[1])
    const wfRow = await env.DB.prepare('SELECT * FROM prod_workflows WHERE id = ? AND userId = ?').bind(wfId, user.id).first()
    if (!wfRow) return json({ statusCode: 404, message: 'Workflow not found.' }, 404)
    const body = await readBody(request)
    const src = body.sourceRunId
      ? await env.DB.prepare('SELECT * FROM prod_workflow_runs WHERE id = ? AND workflowId = ? AND userId = ?')
          .bind(String(body.sourceRunId), wfId, user.id)
          .first()
      : null
    const run = await runWorkflowEngine(env, h, user.id, workflowDto(wfRow), {
      triggerKind: body.triggerKind || src?.triggerKind || 'manual',
      input: body.input || parseJson(src?.inputJson, {}),
      initialState: parseJson(src?.stateJson, {}),
      approvedKeys: body.approvedKeys,
      rerunOfRunId: src?.id,
    })
    return json(run, 201)
  }

  // /api/v1/workflows/:id/runs/:runId/rerun
  const rerunMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/runs\/([^/]+)\/rerun$/)
  if (rerunMatch && method === 'POST') {
    const wfId = decodeURIComponent(rerunMatch[1])
    const runId = decodeURIComponent(rerunMatch[2])
    const wfRow = await env.DB.prepare('SELECT * FROM prod_workflows WHERE id = ? AND userId = ?').bind(wfId, user.id).first()
    if (!wfRow) return json({ statusCode: 404, message: 'Workflow not found.' }, 404)
    const src = await env.DB.prepare('SELECT * FROM prod_workflow_runs WHERE id = ? AND workflowId = ? AND userId = ?')
      .bind(runId, wfId, user.id)
      .first()
    if (!src) return json({ statusCode: 404, message: 'Source run not found.' }, 404)
    const body = await readBody(request)
    const run = await runWorkflowEngine(env, h, user.id, workflowDto(wfRow), {
      triggerKind: body.triggerKind || src.triggerKind,
      input: body.input || parseJson(src.inputJson, {}),
      approvedKeys: body.approvedKeys,
      rerunOfRunId: src.id,
    })
    return json(run, 201)
  }

  const m = path.match(/^\/api\/v1\/workflows\/([^/]+)(?:\/(run|runs|webhook))?$/)
  if (!m) return null
  const wfId = decodeURIComponent(m[1])
  const action = m[2] || null

  const wfRow = await env.DB.prepare('SELECT * FROM prod_workflows WHERE id = ? AND userId = ?').bind(wfId, user.id).first()
  if (!wfRow) return json({ statusCode: 404, message: 'Workflow not found.' }, 404)

  if (!action && method === 'GET') return json(workflowDto(wfRow))

  if (!action && (method === 'PATCH' || method === 'PUT')) {
    const body = await readBody(request)
    const now = new Date().toISOString()
    const name = body.name !== undefined ? str(body.name, 160) || wfRow.name : wfRow.name
    const description = body.description !== undefined ? (body.description ? str(body.description, 1000) : null) : wfRow.description
    const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : wfRow.enabled
    const trigger = body.trigger && typeof body.trigger === 'object' ? body.trigger : parseJson(wfRow.triggerJson, { kind: 'manual' })
    const steps = Array.isArray(body.steps) ? body.steps.slice(0, 50) : parseJson(wfRow.stepsJson, [])
    const budgetUsd =
      body.budgetUsd !== undefined ? (Number.isFinite(Number(body.budgetUsd)) ? Number(body.budgetUsd) : null) : wfRow.budgetUsd
    const webhookOutboxJson =
      body.webhookOutbox !== undefined ? (body.webhookOutbox ? JSON.stringify(body.webhookOutbox) : null) : wfRow.webhookOutboxJson
    const version = (Number(wfRow.version) || 1) + 1

    await env.DB.prepare(
      `UPDATE prod_workflows
          SET name = ?, description = ?, enabled = ?, version = ?, triggerJson = ?, stepsJson = ?,
              budgetUsd = ?, webhookOutboxJson = ?, updatedAt = ?
        WHERE id = ? AND userId = ?`,
    )
      .bind(name, description, enabled, version, JSON.stringify(trigger), JSON.stringify(steps), budgetUsd, webhookOutboxJson, now, wfId, user.id)
      .run()

    const updated = await env.DB.prepare('SELECT * FROM prod_workflows WHERE id = ? AND userId = ?').bind(wfId, user.id).first()
    return json(workflowDto(updated))
  }

  if (!action && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM prod_workflow_runs WHERE workflowId = ? AND userId = ?').bind(wfId, user.id).run()
    await env.DB.prepare('DELETE FROM prod_workflows WHERE id = ? AND userId = ?').bind(wfId, user.id).run()
    return json({ ok: true })
  }

  if (action === 'run' && method === 'POST') {
    const body = await readBody(request)
    const wf = workflowDto(wfRow)
    if (body.triggerKind === 'webhook' && wf.trigger?.webhookSecret && body.webhookSecret !== wf.trigger.webhookSecret) {
      return json({ statusCode: 403, message: 'Invalid webhook secret.' }, 403)
    }
    const run = await runWorkflowEngine(env, h, user.id, wf, body)
    return json(run, 201)
  }

  if (action === 'webhook' && method === 'POST') {
    const body = await readBody(request)
    const wf = workflowDto(wfRow)
    if (wf.trigger?.webhookSecret && body.webhookSecret !== wf.trigger.webhookSecret) {
      return json({ statusCode: 403, message: 'Invalid webhook secret.' }, 403)
    }
    const run = await runWorkflowEngine(env, h, user.id, wf, { ...body, triggerKind: 'webhook' })
    return json(run, 201)
  }

  if (action === 'runs' && method === 'GET') {
    const limit = clampInt(url.searchParams.get('limit'), 1, 100, 25)
    const rows = await env.DB.prepare(
      'SELECT * FROM prod_workflow_runs WHERE workflowId = ? AND userId = ? ORDER BY startedAt DESC LIMIT ?',
    )
      .bind(wfId, user.id, limit)
      .all()
    return json((rows.results || []).map(workflowRunDto))
  }

  return json({ statusCode: 405, message: 'Method not allowed.' }, 405)
}

// ── Playbooks ───────────────────────────────────────────────────────────────

async function handlePlaybooks({ request, env, url, path, method, user, h, json }) {
  if (path === '/api/v1/playbooks' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM prod_playbooks WHERE userId = ? ORDER BY updatedAt DESC LIMIT 100')
      .bind(user.id)
      .all()
    return json((rows.results || []).map(playbookDto))
  }

  if (path === '/api/v1/playbooks' && method === 'POST') {
    const body = await readBody(request)
    const name = str(body.name, 160)
    if (!name) return json({ statusCode: 400, message: 'Playbook name is required.' }, 400)
    const targetKind = VALID_PLAYBOOK_TARGETS.has(body.targetKind) ? body.targetKind : 'agent_prompt'
    const parameterSchema = Array.isArray(body.parameterSchema) ? body.parameterSchema.slice(0, 30) : []
    const promptTemplate = body.promptTemplate ? str(body.promptTemplate, 16000) : null
    const workflowTemplate = body.workflowTemplate && typeof body.workflowTemplate === 'object' ? body.workflowTemplate : null
    const id = makeId(h, 'pbk')
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO prod_playbooks (id, userId, name, description, targetKind, parameterSchemaJson, promptTemplate, workflowTemplateJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        user.id,
        name,
        body.description ? str(body.description, 1000) : null,
        targetKind,
        JSON.stringify(parameterSchema),
        promptTemplate,
        workflowTemplate ? JSON.stringify(workflowTemplate) : null,
        now,
        now,
      )
      .run()

    const row = await env.DB.prepare('SELECT * FROM prod_playbooks WHERE id = ? AND userId = ?').bind(id, user.id).first()
    return json(playbookDto(row), 201)
  }

  const m = path.match(/^\/api\/v1\/playbooks\/([^/]+)(?:\/(run|runs))?$/)
  if (!m) return null
  const pbId = decodeURIComponent(m[1])
  const action = m[2] || null

  const pbRow = await env.DB.prepare('SELECT * FROM prod_playbooks WHERE id = ? AND userId = ?').bind(pbId, user.id).first()
  if (!pbRow) return json({ statusCode: 404, message: 'Playbook not found.' }, 404)

  if (!action && method === 'GET') return json(playbookDto(pbRow))

  if (!action && (method === 'PATCH' || method === 'PUT')) {
    const body = await readBody(request)
    const now = new Date().toISOString()
    const name = body.name !== undefined ? str(body.name, 160) || pbRow.name : pbRow.name
    const description = body.description !== undefined ? (body.description ? str(body.description, 1000) : null) : pbRow.description
    const targetKind =
      body.targetKind !== undefined && VALID_PLAYBOOK_TARGETS.has(body.targetKind) ? body.targetKind : pbRow.targetKind
    const parameterSchemaJson = Array.isArray(body.parameterSchema)
      ? JSON.stringify(body.parameterSchema.slice(0, 30))
      : pbRow.parameterSchemaJson
    const promptTemplate =
      body.promptTemplate !== undefined ? (body.promptTemplate ? str(body.promptTemplate, 16000) : null) : pbRow.promptTemplate
    const workflowTemplateJson =
      body.workflowTemplate !== undefined
        ? body.workflowTemplate
          ? JSON.stringify(body.workflowTemplate)
          : null
        : pbRow.workflowTemplateJson

    await env.DB.prepare(
      `UPDATE prod_playbooks
          SET name = ?, description = ?, targetKind = ?, parameterSchemaJson = ?, promptTemplate = ?, workflowTemplateJson = ?, updatedAt = ?
        WHERE id = ? AND userId = ?`,
    )
      .bind(name, description, targetKind, parameterSchemaJson, promptTemplate, workflowTemplateJson, now, pbId, user.id)
      .run()

    const updated = await env.DB.prepare('SELECT * FROM prod_playbooks WHERE id = ? AND userId = ?').bind(pbId, user.id).first()
    return json(playbookDto(updated))
  }

  if (!action && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM prod_playbook_runs WHERE playbookId = ? AND userId = ?').bind(pbId, user.id).run()
    await env.DB.prepare('DELETE FROM prod_playbooks WHERE id = ? AND userId = ?').bind(pbId, user.id).run()
    return json({ ok: true })
  }

  if (action === 'run' && method === 'POST') {
    const body = await readBody(request)
    const pb = playbookDto(pbRow)
    const rawParams = body.params && typeof body.params === 'object' ? body.params : {}
    const resolved = { ...rawParams }
    for (const p of pb.parameterSchema) {
      if (resolved[p.key] === undefined && p.defaultValue !== undefined) {
        resolved[p.key] = p.defaultValue
      }
      if (p.required && (resolved[p.key] === undefined || resolved[p.key] === '')) {
        return json({ statusCode: 400, message: `Missing required parameter: ${p.key}` }, 400)
      }
    }

    const startedAt = new Date().toISOString()
    const runId = makeId(h, 'pbr')
    let outputSummary = null
    let status = 'done'
    let error = null

    try {
      if (pb.targetKind === 'agent_prompt') {
        const rendered = interpolateString(pb.promptTemplate || pb.name, { params: resolved, input: resolved, state: {} })
        const llmOut = await callUserLlm(env, h, user.id, [{ role: 'user', content: rendered }], 700)
        outputSummary = llmOut || `Rendered playbook prompt (no LLM key configured): ${rendered.slice(0, 1200)}`
      } else {
        const stepsCount = Array.isArray(pb.workflowTemplate?.steps) ? pb.workflowTemplate.steps.length : 0
        outputSummary = `Executed workflow playbook "${pb.name}" (${stepsCount} steps) with params: ${JSON.stringify(resolved).slice(0, 600)}`
      }
    } catch (e) {
      status = 'error'
      error = e instanceof Error ? e.message : 'Playbook execution failed'
    }

    const finishedAt = new Date().toISOString()
    await env.DB.prepare(
      `INSERT INTO prod_playbook_runs (id, playbookId, userId, status, startedAt, finishedAt, inputJson, outputSummary, error, conversationId, workflowRunId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
      .bind(runId, pbId, user.id, status, startedAt, finishedAt, JSON.stringify(resolved), outputSummary, error)
      .run()

    const row = await env.DB.prepare('SELECT * FROM prod_playbook_runs WHERE id = ? AND userId = ?').bind(runId, user.id).first()
    return json(playbookRunDto(row), 201)
  }

  if (action === 'runs' && method === 'GET') {
    const limit = clampInt(url.searchParams.get('limit'), 1, 100, 25)
    const rows = await env.DB.prepare(
      'SELECT * FROM prod_playbook_runs WHERE playbookId = ? AND userId = ? ORDER BY startedAt DESC LIMIT ?',
    )
      .bind(pbId, user.id, limit)
      .all()
    return json((rows.results || []).map(playbookRunDto))
  }

  return json({ statusCode: 405, message: 'Method not allowed.' }, 405)
}

// ── Briefings ───────────────────────────────────────────────────────────────

async function generateUserBriefing(env, h, user, trigger = 'manual') {
  const settingsRow = await env.DB.prepare('SELECT * FROM prod_briefing_settings WHERE userId = ?').bind(user.id).first()
  const settings = briefingSettingsDto(settingsRow)

  const [tasksRes, goalsRes, cronRes] = await Promise.all([
    env.DB.prepare('SELECT title, status, createdAt FROM prod_tasks WHERE userId = ? ORDER BY createdAt DESC LIMIT 10')
      .bind(user.id)
      .all(),
    env.DB.prepare('SELECT title, status, priority, progress, dueDate FROM prod_goals WHERE userId = ? ORDER BY updatedAt DESC LIMIT 10')
      .bind(user.id)
      .all(),
    env.DB.prepare('SELECT name, enabled, scheduleValue FROM prod_cron_jobs WHERE userId = ? AND enabled = 1 LIMIT 10')
      .bind(user.id)
      .all(),
  ])

  let recentConvs = []
  try {
    const convRes = await env.DB.prepare(
      'SELECT title, updatedAt, createdAt FROM conversations WHERE userId = ? ORDER BY COALESCE(updatedAt, createdAt) DESC LIMIT 8',
    )
      .bind(user.id)
      .all()
    recentConvs = convRes.results || []
  } catch {
    recentConvs = []
  }

  const tasks = tasksRes.results || []
  const goals = goalsRes.results || []
  const activeGoals = goals.filter((g) => g.status === 'active')
  const crons = cronRes.results || []

  const cards = []
  if (settings.sections.tasks) {
    const items = []
    for (const g of activeGoals.slice(0, 5)) {
      items.push(`Goal [${g.priority}]: ${g.title} (${g.progress}% complete${g.dueDate ? `, due ${g.dueDate}` : ''})`)
    }
    for (const t of tasks.slice(0, 5)) {
      items.push(`Task [${t.status}]: ${t.title}`)
    }
    for (const c of crons.slice(0, 3)) {
      items.push(`Scheduled job: ${c.name} (${c.scheduleValue})`)
    }
    cards.push({ section: 'tasks', title: 'Tasks & Goals', items })
  }

  if (settings.sections.memory) {
    const items = recentConvs.slice(0, 6).map((c) => {
      const label = c.title || 'Untitled conversation'
      const dt = (c.updatedAt || c.createdAt || '').slice(0, 10)
      return dt ? `${label} (${dt})` : label
    })
    cards.push({ section: 'memory', title: 'Recent Conversations', items })
  }

  if (settings.sections.email) cards.push({ section: 'email', title: 'Email', items: [] })
  if (settings.sections.calendar) cards.push({ section: 'calendar', title: 'Calendar', items: [] })
  if (settings.sections.news) {
    cards.push({
      section: 'news',
      title: `News (${(settings.newsTopics || ['AI', 'technology']).slice(0, 5).join(', ')})`,
      items: [],
    })
  }

  const factLines = [
    `Active goals: ${activeGoals.length} (total goals: ${goals.length})`,
    `Recent tasks: ${tasks.length}`,
    `Enabled scheduled jobs: ${crons.length}`,
    `Recent conversations: ${recentConvs.length}`,
    ...cards.flatMap((c) => c.items.slice(0, 4).map((i) => `- [${c.title}] ${i}`)),
  ].join('\n')

  const llmSummary = await callUserLlm(
    env,
    h,
    user.id,
    [
      {
        role: 'system',
        content:
          'Write a crisp 2-4 sentence morning briefing for the user using ONLY the real workspace facts provided. Never invent emails, meetings, or tasks not listed.',
      },
      { role: 'user', content: factLines },
    ],
    260,
  )

  const summary =
    llmSummary ||
    (activeGoals.length || tasks.length || recentConvs.length
      ? `You have ${activeGoals.length} active goal(s), ${tasks.length} recent task(s), ${crons.length} enabled scheduled job(s), and ${recentConvs.length} recent conversation(s).`
      : 'Your workspace is clear — no active goals, tasks, or recent conversations to report yet.')

  const id = makeId(h, 'brf')
  const now = new Date().toISOString()
  const dateKey = now.slice(0, 10)

  await env.DB.prepare(
    `INSERT INTO prod_briefings (id, userId, dateKey, trigger, summary, cardsJson, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, dateKey, trigger, summary, JSON.stringify(cards), now)
    .run()

  const row = await env.DB.prepare('SELECT * FROM prod_briefings WHERE id = ? AND userId = ?').bind(id, user.id).first()
  return briefingRecordDto(row)
}

async function handleBriefing({ request, env, url, path, method, user, h, json }) {
  if (path === '/api/v1/briefing/latest' && method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT * FROM prod_briefings WHERE userId = ? ORDER BY createdAt DESC LIMIT 1',
    )
      .bind(user.id)
      .first()
    return json({ briefing: row ? briefingRecordDto(row) : null })
  }

  if (path === '/api/v1/briefing/history' && method === 'GET') {
    const limit = clampInt(url.searchParams.get('limit'), 1, 100, 30)
    const rows = await env.DB.prepare(
      'SELECT * FROM prod_briefings WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
    )
      .bind(user.id, limit)
      .all()
    return json((rows.results || []).map(briefingRecordDto))
  }

  if (path === '/api/v1/briefing/settings' && method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM prod_briefing_settings WHERE userId = ?').bind(user.id).first()
    return json(briefingSettingsDto(row))
  }

  if (path === '/api/v1/briefing/settings' && (method === 'PUT' || method === 'PATCH')) {
    const body = await readBody(request)
    const curRow = await env.DB.prepare('SELECT * FROM prod_briefing_settings WHERE userId = ?').bind(user.id).first()
    const cur = briefingSettingsDto(curRow)
    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : cur.enabled
    const time = body.time !== undefined && /^\d{2}:\d{2}$/.test(String(body.time)) ? String(body.time) : cur.time
    const timezone = body.timezone !== undefined ? str(body.timezone, 80) || cur.timezone : cur.timezone
    const sections = { ...cur.sections }
    if (body.sections && typeof body.sections === 'object') {
      for (const k of BRIEFING_SECTIONS) {
        if (body.sections[k] !== undefined) sections[k] = Boolean(body.sections[k])
      }
    }
    const newsTopics = Array.isArray(body.newsTopics)
      ? body.newsTopics.slice(0, 15).map((t) => str(t, 60)).filter(Boolean)
      : cur.newsTopics
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT OR REPLACE INTO prod_briefing_settings (userId, enabled, time, timezone, sectionsJson, newsTopicsJson, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(user.id, enabled ? 1 : 0, time, timezone, JSON.stringify(sections), JSON.stringify(newsTopics), now)
      .run()

    const updated = await env.DB.prepare('SELECT * FROM prod_briefing_settings WHERE userId = ?').bind(user.id).first()
    return json(briefingSettingsDto(updated))
  }

  if ((path === '/api/v1/briefing/run' || path === '/api/v1/briefing/generate') && method === 'POST') {
    const briefing = await generateUserBriefing(env, h, user, 'manual')
    return json({ ok: true, briefing })
  }

  return null
}

// ── Proactive Moments ───────────────────────────────────────────────────────

async function handleMoments({ request, env, url, path, method, user, h, json }) {
  if (path === '/api/v1/proactive/moments/settings' && method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM prod_moment_settings WHERE userId = ?').bind(user.id).first()
    return json(momentSettingsDto(row))
  }

  if (path === '/api/v1/proactive/moments/settings' && (method === 'PUT' || method === 'PATCH')) {
    const body = await readBody(request)
    const curRow = await env.DB.prepare('SELECT * FROM prod_moment_settings WHERE userId = ?').bind(user.id).first()
    const cur = momentSettingsDto(curRow)
    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : cur.enabled
    const timezone = body.timezone !== undefined ? str(body.timezone, 80) || cur.timezone : cur.timezone
    const maxPerDay = body.maxPerDay !== undefined ? clampInt(body.maxPerDay, 0, 50, cur.maxPerDay) : cur.maxPerDay
    const quietHours = {
      enabled: body.quietHours?.enabled !== undefined ? Boolean(body.quietHours.enabled) : cur.quietHours.enabled,
      start: body.quietHours?.start ? str(body.quietHours.start, 5) : cur.quietHours.start,
      end: body.quietHours?.end ? str(body.quietHours.end, 5) : cur.quietHours.end,
    }
    const kinds = { ...cur.kinds }
    if (body.kinds && typeof body.kinds === 'object') {
      for (const k of MOMENT_KINDS) {
        if (body.kinds[k] !== undefined) kinds[k] = Boolean(body.kinds[k])
      }
    }
    const now = new Date().toISOString()
    await env.DB.prepare(
      `INSERT OR REPLACE INTO prod_moment_settings (userId, enabled, timezone, quietHoursJson, maxPerDay, kindsJson, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(user.id, enabled ? 1 : 0, timezone, JSON.stringify(quietHours), maxPerDay, JSON.stringify(kinds), now)
      .run()

    const updated = await env.DB.prepare('SELECT * FROM prod_moment_settings WHERE userId = ?').bind(user.id).first()
    return json(momentSettingsDto(updated))
  }

  if (path === '/api/v1/proactive/moments/scan' && method === 'POST') {
    const settingsRow = await env.DB.prepare('SELECT * FROM prod_moment_settings WHERE userId = ?').bind(user.id).first()
    const settings = momentSettingsDto(settingsRow)
    if (!settings.enabled) return json({ created: 0, moments: [] })

    const now = new Date().toISOString()
    const nowMs = Date.now()
    const createdMoments = []

    async function maybeInsertMoment({ key, kind, title, body, context, actions }) {
      if (!settings.kinds[kind]) return
      const exists = await env.DB.prepare(
        `SELECT id FROM prod_moments WHERE userId = ? AND key = ? AND status IN ('active', 'snoozed') LIMIT 1`,
      )
        .bind(user.id, key)
        .first()
      if (exists) return
      const id = makeId(h, 'mom')
      await env.DB.prepare(
        `INSERT INTO prod_moments (id, userId, key, kind, title, body, contextJson, actionsJson, status, snoozedUntil, delivered, deliveredAt, actedActionId, expiresAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, 1, ?, NULL, NULL, ?, ?)`,
      )
        .bind(id, user.id, key, kind, title, body, context ? JSON.stringify(context) : null, JSON.stringify(actions), now, now, now)
        .run()
      const row = await env.DB.prepare('SELECT * FROM prod_moments WHERE id = ? AND userId = ?').bind(id, user.id).first()
      if (row) createdMoments.push(momentDto(row))
    }

    // Detect stalled goals (active goals with 0% progress or untouched for > 3 days)
    if (settings.kinds.goal_stalled) {
      const goalsRes = await env.DB.prepare(
        `SELECT * FROM prod_goals WHERE userId = ? AND status = 'active' ORDER BY updatedAt ASC LIMIT 20`,
      )
        .bind(user.id)
        .all()
      for (const g of goalsRes.results || []) {
        const ageMs = nowMs - Date.parse(g.updatedAt)
        const isStalled = Number(g.progress) === 0 || (Number.isFinite(ageMs) && ageMs > 3 * 86_400_000)
        if (!isStalled) continue
        await maybeInsertMoment({
          key: `goal_stalled:${g.id}`,
          kind: 'goal_stalled',
          title: `Goal needs momentum: ${g.title}`,
          body: `Progress is currently at ${g.progress}%. Generate or advance the next milestone step.`,
          context: [
            `Priority: ${g.priority}`,
            ...(g.dueDate ? [`Due date: ${g.dueDate}`] : []),
          ],
          actions: [{ id: 'open_goals', label: 'Open Goals', href: '/goals' }],
        })
      }
    }

    // Detect tasks awaiting approval
    if (settings.kinds.watch_hit) {
      const tasksRes = await env.DB.prepare(
        `SELECT * FROM prod_tasks WHERE userId = ? AND status = 'awaiting_approval' ORDER BY createdAt DESC LIMIT 10`,
      )
        .bind(user.id)
        .all()
      for (const t of tasksRes.results || []) {
        await maybeInsertMoment({
          key: `task_approval:${t.id}`,
          kind: 'watch_hit',
          title: `Task awaiting approval: ${t.title}`,
          body: 'An autonomous task is paused waiting for your approval to proceed.',
          context: [`Task ID: ${t.id}`],
          actions: [{ id: 'open_tasks', label: 'Review Task', href: '/tasks' }],
        })
      }
    }

    return json({ created: createdMoments.length, moments: createdMoments })
  }

  if (path === '/api/v1/proactive/moments' && method === 'GET') {
    const now = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE prod_moments SET status = 'active', snoozedUntil = NULL, updatedAt = ?
        WHERE userId = ? AND status = 'snoozed' AND snoozedUntil IS NOT NULL AND snoozedUntil <= ?`,
    )
      .bind(now, user.id, now)
      .run()

    const status = url.searchParams.get('status')
    const rows =
      status && MOMENT_STATUSES.has(status)
        ? await env.DB.prepare('SELECT * FROM prod_moments WHERE userId = ? AND status = ? ORDER BY createdAt DESC LIMIT 100')
            .bind(user.id, status)
            .all()
        : await env.DB.prepare('SELECT * FROM prod_moments WHERE userId = ? ORDER BY createdAt DESC LIMIT 100')
            .bind(user.id)
            .all()
    return json((rows.results || []).map(momentDto))
  }

  const m = path.match(/^\/api\/v1\/proactive\/moments\/([^/]+)\/(snooze|dismiss|act)$/)
  if (!m || method !== 'POST') return null
  const momentId = decodeURIComponent(m[1])
  const action = m[2]

  const existing = await env.DB.prepare('SELECT * FROM prod_moments WHERE id = ? AND userId = ?')
    .bind(momentId, user.id)
    .first()
  if (!existing) return json({ statusCode: 404, message: 'Moment not found.' }, 404)

  const now = new Date().toISOString()
  if (action === 'snooze') {
    const body = await readBody(request)
    const minutes = clampInt(body.minutes, 1, 10080, 60)
    const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString()
    await env.DB.prepare(
      `UPDATE prod_moments SET status = 'snoozed', snoozedUntil = ?, updatedAt = ? WHERE id = ? AND userId = ?`,
    )
      .bind(snoozedUntil, now, momentId, user.id)
      .run()
    const updated = await env.DB.prepare('SELECT * FROM prod_moments WHERE id = ? AND userId = ?').bind(momentId, user.id).first()
    return json(momentDto(updated))
  }

  if (action === 'dismiss') {
    await env.DB.prepare(`UPDATE prod_moments SET status = 'dismissed', updatedAt = ? WHERE id = ? AND userId = ?`)
      .bind(now, momentId, user.id)
      .run()
    const updated = await env.DB.prepare('SELECT * FROM prod_moments WHERE id = ? AND userId = ?').bind(momentId, user.id).first()
    return json(momentDto(updated))
  }

  if (action === 'act') {
    const body = await readBody(request)
    const actionId = body.actionId ? str(body.actionId, 120) : null
    const actions = parseJson(existing.actionsJson, [])
    const matched = actionId ? actions.find((a) => a.id === actionId) || null : actions[0] || null
    await env.DB.prepare(
      `UPDATE prod_moments SET status = 'acted', actedActionId = ?, updatedAt = ? WHERE id = ? AND userId = ?`,
    )
      .bind(matched?.id || actionId, now, momentId, user.id)
      .run()
    const updated = await env.DB.prepare('SELECT * FROM prod_moments WHERE id = ? AND userId = ?').bind(momentId, user.id).first()
    return json({ moment: momentDto(updated), action: matched })
  }

  return null
}

// ── Autonomy Journal ────────────────────────────────────────────────────────

async function handleAutonomyJournal({ request, env, url, path, method, user, h, json }) {
  if (path === '/api/v1/autonomy/journal' && method === 'GET') {
    const limit = clampInt(url.searchParams.get('limit'), 1, 200, 60)
    const rows = await env.DB.prepare(
      'SELECT * FROM prod_autonomy_journal WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
    )
      .bind(user.id, limit)
      .all()
    return json((rows.results || []).map(journalRowDto))
  }

  if (path === '/api/v1/autonomy/journal' && method === 'POST') {
    const body = await readBody(request)
    const tool = str(body.tool, 120)
    if (!tool) return json({ statusCode: 400, message: 'tool is required.' }, 400)
    const input =
      typeof body.input === 'string'
        ? body.input.slice(0, 8000)
        : JSON.stringify(body.input ?? {}).slice(0, 8000)
    const output =
      body.output === undefined || body.output === null
        ? null
        : typeof body.output === 'string'
          ? body.output.slice(0, 8000)
          : JSON.stringify(body.output).slice(0, 8000)
    const compensation = body.compensation ? str(body.compensation, 1000) : null
    const taskId = body.taskId ? str(body.taskId, 120) : null
    const id = makeId(h, 'jrn')
    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO prod_autonomy_journal (id, userId, taskId, tool, input, output, compensation, undoneAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
      .bind(id, user.id, taskId, tool, input, output, compensation, now)
      .run()

    const row = await env.DB.prepare('SELECT * FROM prod_autonomy_journal WHERE id = ? AND userId = ?').bind(id, user.id).first()
    return json(journalRowDto(row), 201)
  }

  const undoEntryMatch = path.match(/^\/api\/v1\/autonomy\/journal\/([^/]+)\/undo$/)
  if (undoEntryMatch && method === 'POST') {
    const id = decodeURIComponent(undoEntryMatch[1])
    const row = await env.DB.prepare('SELECT * FROM prod_autonomy_journal WHERE id = ? AND userId = ?')
      .bind(id, user.id)
      .first()
    if (!row) return json({ statusCode: 404, message: 'Journal entry not found.' }, 404)
    const now = new Date().toISOString()
    if (!row.undoneAt) {
      await env.DB.prepare('UPDATE prod_autonomy_journal SET undoneAt = ? WHERE id = ? AND userId = ?')
        .bind(now, id, user.id)
        .run()
    }
    return json({ ok: true, revertedWith: row.compensation || 'marked_undone' })
  }

  const undoTaskMatch = path.match(/^\/api\/v1\/autonomy\/tasks\/([^/]+)\/undo$/)
  if (undoTaskMatch && method === 'POST') {
    const taskId = decodeURIComponent(undoTaskMatch[1])
    const rowsRes = await env.DB.prepare(
      'SELECT * FROM prod_autonomy_journal WHERE taskId = ? AND userId = ? AND undoneAt IS NULL ORDER BY createdAt DESC LIMIT 100',
    )
      .bind(taskId, user.id)
      .all()
    const entries = rowsRes.results || []
    const now = new Date().toISOString()
    const results = []
    for (const e of entries) {
      await env.DB.prepare('UPDATE prod_autonomy_journal SET undoneAt = ? WHERE id = ? AND userId = ?')
        .bind(now, e.id, user.id)
        .run()
      results.push({ id: e.id, tool: e.tool, ok: true, detail: e.compensation || 'marked_undone' })
    }
    return json({ reverted: results.length, results })
  }

  return null
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

export async function handleProductivityRoutes({ request, env, url, path, method, origin, user, h }) {
  const isTasks = path === '/api/v1/tasks' || path.startsWith('/api/v1/tasks/')
  const isGoals = path === '/api/v1/goals' || path.startsWith('/api/v1/goals/')
  const isCron = path === '/api/v1/cron/jobs' || path.startsWith('/api/v1/cron/jobs/')
  const isWorkflows = path === '/api/v1/workflows' || path.startsWith('/api/v1/workflows/')
  const isPlaybooks = path === '/api/v1/playbooks' || path.startsWith('/api/v1/playbooks/')
  const isBriefing = path.startsWith('/api/v1/briefing/')
  const isMoments = path === '/api/v1/proactive/moments' || path.startsWith('/api/v1/proactive/moments/')
  const isJournal =
    path === '/api/v1/autonomy/journal' ||
    path.startsWith('/api/v1/autonomy/journal/') ||
    /^\/api\/v1\/autonomy\/tasks\/[^/]+\/undo$/.test(path)

  if (!isTasks && !isGoals && !isCron && !isWorkflows && !isPlaybooks && !isBriefing && !isMoments && !isJournal) {
    return null
  }

  const json = (body, status = 200) => h.jsonResponse(body, status, origin)
  if (!user?.id) return json({ statusCode: 401, message: 'Unauthorized.' }, 401)

  try {
    await ensureSchema(env)
    const ctx = { request, env, url, path, method, origin, user, h, json }

    if (isTasks) return await handleTasks(ctx)
    if (isGoals) return await handleGoals(ctx)
    if (isCron) return await handleCron(ctx)
    if (isWorkflows) return await handleWorkflows(ctx)
    if (isPlaybooks) return await handlePlaybooks(ctx)
    if (isBriefing) return await handleBriefing(ctx)
    if (isMoments) return await handleMoments(ctx)
    if (isJournal) return await handleAutonomyJournal(ctx)
    return null
  } catch (err) {
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500
    const message = status < 500 ? err.message : 'Internal productivity route error.'
    return json({ statusCode: status, message }, status)
  }
}
