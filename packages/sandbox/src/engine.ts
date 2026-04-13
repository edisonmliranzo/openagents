export interface SandboxConfig {
  maxMemoryMb: number
  maxCpuPercent: number
  maxExecutionTimeMs: number
  maxOutputSize: number
  allowedLanguages: string[]
}

export interface ExecutionInput {
  language: 'python' | 'javascript' | 'bash'
  code: string
  stdin?: string
  args?: string[]
  env?: Record<string, string>
}

export interface ExecutionResult {
  success: boolean
  output: string
  error?: string
  exitCode: number
  executionTimeMs: number
  memoryUsedMb?: number
}

export interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

const DEFAULT_CONFIG: SandboxConfig = {
  maxMemoryMb: 512,
  maxCpuPercent: 80,
  maxExecutionTimeMs: 30000,
  maxOutputSize: 1024 * 1024,
  allowedLanguages: ['python', 'javascript', 'bash'],
}

export class CodeSandbox {
  private config: SandboxConfig

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const startTime = Date.now()

    if (!this.config.allowedLanguages.includes(input.language)) {
      return {
        success: false,
        output: '',
        error: `Language not allowed: ${input.language}`,
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
      }
    }

    try {
      let result: ProcessResult

      switch (input.language) {
        case 'python':
          result = await this.runPython(input.code, input.stdin, input.args)
          break
        case 'javascript':
          result = await this.runJavaScript(input.code, input.stdin, input.args)
          break
        case 'bash':
          result = await this.runBash(input.code)
          break
        default:
          result = { stdout: '', stderr: 'Unsupported language', exitCode: 1 }
      }

      const executionTimeMs = Date.now() - startTime

      return {
        success: result.exitCode === 0,
        output: result.stdout.slice(0, this.config.maxOutputSize),
        error: result.stderr ? result.stderr.slice(0, 10000) : undefined,
        exitCode: result.exitCode,
        executionTimeMs,
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : 'Execution failed',
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
      }
    }
  }

  private async runPython(code: string, stdin?: string, _args?: string[]): Promise<ProcessResult> {
    const tempDir = await this.createTempDir()
    const scriptPath = `${tempDir}/script.py`
    const inputPath = `${tempDir}/input.txt`

    await this.writeFile(scriptPath, code)
    if (stdin) {
      await this.writeFile(inputPath, stdin)
    }

    const cmd = stdin ? `python3 "${scriptPath}" < "${inputPath}"` : `python3 "${scriptPath}"`

    return this.runCommand(cmd, this.config.maxExecutionTimeMs)
  }

  private async runJavaScript(
    code: string,
    stdin?: string,
    _args?: string[],
  ): Promise<ProcessResult> {
    const tempDir = await this.createTempDir()
    const scriptPath = `${tempDir}/script.js`

    let fullCode = code
    if (stdin) {
      fullCode = `
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8').trim();
${code}
`
    }

    await this.writeFile(scriptPath, fullCode)

    const cmd = stdin ? `node "${scriptPath}" < /dev/stdin` : `node "${scriptPath}"`

    return this.runCommand(cmd, this.config.maxExecutionTimeMs)
  }

  private async runBash(script: string): Promise<ProcessResult> {
    const tempDir = await this.createTempDir()
    const scriptPath = `${tempDir}/script.sh`

    await this.writeFile(scriptPath, script)
    await this.runCommand(
      `chmod +x "${scriptPath}" && "${scriptPath}"`,
      this.config.maxExecutionTimeMs,
    )

    return this.runCommand(`bash "${scriptPath}"`, this.config.maxExecutionTimeMs)
  }

  private async runCommand(cmd: string, timeoutMs: number): Promise<ProcessResult> {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')

    const execPromise = promisify(exec)

    try {
      const { stdout, stderr } = await execPromise(cmd, {
        timeout: timeoutMs,
        maxBuffer: this.config.maxOutputSize,
        shell: '/bin/bash',
      })

      return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 }
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean }
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || (error.killed ? 'Process timed out' : 'Execution failed'),
        exitCode: error.code || 1,
      }
    }
  }

  private async createTempDir(): Promise<string> {
    const { mkdtemp } = await import('fs/promises')
    return mkdtemp('/tmp/sandbox-')
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const { writeFile } = await import('fs/promises')
    await writeFile(path, content)
  }
}

export function createSandbox(config?: Partial<SandboxConfig>): CodeSandbox {
  return new CodeSandbox(config)
}
