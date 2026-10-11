import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron'
import path from 'node:path'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const DEFAULT_PORT = process.env.WEB_PORT || '3002'
const LOCAL_APP_URL = process.env.OPENAGENTS_DESKTOP_URL || `http://127.0.0.1:${DEFAULT_PORT}/chat`
const FALLBACK_ONLINE_URL = 'https://openagents.us/chat'

function createWindow() {
  const iconPath = path.join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OpenAgents',
    icon: icon.isEmpty() ? undefined : icon,
    backgroundColor: '#0b1120',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true
    }
  })

  // Smooth loading
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Prevent app closing on red X if minimizeToTray is preferred
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // Load local agent direct entry point
  loadAgentWorkspace(mainWindow)

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

async function loadAgentWorkspace(win: BrowserWindow) {
  try {
    // Attempt local agent engine
    await win.loadURL(LOCAL_APP_URL)
  } catch {
    console.warn(`[Desktop] Local server not yet responding at ${LOCAL_APP_URL}, trying fallback...`)
    try {
      await win.loadURL(FALLBACK_ONLINE_URL)
    } catch {
      win.loadURL(`data:text/html,
        <html style="background:#0b1120;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;">
          <div style="text-align:center;max-width:480px;padding:32px;background:#1e293b;border-radius:16px;border:1px solid #334155;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#f8fafc;">Connecting to Local OpenAgents Engine...</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.5;">Make sure your OpenAgents core engine is running, or reload once started.</p>
            <button onclick="location.reload()" style="background:#f43f5e;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">Retry Connection</button>
          </div>
        </html>`)
    }
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('OpenAgents - Autonomous AI Operating System')

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
        mainWindow?.loadURL(LOCAL_APP_URL)
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Status: Engine Ready',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit OpenAgents',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function registerGlobalShortcuts() {
  // Global summon hotkey: Ctrl+Shift+Space (or Cmd+Shift+Space)
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

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    setupIpc()
    createWindow()
    createTray()
    registerGlobalShortcuts()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else {
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })
}
