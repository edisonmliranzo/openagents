#!/usr/bin/env node
// Dev watchdog: keeps the API and web dev servers alive, restarting them on
// crash or accidental kill. Also revives Ollama when its port goes dark.
//   node scripts/dev-watchdog.mjs           — supervise in this terminal
//   node scripts/dev-watchdog.mjs --ensure  — make sure a supervisor is running
const ENSURE = process.argv.includes('--ensure')
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OLLAMA_PORT = Number(process.env.OLLAMA_PORT || 11434)
const OLLAMA_EXE = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Programs', 'Ollama', 'Ollama.exe',
)

// Ports come from apps/api/.env so the watchdog never fights a stack that was
// started with different ports. Defaults match infra/docker/.env.prod.example.
function readEnvPort(name, fallback) {
  try {
    const text = fs.readFileSync(path.join(rootDir, 'apps', 'api', '.env'), 'utf8')
    const match = text.match(new RegExp(`^${name}=(\\d+)\\s*$`, 'm'))
    return match ? Number(match[1]) : fallback
  } catch {
    return fallback
  }
}

const API_PORT = Number(process.env.API_PORT || readEnvPort('API_PORT', 3001))
const WEB_PORT = Number(process.env.WEB_PORT || readEnvPort('WEB_PORT', 3000))

const TARGETS = [
  {
    name: 'api',
    port: API_PORT,
    args: ['--filter', '@openagents/api', 'run', 'dev'],
    env: { API_PORT: String(API_PORT), PORT: String(API_PORT), WEB_PORT: String(WEB_PORT) },
  },
  {
    name: 'web',
    port: WEB_PORT,
    args: ['--filter', '@openagents/web', 'run', 'dev'],
    env: {
      WEB_PORT: String(WEB_PORT),
      API_PORT: String(API_PORT),
      NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
      OPENAGENTS_INTERNAL_API_URL: `http://127.0.0.1:${API_PORT}`,
    },
  },
]

const PNPX = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function stamp() {
  return new Date().toISOString().slice(11, 19)
}

function turboOrNestWatchRunning(serviceName) {
  if (process.platform !== 'win32') return false
  try {
    const out = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and ($_.CommandLine -like '*turbo*run dev*' -or ($_.CommandLine -like '*nest*start --watch*' -and '${serviceName}' -eq 'api') -or ($_.CommandLine -like '*next*dev*' -and '${serviceName}' -eq 'web')) } | Select-Object -First 1 -ExpandProperty ProcessId`,
      ],
      { timeout: 3000 },
    ).stdout?.toString().trim()
    return Boolean(out)
  } catch {
    return false
  }
}

function supervise(target) {
  let restarts = 0
  let running = false
  const start = async () => {
    // Each service is supervised independently: never spawn over an instance
    // that is already serving the port (manual starts, prod stacks, turbo dev, etc.).
    if (running || (await portOpen(target.port)) || turboOrNestWatchRunning(target.name)) return
    running = true
    const child = spawn(PNPX, target.args, {
      cwd: rootDir,
      env: { ...process.env, ...target.env },
      shell: process.platform === 'win32',
      windowsHide: true,
    })
    child.stdout.on('data', (chunk) => process.stdout.write(`[${stamp()}] [${target.name}] ${chunk}`))
    child.stderr.on('data', (chunk) => process.stderr.write(`[${stamp()}] [${target.name}!] ${chunk}`))
    child.on('exit', (code, signal) => {
      running = false
      restarts += 1
      const delay = Math.min(3000 * restarts, 30000)
      console.log(`[${stamp()}] [${target.name}] exited (code=${code} signal=${signal}) — restart #${restarts} in ${delay / 1000}s`)
      setTimeout(start, delay)
    })
    child.on('error', (error) => {
      console.error(`[${stamp()}] [${target.name}] spawn error: ${error.message}`)
    })
  }
  start()
  // Periodically adopt services that died while we were not their parent.
  setInterval(() => void start(), 15000).unref?.()
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    socket.setTimeout(1000)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
  })
}

function superviseOllama() {
  if (process.platform !== 'win32' || !fs.existsSync(OLLAMA_EXE)) return
  let lastAttempt = 0
  setInterval(async () => {
    if (await portOpen(OLLAMA_PORT)) return
    if (Date.now() - lastAttempt < 60000) return
    lastAttempt = Date.now()
    console.log(`[${stamp()}] [ollama] port ${OLLAMA_PORT} down — launching ${OLLAMA_EXE}`)
    const child = spawn(OLLAMA_EXE, { detached: true, stdio: 'ignore', shell: true })
    child.unref()
  }, 15000).unref()
}

const PID_FILE = path.join(os.tmpdir(), 'openagents-dev-watchdog.pid')

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    const probe = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'])
    return /node(\.exe)?/i.test(probe.stdout.toString())
  } catch {
    return false
  }
}

if (ENSURE) {
  const recorded = Number(fs.existsSync(PID_FILE) ? fs.readFileSync(PID_FILE, 'utf8').trim() : 0)
  if (recorded && pidAlive(recorded)) process.exit(0)
  // Supervisor died but the stack may still be up (children survive on
  // Windows). Never spawn a second stack over a healthy one.
  if ((await portOpen(API_PORT)) && (await portOpen(WEB_PORT))) process.exit(0)
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  process.exit(0)
}

fs.writeFileSync(PID_FILE, String(process.pid))
process.on('exit', () => { try { fs.unlinkSync(PID_FILE) } catch {} })

console.log(`[${stamp()}] dev-watchdog starting: api(:${API_PORT}) + web(:${WEB_PORT}) + ollama(:${OLLAMA_PORT})`)
for (const target of TARGETS) supervise(target)
superviseOllama()
