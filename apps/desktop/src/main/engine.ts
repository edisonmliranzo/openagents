import { ChildProcess, execSync, spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'

let engineProcess: ChildProcess | null = null

export function freePortIfOccupied(port: number) {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano | findstr :${port}`).toString()
      const lines = output.split('\n').filter((l) => l.includes('LISTENING'))
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && Number(pid) > 0 && Number(pid) !== process.pid) {
          try {
            execSync(`taskkill /f /pid ${pid}`)
          } catch {}
        }
      }
    } catch {}
  }
}

export function findProjectRootDir(): string {
  const candidates = [
    process.env.OPENAGENTS_DIR,
    'c:\\Users\\edinson\\Music\\openagents',
    process.cwd(),
    path.resolve(__dirname, '../../../..'),
    path.resolve(__dirname, '../../..'),
    path.resolve(process.execPath, '..'),
    path.resolve(process.execPath, '../..'),
    path.resolve(process.execPath, '../../..'),
  ].filter(Boolean) as string[]

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'apps')))) {
        return dir
      }
    } catch {}
  }
  return 'c:\\Users\\edinson\\Music\\openagents'
}

export function isEngineRunning(port = 3002): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode !== undefined && res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

export function isApiRunning(port = 3001): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/v1/health`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode !== undefined && res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

export async function ensureDockerServices(projectRootDir: string): Promise<void> {
  const composeFile = path.join(projectRootDir, 'infra', 'docker', 'docker-compose.yml')
  if (!fs.existsSync(composeFile)) return

  return new Promise((resolve) => {
    try {
      const dockerProcess = spawn('docker', ['compose', '-f', composeFile, 'up', '-d'], {
        cwd: projectRootDir,
        detached: false,
        stdio: 'ignore',
        shell: true,
      })
      const timer = setTimeout(() => {
        try { dockerProcess.kill() } catch {}
        resolve()
      }, 12000)
      dockerProcess.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      dockerProcess.on('error', () => {
        clearTimeout(timer)
        resolve()
      })
    } catch {
      resolve()
    }
  })
}

export function startEngine(projectRootDir: string): ChildProcess | null {
  if (engineProcess) return engineProcess

  console.log('[Desktop Engine] Starting local OpenAgents background services at:', projectRootDir)

  if (process.platform === 'win32') {
    freePortIfOccupied(3001)
    freePortIfOccupied(3000)
    freePortIfOccupied(3002)
  }

  const isWindows = process.platform === 'win32'
  
  // Find pnpm executable path
  let command = 'pnpm'
  if (isWindows) {
    const knownPnpmPaths = [
      'C:\\Users\\edinson\\AppData\\Roaming\\npm\\pnpm.cmd',
      path.join(process.env.APPDATA || '', 'npm', 'pnpm.cmd'),
      'pnpm.cmd',
      'pnpm'
    ]
    for (const p of knownPnpmPaths) {
      if (p && fs.existsSync(p)) {
        command = p
        break
      }
    }
  }

  // Ensure extended PATH for node, pnpm, and docker
  const extraPaths = isWindows
    ? [
        'C:\\Users\\edinson\\AppData\\Roaming\\npm',
        'C:\\Program Files\\nodejs',
        'C:\\Program Files\\Docker\\Docker\\resources\\bin',
        path.join(process.env.APPDATA || '', 'npm')
      ]
    : ['/usr/local/bin', '/usr/bin', '/bin']

  const currentPath = process.env.PATH || ''
  const enhancedPath = extraPaths.join(path.delimiter) + path.delimiter + currentPath

  const logFilePath = path.join(projectRootDir, 'openagents-desktop-engine.log')
  let outFd: number | 'ignore' = 'ignore'
  try {
    outFd = fs.openSync(logFilePath, 'a')
  } catch {
    outFd = 'ignore'
  }

  try {
    engineProcess = spawn(command, ['--filter', '@openagents/api', '--filter', '@openagents/web', 'run', 'dev'], {
      cwd: projectRootDir,
      detached: false,
      stdio: outFd === 'ignore' ? 'ignore' : ['ignore', outFd, outFd],
      shell: true,
      env: {
        ...process.env,
        PATH: enhancedPath,
        PORT: '3000',
        WEB_PORT: '3000',
        API_PORT: '3001',
        NODE_ENV: 'development'
      }
    })

    engineProcess.on('error', (err) => {
      console.error('[Desktop Engine] Failed to spawn engine process:', err)
    })

    engineProcess.on('exit', (code, signal) => {
      console.log(`[Desktop Engine] Engine process exited with code ${code}, signal ${signal}`)
      engineProcess = null
    })
  } catch (err) {
    console.error('[Desktop Engine] Spawn exception:', err)
  }

  return engineProcess
}

export function stopEngine() {
  if (engineProcess) {
    console.log('[Desktop Engine] Stopping engine process...')
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', engineProcess.pid!.toString(), '/f', '/t'], { stdio: 'ignore' })
      } catch {}
    } else {
      engineProcess.kill('SIGTERM')
    }
    engineProcess = null
  }
}

export async function getActiveWebPort(): Promise<number | null> {
  if (await isEngineRunning(3000)) return 3000
  if (await isEngineRunning(3002)) return 3002
  return null
}

export async function waitForEngine(maxTimeoutMs = 60000, onProgress?: (elapsed: number) => void): Promise<number | null> {
  const start = Date.now()
  while (Date.now() - start < maxTimeoutMs) {
    const apiAlive = await isApiRunning(3001)
    const webPort = await getActiveWebPort()
    if (apiAlive && webPort) return webPort
    if (onProgress) onProgress(Math.floor((Date.now() - start) / 1000))
    await new Promise((r) => setTimeout(r, 1000))
  }
  return null
}
