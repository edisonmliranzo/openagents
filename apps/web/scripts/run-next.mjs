#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { networkInterfaces } from 'node:os'
import process from 'node:process'

const require = createRequire(import.meta.url)

const mode = (process.argv[2] ?? 'dev').trim().toLowerCase()
const printOnly = process.argv.includes('--print-only')

if (mode !== 'dev' && mode !== 'start') {
  console.error(`[openagents:web] Invalid mode "${mode}". Use "dev" or "start".`)
  process.exit(1)
}

const webPort = `${process.env.WEB_PORT ?? process.env.PORT ?? '3000'}`.trim() || '3000'
const apiPort = `${process.env.API_PORT ?? '3001'}`.trim() || '3001'
const webHost = `${process.env.WEB_HOST ?? '0.0.0.0'}`.trim() || '0.0.0.0'
const explicitApiUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ''}`.trim()
const apiUrl = explicitApiUrl || `http://localhost:${apiPort}`

const normalizeBase = (value) => value.replace(/\/+$/, '')
const publicLoginUrl = (() => {
  const direct = `${process.env.PUBLIC_LOGIN_URL ?? ''}`.trim()
  if (direct) return direct

  const base = `${process.env.PUBLIC_BASE_URL ?? ''}`.trim()
  if (base) return `${normalizeBase(base)}/login`

  return ''
})()

function getLanLoginUrls(port) {
  const seen = new Set()
  const urls = []
  const interfaces = networkInterfaces()

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      const url = `http://${entry.address}:${port}/login`
      if (seen.has(url)) continue
      seen.add(url)
      urls.push(url)
    }
  }

  return urls
}

console.log(`[openagents:web] mode=${mode} host=${webHost} port=${webPort}`)
console.log(`[openagents:web] api=${apiUrl}`)
console.log(`[openagents:web] login(local): http://localhost:${webPort}/login`)

for (const url of getLanLoginUrls(webPort)) {
  console.log(`[openagents:web] login(lan): ${url}`)
}

if (publicLoginUrl) {
  console.log(`[openagents:web] login(public): ${publicLoginUrl}`)
} else {
  console.log('[openagents:web] Set PUBLIC_LOGIN_URL to print your external login URL on every start.')
}

if (printOnly) {
  process.exit(0)
}

const nextBin = require.resolve('next/dist/bin/next')
const env = {
  ...process.env,
  NEXT_PUBLIC_API_URL: apiUrl,
}

const result = spawnSync(
  process.execPath,
  [nextBin, mode, '-H', webHost, '-p', webPort],
  { stdio: 'inherit', env },
)

if (result.error) {
  console.error(`[openagents:web] Failed to start Next.js: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
