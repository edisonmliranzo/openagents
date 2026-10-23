import { Injectable, Logger } from '@nestjs/common'
import { spawn } from 'node:child_process'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

/**
 * External CLI agent runner — the Orca pattern: the assistant orchestrates a
 * *fleet* of external coding agents (Claude Code, Codex, OpenCode, Gemini CLI,
 * or any custom CLI) as tools, each running with the user's own subscription
 * and auth on the host machine.
 */

type PromptMode = 'arg' | 'stdin'

interface CliAgentSpec {
  id: string
  displayName: string
  command: string
  /** Arguments placed before the prompt. */
  args: string[]
  promptMode: PromptMode
  /** When 'arg', the flag the prompt follows (informational for custom entries). */
  promptFlag?: string
  installHint: string
}

const BUILTIN_AGENTS: CliAgentSpec[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    command: 'claude',
    args: ['-p', '--output-format', 'text'],
    promptMode: 'arg',
    promptFlag: '-p',
    installHint: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    displayName: 'Codex CLI',
    command: 'codex',
    args: ['exec', '--'],
    promptMode: 'arg',
    installHint: 'npm install -g @openai/codex',
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    command: 'opencode',
    args: ['run'],
    promptMode: 'arg',
    installHint: 'curl -fsSL https://opencode.ai/install | bash',
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    command: 'gemini',
    args: ['-p'],
    promptMode: 'arg',
    promptFlag: '-p',
    installHint: 'npm install -g @google/gemini-cli',
  },
  {
    id: 'grok',
    displayName: 'Grok CLI',
    command: 'grok',
    args: ['-p'],
    promptMode: 'arg',
    promptFlag: '-p',
    installHint: 'npm install -g grok-cli (or the official x.ai CLI)',
  },
  {
    id: 'aida',
    displayName: 'Aider',
    command: 'aider',
    args: ['--message'],
    promptMode: 'arg',
    installHint: 'python -m pip install aider-chat',
  },
]

const SENSITIVE_EXEC_ENV_PATTERN =
  /(SECRET|TOKEN|PASSWORD|PASS|PRIVATE|KEY|DATABASE_URL|REDIS_URL|POSTGRES|SMTP|CREATOR_EMAIL|AUTH_|JWT_|ENCRYPTION|WEBHOOK|STRIPE|AWS_|GCP_|AZURE_|OPENAI|ANTHROPIC|GEMINI|GOOGLE|DEEPSEEK|GROQ|MISTRAL|OLLAMA)/i

const DEFAULT_TIMEOUT_MS = 300_000
const MAX_TIMEOUT_MS = 900_000
const MAX_OUTPUT_CHARS = 32_000

function buildSafeExecEnv(): Record<string, string> {
  const safeEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue
    // External agents run with their own login/subscription state, so provider
    // keys must not leak into their environment.
    if (SENSITIVE_EXEC_ENV_PATTERN.test(key)) continue
    safeEnv[key] = value
  }
  return safeEnv
}

@Injectable()
export class CliAgentTool {
  private readonly logger = new Logger(CliAgentTool.name)

  get def(): ToolDefinition {
    const agents = this.listAgents()
    return {
      name: 'run_cli_agent',
      displayName: 'Run CLI Agent',
      description:
        'Run an external coding-agent CLI (Claude Code, Codex, OpenCode, Gemini CLI, or a custom agent) on a task using the user\'s own installed CLI and subscription. ' +
        'The external agent runs as a subprocess on this machine with its own authentication — use it when the user asks for a specific external agent, or when a complex coding task would benefit from a dedicated coding agent. ' +
        `Available agents: ${agents.map((a) => `${a.id} (${a.displayName})`).join(', ')}.`,
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            description: 'Which agent to run.',
            enum: agents.map((a) => a.id),
          },
          task: {
            type: 'string',
            description: 'The task for the external agent. Be specific — this is the entire prompt it receives.',
          },
          workdir: {
            type: 'string',
            description: 'Optional working directory (the agent edits files here). Must be inside an allowed directory.',
          },
          timeout_ms: {
            type: 'number',
            description: `Timeout in milliseconds (max ${MAX_TIMEOUT_MS}). Defaults to ${DEFAULT_TIMEOUT_MS}.`,
          },
        },
        required: ['agent', 'task'],
      },
    }
  }

  /** Built-in agents plus any configured via CLI_AGENTS_JSON. */
  listAgents(): CliAgentSpec[] {
    const custom = this.loadCustomAgents()
    const byId = new Map<string, CliAgentSpec>()
    for (const agent of BUILTIN_AGENTS) byId.set(agent.id, agent)
    for (const agent of custom) byId.set(agent.id, agent)
    return [...byId.values()]
  }

  async execute(
    input: { agent: string; task: string; workdir?: string; timeout_ms?: number },
    _userId: string,
  ): Promise<ToolResult> {
    const spec = this.listAgents().find((a) => a.id === String(input?.agent ?? '').trim().toLowerCase())
    if (!spec) {
      return {
        success: false,
        output: null,
        error: `Unknown agent "${input?.agent}". Available: ${this.listAgents().map((a) => a.id).join(', ')}`,
      }
    }

    const task = String(input?.task ?? '').trim()
    if (!task) {
      return { success: false, output: null, error: 'A task is required.' }
    }

    const timeoutMs = Math.min(Number(input?.timeout_ms) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
    const cwd = this.resolveWorkdir(input?.workdir)

    // The prompt is passed as a single argv element (never through a shell), so
    // it cannot inject flags into the agent's command line.
    const argv =
      spec.promptMode === 'stdin'
        ? [...spec.args]
        : [...spec.args, task]

    this.logger.log(`run_cli_agent: ${spec.id} in ${cwd} (timeout ${timeoutMs}ms, ${task.length} chars)`)

    const result = await this.spawnAgent(spec, argv, task, cwd, timeoutMs)
    return result
  }

  private async spawnAgent(
    spec: CliAgentSpec,
    argv: string[],
    task: string,
    cwd: string,
    timeoutMs: number,
  ): Promise<ToolResult> {
    return new Promise<ToolResult>((resolve) => {
      let child
      try {
        child = spawn(spec.command, argv, {
          cwd,
          env: buildSafeExecEnv(),
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (error: any) {
        resolve({
          success: false,
          output: null,
          error: `Failed to start "${spec.command}": ${error?.message ?? error}. Install hint: ${spec.installHint}`,
        })
        return
      }

      let stdout = ''
      let stderr = ''
      let settled = false

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
        if (stdout.length > MAX_OUTPUT_CHARS) stdout = stdout.slice(-MAX_OUTPUT_CHARS)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        if (stderr.length > MAX_OUTPUT_CHARS) stderr = stderr.slice(-MAX_OUTPUT_CHARS)
      })

      if (spec.promptMode === 'stdin') {
        child.stdin?.write(task)
        child.stdin?.end()
      }

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          child.kill('SIGTERM')
          resolve({
            success: false,
            output: { stdout: stdout.slice(0, MAX_OUTPUT_CHARS), stderr: stderr.slice(0, 4_000) },
            error: `${spec.displayName} timed out after ${Math.round(timeoutMs / 1000)}s.`,
          })
        }
      }, timeoutMs)

      child.on('error', (err: any) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const notFound = err?.code === 'ENOENT'
        resolve({
          success: false,
          output: null,
          error: notFound
            ? `"${spec.command}" is not installed on this machine. Install hint: ${spec.installHint}`
            : `Failed to run ${spec.displayName}: ${err?.message ?? err}`,
        })
      })

      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const output = (stdout || '').trim()
        resolve({
          success: code === 0 && Boolean(output),
          output: {
            agent: spec.displayName,
            exitCode: code,
            stdout: output.slice(0, MAX_OUTPUT_CHARS),
            ...(stderr.trim() ? { stderr: stderr.slice(0, 4_000) } : {}),
          },
          error:
            code === 0
              ? undefined
              : `${spec.displayName} exited with code ${code}.${stderr.trim() ? ` ${stderr.trim().slice(0, 300)}` : ''}`,
        })
      })
    })
  }

  /** Honours SHELL_ALLOWED_DIRS when set, and refuses directories outside it. */
  private resolveWorkdir(raw: string | undefined): string {
    const allowed = (process.env.SHELL_ALLOWED_DIRS ?? '')
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)

    const requested = String(raw ?? '').trim()
    if (!requested) {
      return allowed[0] && fs.existsSync(allowed[0]) ? allowed[0] : os.tmpdir()
    }

    const resolved = path.resolve(requested)
    if (allowed.length > 0 && !allowed.some((dir) => resolved.startsWith(path.resolve(dir)))) {
      throw new Error(`Working directory must be inside one of: ${allowed.join(', ')}`)
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`Working directory does not exist: ${resolved}`)
    }
    return resolved
  }

  /**
   * Custom agents via CLI_AGENTS_JSON, e.g.:
   * [{"id":"my-agent","command":"my-agent","args":["--run"],"promptMode":"stdin"}]
   */
  private loadCustomAgents(): CliAgentSpec[] {
    const raw = (process.env.CLI_AGENTS_JSON ?? '').trim()
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((entry) => entry && typeof entry === 'object' && typeof entry.command === 'string')
        .slice(0, 20)
        .map((entry, index) => ({
          id: String(entry.id ?? `custom-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40) || `custom-${index + 1}`,
          displayName: String(entry.displayName ?? entry.id ?? `Custom agent ${index + 1}`).slice(0, 80),
          command: String(entry.command),
          args: Array.isArray(entry.args) ? entry.args.map(String).slice(0, 20) : [],
          promptMode: entry.promptMode === 'stdin' ? ('stdin' as const) : ('arg' as const),
          promptFlag: typeof entry.promptFlag === 'string' ? entry.promptFlag.slice(0, 20) : undefined,
          installHint: String(entry.installHint ?? 'See the agent CLI documentation'),
        }))
    } catch (error: any) {
      this.logger.warn(`Failed to parse CLI_AGENTS_JSON: ${error?.message ?? error}`)
      return []
    }
  }
}
