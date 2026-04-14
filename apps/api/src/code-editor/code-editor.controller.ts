import { Controller, Post, Get, Body, Query, Res, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Response } from 'express'
import { spawn } from 'child_process'
import { createClient } from '@openagents/shared'

@ApiTags('code-editor')
@Controller('code-editor')
export class CodeEditorController {
  private readonly workDir = '/workspace'

  @Post('execute')
  @ApiOperation({ summary: 'Execute code in sandbox' })
  async executeCode(
    @Body() body: { code: string; language: string },
  ): Promise<{ success: boolean; output?: string; error?: string; executionTime?: number }> {
    const startTime = Date.now()
    const { code, language } = body

    try {
      let result: { stdout: string; stderr: string; exitCode: number }

      switch (language) {
        case 'python':
          result = await this.runPython(code)
          break
        case 'javascript':
        case 'typescript':
          result = await this.runNode(code)
          break
        case 'shell':
          result = await this.runShell(code)
          break
        default:
          return {
            success: false,
            error: `Language '${language}' is not supported`,
            executionTime: Date.now() - startTime,
          }
      }

      return {
        success: result.exitCode === 0,
        output: result.stdout || result.stderr,
        error: result.exitCode !== 0 ? result.stderr : undefined,
        executionTime: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
        executionTime: Date.now() - startTime,
      }
    }
  }

  @Post('terminal/execute')
  @ApiOperation({ summary: 'Execute terminal command' })
  async executeCommand(
    @Body() body: { command: string },
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const { command } = body

    try {
      const result = await this.runShell(command)
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Command failed',
      }
    }
  }

  @Get('files')
  @ApiOperation({ summary: 'List files in workspace' })
  async listFiles(@Query('path') path?: string): Promise<{
    success: boolean
    files?: Array<{ name: string; type: 'file' | 'directory'; path: string; size?: number }>
    error?: string
  }> {
    const targetPath = path || this.workDir

    try {
      const result = await this.runShell(`ls -la ${targetPath}`)
      const lines = result.stdout.split('\n').slice(1)

      const files = lines
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.split(/\s+/)
          const name = parts[parts.length - 1]
          const isDir = line.startsWith('d')
          const size = parseInt(parts[4]) || 0

          return {
            name,
            type: isDir ? 'directory' : 'file',
            path: `${targetPath}/${name}`,
            size: isNaN(size) ? undefined : size,
          }
        })

      return { success: true, files }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
      }
    }
  }

  @Get('files/read')
  @ApiOperation({ summary: 'Read file content' })
  async readFile(@Query('path') path: string): Promise<{
    success: boolean
    content?: string
    error?: string
  }> {
    if (!path) {
      return { success: false, error: 'Path is required' }
    }

    const fullPath = path.startsWith('/') ? path : `${this.workDir}/${path}`

    try {
      const result = await this.runShell(`cat "${fullPath}"`)
      return {
        success: result.exitCode === 0,
        content: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      }
    }
  }

  @Post('files/save')
  @ApiOperation({ summary: 'Save file content' })
  async saveFile(
    @Body() body: { path: string; content: string },
  ): Promise<{ success: boolean; error?: string }> {
    const { path, content } = body

    if (!path) {
      return { success: false, error: 'Path is required' }
    }

    const fullPath = path.startsWith('/') ? path : `${this.workDir}/${path}`

    try {
      const escapedContent = content.replace(/'/g, "'\"'\"'")
      const result = await this.runShell(`echo '${escapedContent}' > "${fullPath}"`)
      return {
        success: result.exitCode === 0,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save file',
      }
    }
  }

  private async runPython(
    code: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.runCommand('python3', ['-c', code])
  }

  private async runNode(
    code: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.runCommand('node', ['-e', code])
  }

  private async runShell(
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.runCommand('/bin/bash', ['-c', command])
  }

  private runCommand(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: this.workDir,
        timeout: 30000,
        shell: false,
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        resolve({
          stdout: stdout.slice(0, 100000),
          stderr: stderr.slice(0, 10000),
          exitCode: code || 0,
        })
      })

      child.on('error', (error) => {
        resolve({
          stdout: '',
          stderr: error.message,
          exitCode: 1,
        })
      })
    })
  }
}
