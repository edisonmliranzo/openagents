#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const args = new Set(process.argv.slice(2))
const jsonMode = args.has('--json')
const showHelp = args.has('--help') || args.has('-h')

if (showHelp) {
  console.log(`OpenAgents doctor

Usage:
  node scripts/doctor.mjs [--json]

Checks:
  - Node.js and pnpm availability
  - workspace dependencies installed
  - required env files present
  - Docker Compose availability
  - local web login page reachability
  - local API health reachability
`)
  process.exit(0)
}

function commandCandidates(command) {
  if (process.platform !== 'win32') return [command]
  return [command, `${command}.cmd`, `${command}.exe`]
}

function runCapture(command, commandArgs, options = {}) {
  const cwd = options.cwd ?? rootDir
  for (const candidate of commandCandidates(command)) {
    const useCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate)
    const invocationCommand = useCmdShim ? 'cmd.exe' : candidate
    const invocationArgs = useCmdShim ? ['/d', '/s', '/c', candidate, ...commandArgs] : commandArgs
    const result = spawnSync(invocationCommand, invocationArgs, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    if (result.error?.code === 'ENOENT') {
      continue
    }
    return {
      ok: !result.error && result.status === 0,
      status: result.status ?? 1,
      stdout: result.stdout?.trim() ?? '',
      stderr: result.stderr?.trim() ?? '',
      error: result.error?.message ?? null,
    }
  }

  return {
    ok: false,
    status: 1,
    stdout: '',
    stderr: '',
    error: `Command not found: ${command}`,
  }
}

function icon(ok, severity) {
  if (ok) return 'OK'
  return severity === 'warn' ? 'WARN' : 'FAIL'
}

async function fetchStatus(url, expectedPredicate) {
  try {
    const response = await fetch(url, { redirect: 'manual' })
    const ok = expectedPredicate(response.status)
    return {
      ok,
      status: response.status,
      detail: ok ? `${url} responded with ${response.status}` : `${url} responded with ${response.status}`,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      detail: `${url} is not reachable (${error instanceof Error ? error.message : String(error)})`,
    }
  }
}

const webPort = process.env.WEB_PORT?.trim() || '3000'
const apiPort = process.env.API_PORT?.trim() || '3001'
const checks = []

const nodeMajor = Number(process.versions.node.split('.')[0] || '0')
checks.push({
  id: 'node',
  label: 'Node.js 20+',
  ok: Number.isFinite(nodeMajor) && nodeMajor >= 20,
  severity: 'error',
  detail: `Detected ${process.version}`,
  fix: 'Install Node.js 20 LTS and rerun pnpm setup.',
})

const pnpmVersion = runCapture('pnpm', ['--version'])
checks.push({
  id: 'pnpm',
  label: 'pnpm available',
  ok: pnpmVersion.ok,
  severity: 'error',
  detail: pnpmVersion.ok ? `pnpm ${pnpmVersion.stdout}` : (pnpmVersion.error || pnpmVersion.stderr || 'pnpm unavailable'),
  fix: 'Run corepack enable && corepack prepare pnpm@9.0.0 --activate.',
})

checks.push({
  id: 'dependencies',
  label: 'Workspace dependencies',
  ok: fs.existsSync(path.join(rootDir, 'node_modules', '.pnpm')),
  severity: 'error',
  detail: fs.existsSync(path.join(rootDir, 'node_modules', '.pnpm'))
    ? 'node_modules/.pnpm exists'
    : 'Dependencies are missing',
  fix: 'Run pnpm install or pnpm setup from the repo root.',
})

for (const [label, relativePath, severity, fix] of [
  ['API env file', 'apps/api/.env', 'error', 'Run pnpm setup to create apps/api/.env from the example file.'],
  ['Web env file', 'apps/web/.env.local', 'error', 'Run pnpm setup to create apps/web/.env.local from the example file.'],
  ['Production env file', 'infra/docker/.env.prod', 'warn', 'Create infra/docker/.env.prod before using production deploy commands.'],
]) {
  const exists = fs.existsSync(path.join(rootDir, relativePath))
  checks.push({
    id: relativePath,
    label,
    ok: exists,
    severity,
    detail: exists ? `${relativePath} exists` : `${relativePath} is missing`,
    fix,
  })
}

const dockerComposeVersion = runCapture('docker', ['compose', 'version'])
checks.push({
  id: 'docker-compose',
  label: 'Docker Compose',
  ok: dockerComposeVersion.ok,
  severity: 'warn',
  detail: dockerComposeVersion.ok
    ? dockerComposeVersion.stdout || 'Docker Compose available'
    : (dockerComposeVersion.error || dockerComposeVersion.stderr || 'Docker Compose unavailable'),
  fix: 'Install Docker Desktop (Windows/macOS) or docker.io + docker-compose-plugin (Ubuntu).',
})

if (dockerComposeVersion.ok) {
  const runningServices = runCapture('docker', ['compose', '-f', 'infra/docker/docker-compose.yml', 'ps', '--services', '--filter', 'status=running'])
  const running = runningServices.stdout
    ? runningServices.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : []
  checks.push({
    id: 'docker-services',
    label: 'Local Docker services',
    ok: running.length >= 2,
    severity: 'warn',
    detail: running.length > 0 ? `Running services: ${running.join(', ')}` : 'No local Docker services running',
    fix: 'Run docker compose -f infra/docker/docker-compose.yml up -d or rerun pnpm setup.',
  })
}

const webHealth = await fetchStatus(`http://127.0.0.1:${webPort}/login`, (status) => status === 200 || (status >= 300 && status < 400))
checks.push({
  id: 'web-health',
  label: 'Web login page',
  ok: webHealth.ok,
  severity: 'warn',
  detail: webHealth.detail,
  fix: `Start the app with pnpm dev, then open http://localhost:${webPort}/login.`,
})

const apiHealth = await fetchStatus(`http://127.0.0.1:${apiPort}/api/v1/health`, (status) => status === 200)
checks.push({
  id: 'api-health',
  label: 'API health endpoint',
  ok: apiHealth.ok,
  severity: 'warn',
  detail: apiHealth.detail,
  fix: `Confirm the API is running on port ${apiPort}. If not, rerun pnpm setup and pnpm dev.`,
})

const failures = checks.filter((check) => !check.ok && check.severity === 'error')
const warnings = checks.filter((check) => !check.ok && check.severity === 'warn')

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        failures: failures.length,
        warnings: warnings.length,
        checks,
      },
      null,
      2,
    ),
  )
} else {
  console.log('OpenAgents doctor\n')
  for (const check of checks) {
    console.log(`${icon(check.ok, check.severity)} ${check.label}`)
    console.log(`  ${check.detail}`)
    if (!check.ok) {
      console.log(`  Fix: ${check.fix}`)
    }
  }

  console.log('')
  console.log(`Summary: ${checks.length - failures.length - warnings.length} ok, ${warnings.length} warning, ${failures.length} failure.`)
}

process.exit(failures.length > 0 ? 1 : 0)
