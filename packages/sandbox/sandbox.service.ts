import { Injectable, Logger } from '@nestjs/common'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)
const SANDBOX_DIR = path.join(process.cwd(), 'tmp', 'sandbox')

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name)

  async executeCode(code: string, language: 'python' | 'javascript' = 'python'): Promise<{
    stdout: string
    stderr: string
    success: boolean
    output: string
  }> {
    const sessionId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const sessionDir = path.join(SANDBOX_DIR, sessionId)
    await fs.mkdir(sessionDir, { recursive: true })

    try {
      if (language === 'python') {
        const codePath = path.join(sessionDir, 'code.py')
        await fs.writeFile(codePath, code)
        const { stdout, stderr } = await execAsync(`cd "${sessionDir}" && python code.py`, {
          timeout: 10000,
          cwd: sessionDir,
          env: { ...process.env, PYTHONPATH: sessionDir },
        })
        const output = stdout + stderr
        return { stdout, stderr, success: true, output }
      } else {
        const codePath = path.join(sessionDir, 'code.js')
        await fs.writeFile(codePath, code)
        const { stdout, stderr } = await execAsync(`cd "${sessionDir}" && node code.js`, {
          timeout: 10000,
          cwd: sessionDir,
        })
        const output = stdout + stderr
        return { stdout, stderr, success: true, output }
      }
    } catch (error: any) {
      const stderr = error.stderr ?? error.message ?? 'Execution failed'
      return { stdout: '', stderr, success: false, output: stderr }
    } finally {
      // Cleanup in 5min
      setTimeout(() => fs.rm(sessionDir, { recursive: true }).catch(() => {}), 300000)
    }
  }
}

