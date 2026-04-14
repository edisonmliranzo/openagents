'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import 'xterm/css/xterm.css'
import styles from './CodeEditor.module.css'

export interface TerminalProps {
  wsUrl?: string
  onData?: (data: string) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export function Terminal({ wsUrl, onData, onConnect, onDisconnect }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState('Connecting...')

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#cccccc',
        cursorAccent: '#000000',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(searchAddon)
    terminal.loadAddon(webLinksAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    terminal.writeln('\x1b[1;32mOpenAgents Terminal\x1b[0m')
    terminal.writeln('Type "help" for available commands, "clear" to clear screen')
    terminal.writeln('')

    if (wsUrl) {
      connectWebSocket(terminal, wsUrl)
    } else {
      setupLocalTerminal(terminal)
    }

    const handleResize = () => {
      fitAddon.fit()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
      wsRef.current?.close()
    }
  }, [wsUrl])

  const setupLocalTerminal = (terminal: XTerm) => {
    let currentLine = ''

    terminal.onData((data) => {
      const code = data.charCodeAt(0)

      if (code === 13) {
        terminal.writeln('')
        handleCommand(terminal, currentLine)
        currentLine = ''
      } else if (code === 127) {
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1)
          terminal.write('\b \b')
        }
      } else if (code >= 32) {
        currentLine += data
        terminal.write(data)
      }
    })
  }

  const handleCommand = (terminal: XTerm, command: string) => {
    const trimmed = command.trim()

    if (!trimmed) return

    if (trimmed === 'clear') {
      terminal.clear()
      return
    }

    if (trimmed === 'help') {
      terminal.writeln('\x1b[1;36mAvailable Commands:\x1b[0m')
      terminal.writeln('  help     - Show this help message')
      terminal.writeln('  clear    - Clear the terminal')
      terminal.writeln('  date     - Show current date/time')
      terminal.writeln('  whoami   - Show current user')
      terminal.writeln('  pwd      - Show current directory')
      terminal.writeln('  ls       - List files')
      terminal.writeln('  echo     - Echo text back')
      terminal.writeln('')
      return
    }

    if (trimmed === 'date') {
      terminal.writeln(new Date().toString())
      return
    }

    if (trimmed === 'whoami') {
      terminal.writeln('user@openagents')
      return
    }

    if (trimmed === 'pwd') {
      terminal.writeln('/workspace')
      return
    }

    if (trimmed === 'ls') {
      terminal.writeln('drwxr-xr-x  packages/')
      terminal.writeln('drwxr-xr-x  apps/')
      terminal.writeln('drwxr-xr-x  docs/')
      terminal.writeln('-rw-r--r--  package.json')
      terminal.writeln('-rw-r--r--  README.md')
      return
    }

    if (trimmed.startsWith('echo ')) {
      terminal.writeln(trimmed.slice(5))
      return
    }

    executeCommand(terminal, trimmed)
  }

  const executeCommand = async (terminal: XTerm, command: string) => {
    try {
      const response = await fetch('/api/terminal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })

      const result = await response.json()

      if (result.success) {
        if (result.output) {
          terminal.writeln(result.output)
        }
      } else {
        terminal.writeln(`\x1b[31mError: ${result.error}\x1b[0m`)
      }
    } catch (error) {
      terminal.writeln(`\x1b[31mFailed to execute command: ${error}\x1b[0m`)
    }
  }

  const connectWebSocket = (terminal: XTerm, url: string) => {
    try {
      const ws = new WebSocket(url)

      ws.onopen = () => {
        setIsConnected(true)
        setStatus('Connected')
        onConnect?.()
        terminal.writeln('\x1b[32mConnected to terminal server\x1b[0m\r\n')
      }

      ws.onmessage = (event) => {
        terminal.write(event.data)
      }

      ws.onclose = () => {
        setIsConnected(false)
        setStatus('Disconnected')
        onDisconnect?.()
      }

      ws.onerror = () => {
        setStatus('Connection error')
      }

      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
        onData?.(data)
      })

      wsRef.current = ws
    } catch (error) {
      terminal.writeln(`\x1b[31mFailed to connect: ${error}\x1b[0m`)
    }
  }

  const clearTerminal = () => {
    terminalRef.current?.clear()
    terminalRef.current?.writeln('\x1b[1;32mTerminal cleared\x1b[0m')
  }

  return (
    <div className={styles.terminalContainer}>
      <div className={styles.terminalHeader}>
        <div className={styles.toolbarLeft}>
          <span className={styles.languageLabel}>TERMINAL</span>
          <span
            className={styles.languageLabel}
            style={{ color: isConnected ? '#0dbc79' : '#cd3131' }}
          >
            {status}
          </span>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.saveButton} onClick={clearTerminal}>
            Clear
          </button>
        </div>
      </div>
      <div ref={containerRef} className={styles.editor} />
    </div>
  )
}

export function useTerminal() {
  const terminalRef = useRef<XTerm | null>(null)

  const write = useCallback((text: string) => {
    terminalRef.current?.write(text)
  }, [])

  const writeln = useCallback((text: string) => {
    terminalRef.current?.writeln(text)
  }, [])

  const clear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  return { write, writeln, clear, focus, terminalRef }
}
