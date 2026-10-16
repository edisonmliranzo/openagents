import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, NativeImage, Notification, shell, Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

app.setName('OpenAgents')

export function debugLog(msg: string) {
  try {
    const logPath = path.join(app.getPath('userData'), 'desktop-debug.log')
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {}
}

debugLog('App script initialized. PID: ' + process.pid)

import {
  ensureDockerServices,
  findProjectRootDir,
  getActiveWebPort,
  isApiRunning,
  isEngineRunning,
  startEngine,
  stopEngine,
  waitForEngine
} from './engine'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const DEFAULT_PORT = process.env.WEB_PORT || '3000'
const LOCAL_APP_URL = `http://127.0.0.1:${DEFAULT_PORT}/chat`

function getSplashHtml(status = 'Starting OpenAgents Local Engine...'): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OpenAgents</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b1120;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }
    .card {
      text-align: center;
      max-width: 440px;
      padding: 40px;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(51, 65, 85, 0.8);
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(16px);
    }
    .logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      border-radius: 16px;
      background: linear-gradient(135deg, #f43f5e, #fb923c);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 24px;
      color: #fff;
      box-shadow: 0 10px 25px -5px rgba(244, 63, 94, 0.4);
    }
    h2 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    p {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .spinner-bar {
      width: 100%;
      height: 4px;
      background: rgba(51, 65, 85, 0.6);
      border-radius: 999px;
      overflow: hidden;
      position: relative;
    }
    .spinner-bar::after {
      content: '';
      position: absolute;
      top: 0; left: 0; bottom: 0;
      width: 40%;
      background: linear-gradient(90deg, #f43f5e, #fb923c);
      border-radius: 999px;
      animation: progress 1.4s infinite ease-in-out;
    }
    @keyframes progress {
      0% { left: -40%; width: 40%; }
      50% { left: 30%; width: 60%; }
      100% { left: 100%; width: 40%; }
    }
    .status-text {
      margin-top: 14px;
      font-size: 11px;
      font-weight: 600;
      color: #cbd5e1;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">OA</div>
    <h2>OpenAgents</h2>
    <p>Initializing autonomous multi-agent operating engine and local neural workspace...</p>
    <div class="spinner-bar"></div>
    <div class="status-text">${status}</div>
  </div>
</body>
</html>
  `)}`
}

function getTrayIcon(): NativeImage {
  const candidateIcons = [
    path.join(process.resourcesPath, 'resources/icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(__dirname, '../../resources/icon.png'),
    path.join(__dirname, '../resources/icon.png'),
  ]
  for (const p of candidateIcons) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) return img
      }
    } catch {}
  }
  return nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA8SURBVDhPY/wPBAwUACYoTpyB8T+yGowYGBj/k2U41QygnwE0Nf/JtpygAWhqGZplqG6AVDPwR4aBAQAAeJ4P2b7g0/wAAAAASUVORK5CYII=',
      'base64'
    )
  )
}

function configureAutoStart(enable: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: false,
      name: 'OpenAgents'
    })
  } catch (err) {
    console.warn('[Desktop] Could not set Windows login item settings:', err)
  }
}

function createWindow() {
  debugLog('createWindow invoked')
  const icon = getTrayIcon()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OpenAgents',
    icon: icon.isEmpty() ? undefined : icon,
    backgroundColor: '#0b1120',
    show: true,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    debugLog('mainWindow ready-to-show')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  mainWindow.show()
  mainWindow.focus()

  // Close to tray behavior
  mainWindow.on('close', (event) => {
    debugLog('mainWindow close event received. isQuitting = ' + isQuitting)
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    console.log('[Desktop] mainWindow closed event received!')
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  launchAppPipeline(mainWindow)
}

let currentWorkspaceUrl = LOCAL_APP_URL

async function launchAppPipeline(win: BrowserWindow) {
  debugLog('launchAppPipeline started')
  win.webContents.on('render-process-gone', (_event, details) => {
    debugLog('Render process gone: ' + JSON.stringify(details))
    console.warn('[Desktop] Render process gone:', details)
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.loadURL(currentWorkspaceUrl).catch(() => {})
        }
      }, 1500)
    }
  })

  // Step 1: Check if local engine is already running
  debugLog('Checking if engine/api is running...')
  const [existingPort, apiActive] = await Promise.all([
    getActiveWebPort(),
    isApiRunning(3001)
  ])
  debugLog(`Check result: existingPort=${existingPort}, apiActive=${apiActive}`)

  if (existingPort && apiActive) {
    currentWorkspaceUrl = `http://127.0.0.1:${existingPort}/chat`
    debugLog('Engine already active at: ' + currentWorkspaceUrl)
    console.log('[Desktop] Engine already active at', currentWorkspaceUrl)
    try {
      debugLog('Calling win.loadURL: ' + currentWorkspaceUrl)
      await win.loadURL(currentWorkspaceUrl)
      debugLog('win.loadURL resolved successfully')
    } catch (err: any) {
      debugLog('win.loadURL threw error: ' + (err?.message || String(err)))
      console.warn('[Desktop] Initial loadURL retry scheduled:', err)
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.loadURL(currentWorkspaceUrl).catch(() => {})
        }
      }, 2000)
    }
    return
  }

  // Step 2: Show startup splash
  debugLog('Engine offline or starting. Displaying splash...')
  console.log('[Desktop] Engine offline or starting. Displaying splash...')
  try {
    await win.loadURL(getSplashHtml('Starting background engine...'))
    debugLog('Splash loaded successfully')
  } catch (err: any) {
    debugLog('Splash loadURL error: ' + (err?.message || String(err)))
  }

  const rootDir = findProjectRootDir()

  // Step 3: Ensure Docker containers (Postgres & Redis) are running
  try {
    await ensureDockerServices(rootDir)
  } catch {}

  // Step 4: Automatically spawn background engine
  startEngine(rootDir)

  // Step 5: Wait for services with live UI progress
  const activePort = await waitForEngine(60000, (elapsed) => {
    if (!win.isDestroyed()) {
      win.webContents.executeJavaScript(`
        const el = document.querySelector('.status-text');
        if (el) el.innerText = 'Initializing local engine (${elapsed}s)...';
      `).catch(() => {})
    }
  })

  if (activePort) {
    currentWorkspaceUrl = `http://127.0.0.1:${activePort}/chat`
    console.log('[Desktop] Engine is online! Loading workspace at', currentWorkspaceUrl)
    try {
      await win.loadURL(currentWorkspaceUrl)
    } catch (err) {
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.loadURL(currentWorkspaceUrl).catch(() => {})
        }
      }, 2000)
    }
  } else {
    const fallbackPort = (await getActiveWebPort()) || 3000
    currentWorkspaceUrl = `http://127.0.0.1:${fallbackPort}/chat`
    console.warn('[Desktop] Engine startup taking longer. Showing manual reload option.')
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <html style="background:#0b1120;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;">
          <div style="text-align:center;max-width:440px;padding:32px;background:#1e293b;border-radius:16px;border:1px solid #334155;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#f8fafc;">Local Engine Starting...</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.5;">Your local OpenAgents services are compiling. Click below once ready.</p>
            <button onclick="location.href='${currentWorkspaceUrl}'" style="background:#f43f5e;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-weight:600;cursor:pointer;font-size:14px;">Open Workspace</button>
          </div>
        </html>`)}`)
    } catch {}
  }
}

function createTray() {
  try {
    const icon = getTrayIcon()
    tray = new Tray(icon)
    try {
      tray.setToolTip('OpenAgents - Autonomous AI Operating System')
    } catch {}

    let autoStartEnabled = true
    try {
      autoStartEnabled = app.getLoginItemSettings().openAtLogin
    } catch {}

    const updateMenu = () => {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Open Workspace',
          click: () => {
            mainWindow?.show()
            mainWindow?.focus()
          }
        },
        {
          label: 'New Chat',
          click: () => {
            mainWindow?.show()
            mainWindow?.loadURL(currentWorkspaceUrl)
            mainWindow?.focus()
          }
        },
        { type: 'separator' },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          checked: autoStartEnabled,
          click: (item) => {
            autoStartEnabled = item.checked
            configureAutoStart(autoStartEnabled)
            updateMenu()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit OpenAgents',
          click: () => {
            isQuitting = true
            stopEngine()
            app.quit()
          }
        }
      ])
      tray?.setContextMenu(contextMenu)
    }

    updateMenu()

    tray.on('double-click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  } catch (err) {
    console.warn('[Desktop] Tray initialization skipped or failed:', err)
  }
}

function registerGlobalShortcuts() {
  const shortcut = 'CommandOrControl+Shift+Space'
  globalShortcut.register(shortcut, () => {
    if (!mainWindow) {
      createWindow()
      return
    }

    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function setupIpc() {
  ipcMain.handle('platform:info', () => ({
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion()
  }))

  ipcMain.handle('platform:notify', (_event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title: title || 'OpenAgents', body }).show()
    }
  })

  ipcMain.handle('platform:openPath', (_event, fullPath: string) => {
    return shell.openPath(fullPath)
  })
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
debugLog('Single instance lock acquired: ' + gotTheLock)

if (!gotTheLock) {
  debugLog('Exiting because another instance already holds the lock.')
  app.quit()
} else {
  app.on('second-instance', () => {
    debugLog('second-instance event received. Focusing window.')
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.setAlwaysOnTop(true)
      mainWindow.setAlwaysOnTop(false)
    } else {
      createWindow()
    }
  })

  app.whenReady().then(() => {
    debugLog('app.whenReady resolved successfully.')
    Menu.setApplicationMenu(null)
    // Automatically enable start with Windows by default
    configureAutoStart(true)

    setupIpc()
    createWindow()
    createTray()
    registerGlobalShortcuts()

    app.on('activate', () => {
      debugLog('app activate event received.')
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else {
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
  })

  app.on('window-all-closed', () => {
    debugLog('app window-all-closed event received. isQuitting=' + isQuitting)
    if (isQuitting) {
      app.quit()
    }
  })

  app.on('will-quit', () => {
    debugLog('app will-quit event received.')
    globalShortcut.unregisterAll()
    stopEngine()
  })

  app.on('before-quit', () => {
    debugLog('app before-quit event received.')
    isQuitting = true
  })
}

process.on('uncaughtException', (err) => {
  debugLog('Uncaught exception: ' + (err?.stack || err?.message || String(err)))
  console.error('[Desktop] Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  debugLog('Unhandled rejection: ' + String(reason))
  console.error('[Desktop] Unhandled rejection:', reason)
})

process.on('exit', (code) => {
  debugLog('Node process exit event fired with code: ' + code)
})
