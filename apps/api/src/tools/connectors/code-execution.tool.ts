import { Injectable, Logger } from '@nestjs/common'
import { spawn } from 'node:child_process'
import * as os from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

export type CodeLanguage = 'python' | 'node' | 'bash' | 'typescript'

const DEFAULT_TIMEOUT_MS = parseInt(process.env.CODE_EXEC_MAX_TIMEOUT_MS ?? '30000', 10)
const MAX_OUTPUT_CHARS = 16_000

const LANGUAGE_INTERPRETER: Record<CodeLanguage, string> = {
  python: process.env.CODE_EXEC_PYTHON_BIN ?? 'python3',
  node: process.env.CODE_EXEC_NODE_BIN ?? 'node',
  bash: process.env.SHELL ?? '/bin/sh',
  typescript: process.env.CODE_EXEC_TS_BIN ?? 'ts-node',
}

const LANGUAGE_EXT: Record<CodeLanguage, string> = {
  python: '.py',
  node: '.js',
  bash: '.sh',
  typescript: '.ts',
}

function execFile(
  interpreter: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(interpreter, args, {
      env: process.env as Record<string, string>,
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
        resolve({ stdout, stderr: 'Code execution timed out.', exitCode: -1 })
      }
    }, timeoutMs)

    child.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ stdout: stdout.slice(0, MAX_OUTPUT_CHARS), stderr: stderr.slice(0, MAX_OUTPUT_CHARS), exitCode: code })
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
export class CodeExecutionTool {
  private readonly logger = new Logger(CodeExecutionTool.name)

  get def(): ToolDefinition {
    return {
      name: 'code_execute',
      displayName: 'Code Execute',
      description:
        'Execute a code snippet in Python, Node.js, Bash, or TypeScript. Returns stdout, stderr, and exit code. Requires approval.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: ['python', 'node', 'bash', 'typescript'],
            description: 'Programming language to use.',
          },
          code: {
            type: 'string',
            description: 'Source code to execute.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Execution timeout in milliseconds (max 120000). Defaults to 30000.',
          },
          stdin: {
            type: 'string',
            description: 'Optional stdin to pipe into the process.',
          },
        },
        required: ['language', 'code'],
      },
    }
  }

  async execute(
    input: { language: CodeLanguage; code: string; timeout_ms?: number; stdin?: string },
    _userId: string,
  ): Promise<ToolResult> {
    const language = input.language ?? 'bash'
    const timeoutMs = Math.min(input.timeout_ms ?? DEFAULT_TIMEOUT_MS, 120_000)
    const interpreter = LANGUAGE_INTERPRETER[language]
    if (!interpreter) {
      return { success: false, output: null, error: `Unsupported language: ${language}` }
    }

    // Write code to a temp file
    const tmpDir = os.tmpdir()
    const ext = LANGUAGE_EXT[language]
    const tmpFile = path.join(tmpDir, `openagents-exec-${randomUUID()}${ext}`)

    try {
      fs.writeFileSync(tmpFile, input.code, 'utf-8')
      // For bash, make executable
      if (language === 'bash') {
        fs.chmodSync(tmpFile, 0o700)
      }
    } catch (err: any) {
      return { success: false, output: null, error: `Failed to write code file: ${err.message}` }
    }

    this.logger.log(`code_execute: language=${language} timeout=${timeoutMs}ms`)

    try {
      const interArgs = language === 'bash' ? [tmpFile] : [tmpFile]
      const result = await execFile(interpreter, interArgs, timeoutMs)

      return {
        success: result.exitCode === 0,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
          language,
        },
        error: result.exitCode !== 0 ? `Exit code ${result.exitCode}` : undefined,
      }
    } catch (err: any) {
      return { success: false, output: null, error: err.message }
    } finally {
      try {
        fs.unlinkSync(tmpFile)
      } catch {
        // ignore cleanup failure
      }
    }
  }
}
