#!/usr/bin/env node
// Signed-in end-to-end smoke test for the OpenAgents cloud API.
// Usage: BASE_URL=https://openagents.us node scripts/e2e-smoke.mjs
// Safety: only touches a freshly registered throwaway account (e2e+<timestamp>@openagents.us)
// and deletes that account at the end (also attempted on failure).

const BASE = (process.env.BASE_URL || 'https://openagents.us').replace(/\/$/, '')
const stamp = Date.now()
const email = `e2e+${stamp}@openagents.us`
const password = `E2e!${stamp}-${Math.random().toString(36).slice(2, 10)}`
let token = ''
const results = []

async function api(method, path, body, { auth = true } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  return { status: res.status, json, text }
}

async function step(name, fn, { optional = false } = {}) {
  const t0 = Date.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, optional, ms: Date.now() - t0, detail: detail || '' })
    return true
  } catch (e) {
    results.push({ name, ok: false, optional, ms: Date.now() - t0, detail: String(e?.message || e).slice(0, 140) })
    return false
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}

const st = (r) => `HTTP ${r.status}${r.json?.message ? ` – ${r.json.message}` : ''}`

async function main() {
  console.log(`E2E smoke against ${BASE} as ${email}\n`)
  let avatarId = null
  let registered = false

  await step('health', async () => {
    const r = await api('GET', '/api/v1/health', undefined, { auth: false })
    expect(r.status === 200 && r.json?.status === 'ok', st(r))
  })

  registered = await step('auth/register', async () => {
    const r = await api('POST', '/api/v1/auth/register', { email, password, name: 'E2E Smoke' }, { auth: false })
    expect(r.status === 201 || r.status === 200, st(r))
    token = r.json?.tokens?.accessToken || ''
    expect(token, 'no access token returned')
  })
  if (!registered) return finish()

  await step('auth/login', async () => {
    const r = await api('POST', '/api/v1/auth/login', { email, password }, { auth: false })
    expect(r.status === 200, st(r))
    const t = r.json?.tokens?.accessToken || r.json?.accessToken
    expect(t, 'no access token returned')
    token = t
  })

  await step('auth/me', async () => {
    const r = await api('GET', '/api/v1/auth/me')
    expect(r.status === 200 && r.json?.email?.toLowerCase() === email, st(r))
  })

  await step('conversations create', async () => {
    const r = await api('POST', '/api/v1/conversations', { title: 'E2E smoke' })
    expect(r.status === 200 || r.status === 201, st(r))
    expect(r.json?.id, 'no conversation id')
  })

  await step('conversations list', async () => {
    const r = await api('GET', '/api/v1/conversations')
    expect(r.status === 200, st(r))
    const list = Array.isArray(r.json) ? r.json : r.json?.data || r.json?.items || r.json?.conversations || []
    expect(list.some((c) => c.title === 'E2E smoke'), 'created conversation not in list')
    return `${list.length} item(s)`
  })

  await step('avatars create', async () => {
    const r = await api('POST', '/api/v1/avatars', { name: 'E2E Avatar', description: 'smoke test' })
    expect(r.status === 200 || r.status === 201, st(r))
    avatarId = r.json?.id
    expect(avatarId, 'no avatar id')
  })

  await step('avatars list', async () => {
    const r = await api('GET', '/api/v1/avatars')
    expect(r.status === 200 && Array.isArray(r.json), st(r))
    expect(r.json.some((a) => a.id === avatarId), 'avatar missing from list')
  })

  await step('avatars patch', async () => {
    expect(avatarId, 'no avatar')
    const r = await api('PATCH', `/api/v1/avatars/${avatarId}`, { name: 'E2E Avatar Renamed' })
    expect(r.status === 200 && r.json?.name === 'E2E Avatar Renamed', st(r))
  })

  // New features (expected to fail until the new Worker is deployed)
  await step(
    'avatars share + public page [new]',
    async () => {
      expect(avatarId, 'no avatar')
      const slug = `e2e-${stamp}`
      const r = await api('POST', `/api/v1/avatars/${avatarId}/share`, { enabled: true, slug, dailyCap: 5 })
      expect(r.status === 200 && r.json?.enabled, st(r))
      const p = await api('GET', `/api/v1/public/avatars/${slug}`, undefined, { auth: false })
      expect(p.status === 200 && p.json?.name === 'E2E Avatar Renamed', `public ${st(p)}`)
    },
    { optional: true },
  )

  await step(
    'billing/plan [new]',
    async () => {
      const r = await api('GET', '/api/v1/billing/plan')
      expect(r.status === 200 && r.json?.plan, st(r))
      return `plan=${r.json.plan} configured=${r.json.configured}`
    },
    { optional: true },
  )

  await step('avatars delete', async () => {
    expect(avatarId, 'no avatar')
    const r = await api('DELETE', `/api/v1/avatars/${avatarId}`)
    expect(r.status === 200 || r.status === 204, st(r))
    const l = await api('GET', '/api/v1/avatars')
    expect(Array.isArray(l.json) && !l.json.some((a) => a.id === avatarId), 'avatar still listed')
    avatarId = null
  })

  await step('life/tts/status', async () => {
    const r = await api('GET', '/api/v1/life/tts/status')
    expect(r.status === 200 && typeof r.json?.configured === 'boolean', st(r))
    return `configured=${r.json.configured}`
  })

  await step('password reset request', async () => {
    const r = await api('POST', '/api/v1/auth/forgot-password', { email }, { auth: false })
    expect(r.status === 200 || r.status === 202, st(r))
  })

  await step('GDPR export', async () => {
    const r = await api('GET', '/api/v1/users/me/export')
    expect(r.status === 200 && r.json?.user && Array.isArray(r.json?.conversations), st(r))
    expect(!/apiKey"\s*:\s*"[^"]/.test(r.text), 'export appears to contain key material')
  })

  return finish()
}

async function finish() {
  if (token) {
    await step('GDPR delete account', async () => {
      const r = await api('DELETE', '/api/v1/users/me', { password })
      expect(r.status === 200, st(r))
      const me = await api('GET', '/api/v1/auth/me')
      expect(me.status === 401 || me.status === 404, `account still accessible (${me.status})`)
    })
  }

  const w = Math.max(...results.map((r) => r.name.length), 10)
  console.log(`${'STEP'.padEnd(w)}  RESULT  ${'MS'.padStart(6)}  DETAIL`)
  console.log('-'.repeat(w + 30))
  for (const r of results) {
    const label = r.ok ? 'PASS' : r.optional ? 'WARN' : 'FAIL'
    console.log(`${r.name.padEnd(w)}  ${label.padEnd(6)}  ${String(r.ms).padStart(6)}  ${r.detail}`)
  }
  const failed = results.filter((r) => !r.ok && !r.optional)
  const warned = results.filter((r) => !r.ok && r.optional)
  console.log(`\n${results.length - failed.length - warned.length} passed, ${failed.length} failed, ${warned.length} warning(s) (new, possibly undeployed features)`)
  process.exit(failed.length ? 1 : 0)
}

main().catch(async (e) => {
  results.push({ name: 'unexpected error', ok: false, ms: 0, detail: String(e?.message || e) })
  await finish()
})
