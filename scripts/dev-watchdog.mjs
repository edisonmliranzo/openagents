#!/usr/bin/env node
// Dev watchdog: keeps the API and web dev servers alive, restarting them on
// crash or accidental kill. Run detached: `node scripts/dev-watchdog.mjs`
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

console.log(`[${stamp()}] dev-watchdog starting: api(:3101) + web(:3002)`)
for (const target of TARGETS) supervise(target)
