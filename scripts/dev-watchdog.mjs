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

const TARGETS = [
  {
    name: 'api',
    args: ['--filter', '@openagents/api', 'run', 'dev'],
    env: { API_PORT: '3101', PORT: '3101', WEB_PORT: '3002' },
  },
  {
    name: 'web',
    args: ['--filter', '@openagents/web', 'run', 'dev'],
    env: {
      WEB_PORT: '3002',
      API_PORT: '3101',
      NEXT_PUBLIC_API_URL: 'http://localhost:3101',
      OPENAGENTS_INTERNAL_API_URL: 'http://127.0.0.1:3101',
    },
  },
]

const PNPX = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function stamp() {
  return new Date().toISOString().slice(11, 19)
}

function supervise(target) {
  let restarts = 0
  const start = () => {
    const child = spawn(PNPX, target.args, {
      cwd: rootDir,
      env: { ...process.env, ...target.env },
      shell: process.platform === 'win32',
      windowsHide: true,
    })
    child.stdout.on('data', (chunk) => process.stdout.write(`[${stamp()}] [${target.name}] ${chunk}`))
    child.stderr.on('data', (chunk) => process.stderr.write(`[${stamp()}] [${target.name}!] ${chunk}`))
    child.on('exit', (code, signal) => {
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

console.log(`[${stamp()}] dev-watchdog starting: api(:3101) + web(:3002) + ollama(:${OLLAMA_PORT})`)
for (const target of TARGETS) supervise(target)
superviseOllama()
