import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { UserJsonStore } from '../durable/user-json-store'

export type SandboxLanguage = 'sh' | 'node' | 'python'
export type SandboxMode = 'docker' | 'restricted'

export interface SandboxRunRequest {
  language: SandboxLanguage
  code: string
  timeoutMs?: number
  memoryMb?: number
  cpus?: number
  network?: boolean
  isolation?: 'auto' | 'docker' | 'restricted'
}

export interface SandboxRunResult {
  id: string
  userId: string
  language: SandboxLanguage
  codePreview: string
  mode: SandboxMode
  fallbackReason?: string
  network: boolean
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
  stdout: string
  stderr: string
  durationMs: number
  limits: { timeoutMs: number; memoryMb: number; cpus: number; outputBytes: number }
  at: string
}

const OUTPUT_CAP = 64 * 1024
const MAX_CODE = 20_000
const IMAGES: Record<SandboxLanguage, string> = {
  sh: process.env.SANDBOX_IMAGE_SH || 'alpine:3.20',
  node: process.env.SANDBOX_IMAGE_NODE || 'node:20-alpine',
  python: process.env.SANDBOX_IMAGE_PYTHON || 'python:3.12-alpine',
}

/** Always blocked in restricted mode (shell). */
const DENY = /\b(rm|rmdir|del|erase|format|mkfs|dd|shutdown|reboot|halt|poweroff|sudo|su|chmod|chown|kill|killall|taskkill|curl|wget|nc|ncat|netcat|ssh|scp|ftp|telnet|powershell|pwsh|cmd|reg|schtasks|sc|net|netsh|mount|eval|exec|source|env|printenv|set)\b/i
/** Only these programs may start a (shell) command segment in restricted mode. */
const ALLOW = new Set([
  'echo', 'printf', 'cat', 'ls', 'dir', 'pwd', 'head', 'tail', 'wc', 'sort', 'uniq', 'grep', 'date', 'true', 'false',
  'basename', 'dirname', 'tr', 'cut', 'seq', 'expr', 'node', 'python', 'python3', 'type', 'find',
])
const SECRET_ENV = /(key|token|secret|password|passwd|credential|auth|cookie|session|database_url|dsn)/i

/** Pure validation of a shell snippet for restricted mode. Returns an error string or null. */
export function validateRestrictedShell(code: string): string | null {
  if (/[`<>]|\$\(|\$\{|\\\r?\n/.test(code)) return 'Redirection, command substitution and expansion are not allowed in restricted mode'
  if (/(^|[\s;&|])\.\.([\\/]|$)|[a-zA-Z]:\\|(^|\s)\/(?!dev\/null)/.test(code)) return 'Absolute paths and parent-directory references are not allowed in restricted mode'
  const segments = code.split(/&&|\|\||;|\||\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (!segments.length) return 'Empty command'
  for (const seg of segments) {
    const first = seg.split(/\s+/)[0].toLowerCase()
    if (!ALLOW.has(first)) return `Command "${first}" is not on the restricted-mode allow list`
    if (DENY.test(seg.replace(/^\S+/, '')) && !/^(echo|printf)\b/i.test(seg)) return `Denied token in: ${seg.slice(0, 60)}`
  }
  return null
}

function scrubbedEnv(workdir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const k of ['PATH', 'Path', 'SystemRoot', 'ComSpec', 'PATHEXT', 'LANG']) {
    if (process.env[k] && !SECRET_ENV.test(k)) env[k] = process.env[k]
  }
  env.HOME = workdir
  env.USERPROFILE = workdir
  env.TMPDIR = workdir
  env.TEMP = workdir
  env.TMP = workdir
  return env
}

function killTree(pid: number | undefined) {
  if (!pid) return
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 5000 })
    else process.kill(-pid, 'SIGKILL')
  } catch {
    try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  }
}

@Injectable()
export class SandboxExecService {
  private readonly logger = new Logger(SandboxExecService.name)
  private readonly history = new UserJsonStore<SandboxRunResult>('sandbox-exec', 100)
  private dockerCache: { at: number; available: boolean; version?: string } | null = null

  dockerStatus() {
    const now = Date.now()
    if (this.dockerCache && now - this.dockerCache.at < 60_000) return this.dockerCache
    let available = false
    let version: string | undefined
    try {
      const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 4000, encoding: 'utf8' })
      available = r.status === 0 && !!r.stdout.trim()
      version = available ? r.stdout.trim() : undefined
    } catch {
      available = false
    }
    this.dockerCache = { at: now, available, version }
    return this.dockerCache
  }

  status() {
    const d = this.dockerStatus()
    const images = Object.fromEntries(
      (Object.keys(IMAGES) as SandboxLanguage[]).map((l) => {
        let present = false
        if (d.available) {
          try { present = spawnSync('docker', ['image', 'inspect', IMAGES[l]], { timeout: 4000 }).status === 0 } catch { present = false }
        }
        return [l, { image: IMAGES[l], present }]
      }),
    )
    return {
      docker: { available: d.available, version: d.version ?? null },
      images,
      defaults: { timeoutMs: 10_000, memoryMb: 256, cpus: 1, outputBytes: OUTPUT_CAP },
      preferredMode: d.available ? 'docker' : 'restricted',
    }
  }

  getHistory(userId: string) {
    return [...this.history.load(userId)].reverse()
  }

  clearHistory(userId: string) {
    this.history.save(userId, [])
    return { ok: true }
  }

  async run(userId: string, req: SandboxRunRequest): Promise<SandboxRunResult> {
    const code = req.code ?? ''
    if (!code.trim()) throw new BadRequestException('code is required')
    if (code.length > MAX_CODE) throw new BadRequestException(`code exceeds ${MAX_CODE} chars`)
    const limits = {
      timeoutMs: Math.min(Math.max(req.timeoutMs ?? 10_000, 500), 60_000),
      memoryMb: Math.min(Math.max(req.memoryMb ?? 256, 32), 2048),
      cpus: Math.min(Math.max(req.cpus ?? 1, 0.25), 4),
      outputBytes: OUTPUT_CAP,
    }
    const network = req.network === true
    const wanted = req.isolation ?? 'auto'
    const docker = wanted === 'restricted' ? { available: false } : this.dockerStatus()

    let mode: SandboxMode = 'restricted'
    let fallbackReason: string | undefined
    if (wanted !== 'restricted') {
      if (!docker.available) {
        fallbackReason = 'Docker is not available'
      } else if (spawnSync('docker', ['image', 'inspect', IMAGES[req.language]], { timeout: 4000 }).status !== 0) {
        fallbackReason = `Image ${IMAGES[req.language]} is not pulled locally (docker pull ${IMAGES[req.language]})`
      } else {
        mode = 'docker'
      }
      if (mode !== 'docker' && wanted === 'docker') throw new BadRequestException(`Docker isolation unavailable: ${fallbackReason}`)
    }

    if (mode === 'restricted') {
      if (network) throw new BadRequestException('Network access requires Docker isolation')
      if (req.language === 'sh') {
        const bad = validateRestrictedShell(code)
        if (bad) throw new BadRequestException(`Blocked by restricted mode: ${bad}`)
      }
    }

    const id = randomUUID()
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-sbx-'))
    const ext = req.language === 'node' ? 'js' : req.language === 'python' ? 'py' : 'sh'
    const file = path.join(workdir, `main.${ext}`)
    fs.writeFileSync(file, code)

    const started = Date.now()
    let out: { exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; truncated: boolean }
    try {
      out = mode === 'docker'
        ? await this.runDocker(id, req.language, workdir, limits, network)
        : await this.runRestricted(req.language, workdir, file, limits)
    } finally {
      try { fs.rmSync(workdir, { recursive: true, force: true }) } catch { /* best effort */ }
    }

    const result: SandboxRunResult = {
      id,
      userId,
      language: req.language,
      codePreview: code.slice(0, 500),
      mode,
      fallbackReason,
      network: mode === 'docker' && network,
      ...out,
      durationMs: Date.now() - started,
      limits,
      at: new Date().toISOString(),
    }
    this.history.save(userId, [...this.history.load(userId), result])
    return result
  }

  private collect(child: ReturnType<typeof spawn>, timeoutMs: number, onTimeout: () => void) {
    return new Promise<{ exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; truncated: boolean }>((resolve) => {
      let stdout = ''
      let stderr = ''
      let truncated = false
      let timedOut = false
      const add = (cur: string, chunk: Buffer) => {
        if (cur.length >= OUTPUT_CAP) { truncated = true; return cur }
        const next = cur + chunk.toString('utf8')
        if (next.length > OUTPUT_CAP) { truncated = true; return next.slice(0, OUTPUT_CAP) }
        return next
      }
      child.stdout?.on('data', (c: Buffer) => { stdout = add(stdout, c) })
      child.stderr?.on('data', (c: Buffer) => { stderr = add(stderr, c) })
      const timer = setTimeout(() => { timedOut = true; onTimeout() }, timeoutMs)
      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({ exitCode: null, timedOut, stdout, stderr: stderr + String(err.message), truncated })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ exitCode: code, timedOut, stdout, stderr, truncated })
      })
    })
  }

  private runDocker(id: string, lang: SandboxLanguage, workdir: string, limits: SandboxRunResult['limits'], network: boolean) {
    const name = `oa-sbx-${id.slice(0, 12)}`
    const cmd = lang === 'node' ? ['node', '/work/main.js'] : lang === 'python' ? ['python', '/work/main.py'] : ['sh', '/work/main.sh']
    const args = [
      'run', '--rm', '--name', name,
      '--network', network ? 'bridge' : 'none',
      '--memory', `${limits.memoryMb}m`, '--memory-swap', `${limits.memoryMb}m`,
      '--cpus', String(limits.cpus), '--pids-limit', '128',
      '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--user', '65534:65534',
      '-v', `${workdir}:/work:ro`, '-w', '/work',
      IMAGES[lang], ...cmd,
    ]
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    return this.collect(child, limits.timeoutMs, () => {
      try { spawnSync('docker', ['kill', name], { timeout: 5000 }) } catch { /* ignore */ }
      killTree(child.pid)
    })
  }

  private runRestricted(lang: SandboxLanguage, workdir: string, file: string, limits: SandboxRunResult['limits']) {
    const env = scrubbedEnv(workdir)
    let child: ReturnType<typeof spawn>
    const opts = { cwd: workdir, env, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' }
    if (lang === 'node') {
      const major = Number(process.versions.node.split('.')[0])
      const perm = major >= 23 ? '--permission' : '--experimental-permission'
      child = spawn(process.execPath, [perm, `--allow-fs-read=${workdir}`, `--max-old-space-size=${limits.memoryMb}`, file], opts)
    } else if (lang === 'python') {
      child = spawn(process.platform === 'win32' ? 'python' : 'python3', ['-I', file], opts)
    } else {
      // Shell snippet has already passed the allow/deny validation.
      const code = fs.readFileSync(file, 'utf8')
      child = spawn(code, { ...opts, shell: true })
    }
    return this.collect(child, limits.timeoutMs, () => killTree(child.pid))
  }
}
