import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

const DEFAULT_TIMEOUT_MS = parseInt(process.env.SHELL_MAX_TIMEOUT_MS ?? '30000', 10)
const MAX_OUTPUT_CHARS = 16_000
const MAX_SESSIONS = 40

interface ShellSession {
  id: string
  userId: string
  cwd: string
  env: Record<string, string>
  history: string[]
  createdAt: string
  updatedAt: string
}

function safeWorkDir(requested: string | undefined): string {
  const allowed = (process.env.SHELL_ALLOWED_DIRS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const candidate = requested
    ? path.resolve(requested)
    : process.env.SHELL_DEFAULT_DIR
      ? path.resolve(process.env.SHELL_DEFAULT_DIR)
      : os.tmpdir()

  if (allowed.length === 0) return candidate

  for (const dir of allowed) {
    if (candidate === path.resolve(dir) || candidate.startsWith(path.resolve(dir) + path.sep)) {
      return candidate
    }
  }
  // Fallback to first allowed dir
  return path.resolve(allowed[0])
}

function runCommand(
  command: string,
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'cmd' : '/bin/sh'
    const shellArgs = isWindows ? ['/c', command] : ['-c', command]

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env, ...env },
      timeout: timeoutMs,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      if (stdout.length > MAX_OUTPUT_CHARS) stdout = stdout.slice(-MAX_OUTPUT_CHARS)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > MAX_OUTPUT_CHARS) stderr = stderr.slice(-MAX_OUTPUT_CHARS)
    })

    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGTERM')
        resolve({ stdout: stdout.slice(0, MAX_OUTPUT_CHARS), stderr: 'Command timed out.', exitCode: -1 })
      }
    }, timeoutMs)

    child.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({
          stdout: stdout.slice(0, MAX_OUTPUT_CHARS),
          stderr: stderr.slice(0, MAX_OUTPUT_CHARS),
          exitCode: code,
        })
      }
    })

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ stdout, stderr: err.message, exitCode: -1 })
      }
    })
  })
}

@Injectable()
export class ShellTool implements OnModuleDestroy {
  private readonly logger = new Logger(ShellTool.name)
  private sessions = new Map<string, ShellSession>()

  onModuleDestroy() {
    this.sessions.clear()
  }

  // ── Tool definitions ────────────────────────────────────────────────────────

  get executeDef(): ToolDefinition {
    return {
      name: 'shell_execute',
      displayName: 'Shell Execute',
      description:
        'Run a shell command and return stdout, stderr, and exit code. Requires approval. Commands run in a sandboxed working directory.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute.' },
          cwd: { type: 'string', description: 'Optional working directory. Must be within allowed dirs.' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds (max 120000).' },
          env: {
            type: 'object',
            description: 'Optional extra environment variables.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['command'],
      },
    }
  }

  get sessionStartDef(): ToolDefinition {
    return {
      name: 'shell_session_start',
      displayName: 'Shell Session Start',
      description: 'Start a persistent shell session that retains working directory across commands.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Initial working directory.' },
          env: {
            type: 'object',
            description: 'Initial environment variables for the session.',
            additionalProperties: { type: 'string' },
          },
        },
      },
    }
  }

  get sessionRunDef(): ToolDefinition {
    return {
      name: 'shell_session_run',
      displayName: 'Shell Session Run',
      description: 'Run a command inside an existing shell session.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Shell session ID from shell_session_start.' },
          command: { type: 'string', description: 'Command to run in the session.' },
          timeout_ms: { type: 'number', description: 'Per-command timeout (max 120000).' },
        },
        required: ['session_id', 'command'],
      },
    }
  }

  get sessionEndDef(): ToolDefinition {
    return {
      name: 'shell_session_end',
      displayName: 'Shell Session End',
      description: 'End a shell session and release its resources.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID to end.' },
        },
        required: ['session_id'],
      },
    }
  }

  // ── Execute methods ─────────────────────────────────────────────────────────

  async execute(
    input: { command: string; cwd?: string; timeout_ms?: number; env?: Record<string, string> },
    _userId: string,
  ): Promise<ToolResult> {
    const timeoutMs = Math.min(input.timeout_ms ?? DEFAULT_TIMEOUT_MS, 120_000)
    const cwd = safeWorkDir(input.cwd)
    const env = input.env ?? {}

    this.logger.log(`shell_execute: ${input.command.slice(0, 120)} in ${cwd}`)

    try {
      const result = await runCommand(input.command, cwd, env, timeoutMs)
      return {
        success: result.exitCode === 0,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
          cwd,
        },
        error: result.exitCode !== 0 ? `Exit code ${result.exitCode}` : undefined,
      }
    } catch (err: any) {
      return { success: false, output: null, error: err.message }
    }
  }

  async sessionStart(
    input: { cwd?: string; env?: Record<string, string> },
    userId: string,
  ): Promise<ToolResult> {
    const cwd = safeWorkDir(input.cwd)
    const session: ShellSession = {
      id: randomUUID(),
      userId,
      cwd,
      env: input.env ?? {},
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.sessions.set(session.id, session)
    this.prune()
    return { success: true, output: { session_id: session.id, cwd } }
  }

  async sessionRun(
    input: { session_id: string; command: string; timeout_ms?: number },
    userId: string,
  ): Promise<ToolResult> {
    const session = this.sessions.get(input.session_id)
    if (!session || session.userId !== userId) {
      return { success: false, output: null, error: `Shell session "${input.session_id}" not found.` }
    }

    const timeoutMs = Math.min(input.timeout_ms ?? DEFAULT_TIMEOUT_MS, 120_000)

    // Handle cd commands to update persistent cwd
    const cdMatch = input.command.match(/^\s*cd\s+(.+)\s*$/)
    if (cdMatch) {
      const newDir = path.resolve(session.cwd, cdMatch[1].trim())
      session.cwd = safeWorkDir(newDir)
      session.updatedAt = new Date().toISOString()
      session.history.push(`cd ${cdMatch[1].trim()}`)
      return { success: true, output: { stdout: '', stderr: '', exit_code: 0, cwd: session.cwd } }
    }

    try {
      const result = await runCommand(input.command, session.cwd, session.env, timeoutMs)
      session.history.push(input.command)
      if (session.history.length > 50) session.history = session.history.slice(-50)
      session.updatedAt = new Date().toISOString()
      this.sessions.set(session.id, session)
      return {
        success: result.exitCode === 0,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
          cwd: session.cwd,
        },
        error: result.exitCode !== 0 ? `Exit code ${result.exitCode}` : undefined,
      }
    } catch (err: any) {
      return { success: false, output: null, error: err.message }
    }
  }

  async sessionEnd(input: { session_id: string }, userId: string): Promise<ToolResult> {
    const session = this.sessions.get(input.session_id)
    if (!session || session.userId !== userId) {
      return { success: false, output: null, error: `Shell session "${input.session_id}" not found.` }
    }
    this.sessions.delete(input.session_id)
    return { success: true, output: { ended: true, session_id: input.session_id } }
  }

  private prune() {
    if (this.sessions.size <= MAX_SESSIONS) return
    const sorted = [...this.sessions.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    const overflow = sorted.length - MAX_SESSIONS
    for (let i = 0; i < overflow; i++) this.sessions.delete(sorted[i].id)
  }
}
