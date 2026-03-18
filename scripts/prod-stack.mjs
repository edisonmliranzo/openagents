#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const envFile = path.join(rootDir, 'infra/docker/.env.prod')
const envExampleFile = path.join(rootDir, 'infra/docker/.env.prod.example')
const composeFile = path.join(rootDir, 'infra/docker/docker-compose.prod.yml')

const command = (process.argv[2] ?? 'deploy').trim().toLowerCase()
const dockerComposeArgs = ['compose', '--env-file', envFile, '-f', composeFile]
const NO_SPACE_PATTERN = /no space left on device|resourceexhausted/i
const LOW_DISK_THRESHOLD_BYTES = 4n * 1024n * 1024n * 1024n

function commandCandidates(binary) {
  if (process.platform !== 'win32') return [binary]
  return [binary, `${binary}.cmd`, `${binary}.exe`]
}

function formatBytes(bytes) {
  if (bytes === null) return 'unknown'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes)
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function run(binary, args, options = {}) {
  const capture = options.capture === true
  const allowFailure = options.allowFailure === true
  const printable = `${binary} ${args.join(' ')}`.trim()

  let result
  for (const candidate of commandCandidates(binary)) {
    result = spawnSync(candidate, args, {
      cwd: rootDir,
      stdio: capture ? 'pipe' : 'inherit',
      encoding: capture ? 'utf8' : undefined,
    })

    if (result.error && result.error.code === 'ENOENT') {
      continue
    }
    break
  }

  if (!result) {
    throw new Error(`Failed to run "${printable}": command not found`)
  }

  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }

  if (result.error && !allowFailure) {
    throw new Error(`Failed to run "${printable}": ${result.error.message}`)
  }

  if ((result.status ?? 1) !== 0 && !allowFailure) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
    const error = new Error(`Command failed with exit code ${result.status}: ${printable}`)
    error.output = output
    throw error
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim(),
  }
}

function ensureProdEnvFile() {
  if (fs.existsSync(envFile)) return
  fs.copyFileSync(envExampleFile, envFile)
  throw new Error(
    'Created infra/docker/.env.prod from infra/docker/.env.prod.example. Edit secrets and URLs, then rerun the command.',
  )
}

function parseEnvFile(filePath) {
  const env = {}
  const raw = fs.readFileSync(filePath, 'utf8')

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

function inferAccessUrl(prodEnv) {
  const configured = `${prodEnv.FRONTEND_URL ?? ''}`.trim()
  if (configured) return configured.replace(/\/+$/, '') + '/login'
  const webHostPort = `${prodEnv.WEB_HOST_PORT ?? '3000'}`.trim() || '3000'
  return `http://localhost:${webHostPort}/login`
}

function statFreeBytes(targetPath) {
  try {
    const stats = fs.statfsSync(targetPath, { bigint: true })
    return stats.bavail * stats.bsize
  } catch {
    return null
  }
}

function getDockerDiskCheckPath() {
  const candidates = process.platform === 'win32'
    ? [rootDir]
    : ['/var/lib/docker', '/']

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return rootDir
}

function safeDockerCleanup() {
  console.log('\n[openagents:prod] Running safe Docker cleanup to free space...')
  run('docker', ['builder', 'prune', '-af'], { allowFailure: true })
  run('docker', ['image', 'prune', '-af'], { allowFailure: true })
  run('docker', ['container', 'prune', '-f'], { allowFailure: true })
  run('docker', ['network', 'prune', '-f'], { allowFailure: true })
}

function ensureBuildDiskSpace() {
  const checkPath = getDockerDiskCheckPath()
  const freeBefore = statFreeBytes(checkPath)

  if (freeBefore === null) return
  if (freeBefore >= LOW_DISK_THRESHOLD_BYTES) {
    console.log(`[openagents:prod] Free disk at ${checkPath}: ${formatBytes(freeBefore)}`)
    return
  }

  console.log(
    `[openagents:prod] Low disk space at ${checkPath}: ${formatBytes(freeBefore)} available. Attempting cleanup before build...`,
  )
  safeDockerCleanup()

  const freeAfter = statFreeBytes(checkPath)
  if (freeAfter === null) return
  console.log(`[openagents:prod] Free disk after cleanup: ${formatBytes(freeAfter)}`)

  if (freeAfter < LOW_DISK_THRESHOLD_BYTES) {
    throw new Error(
      `Not enough free disk space to build reliably (${formatBytes(freeAfter)} available). Expand disk or free space, then rerun.`,
    )
  }
}

function runCompose(subcommandArgs, options = {}) {
  return run('docker', [...dockerComposeArgs, ...subcommandArgs], options)
}

async function waitForHttp(url, okStatuses, attempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      })

      if (okStatuses.includes(response.status)) {
        return response.status
      }
    } catch {}

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function verifyUp(prodEnv) {
  const webHostPort = `${prodEnv.WEB_HOST_PORT ?? '3000'}`.trim() || '3000'
  const loginUrl = `http://127.0.0.1:${webHostPort}/login`
  const proxiedHealthUrl = `http://127.0.0.1:${webHostPort}/api/v1/health`

  console.log('\n[openagents:prod] Verifying web login page...')
  await waitForHttp(loginUrl, [200, 301, 302, 307, 308])

  console.log('[openagents:prod] Verifying same-origin API proxy...')
  await waitForHttp(proxiedHealthUrl, [200])

  console.log(`[openagents:prod] Ready. Access: ${inferAccessUrl(prodEnv)}`)
}

function maybeRetryBuildAfterDiskFailure(error) {
  const output = `${error?.output ?? error?.message ?? ''}`
  if (!NO_SPACE_PATTERN.test(output)) {
    throw error
  }

  console.log('\n[openagents:prod] Docker build ran out of space. Cleaning safe Docker caches and retrying once...')
  safeDockerCleanup()
  ensureBuildDiskSpace()
  runCompose(['build'])
}

async function build() {
  ensureProdEnvFile()
  ensureBuildDiskSpace()

  try {
    runCompose(['build'], { capture: true })
  } catch (error) {
    maybeRetryBuildAfterDiskFailure(error)
  }
}

async function up() {
  ensureProdEnvFile()
  const prodEnv = parseEnvFile(envFile)
  runCompose(['up', '-d'])
  await verifyUp(prodEnv)
}

async function down() {
  ensureProdEnvFile()
  runCompose(['down'])
}

async function ps() {
  ensureProdEnvFile()
  runCompose(['ps'])
}

async function logs() {
  ensureProdEnvFile()
  runCompose(['logs', '-f', '--tail=200'])
}

async function deploy() {
  await build()
  await up()
}

const handlers = {
  build,
  up,
  down,
  ps,
  logs,
  deploy,
}

if (!handlers[command]) {
  console.error(`[openagents:prod] Unknown command "${command}". Use build, up, down, ps, logs, or deploy.`)
  process.exit(1)
}

try {
  await handlers[command]()
} catch (error) {
  console.error(`\n[openagents:prod] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
