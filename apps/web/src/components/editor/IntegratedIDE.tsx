'use client'

import { useState, useCallback } from 'react'
import { CodeEditor, FileTab, getLanguageFromFileName } from './CodeEditor'
import { Terminal } from './Terminal'
import styles from './IntegratedIDE.module.css'

export interface IntegratedIDEProps {
  workspaceId?: string
}

export function IntegratedIDE({ workspaceId }: IntegratedIDEProps) {
  const [tabs, setTabs] = useState<FileTab[]>([
    {
      id: 'welcome',
      name: 'welcome.js',
      path: '/workspace/welcome.js',
      content:
        '// Welcome to OpenAgents IDE\n// Create or open a file to start coding\n\nconsole.log("Hello, World!");',
      language: 'javascript',
      modified: false,
    },
  ])
  const [activeTabId, setActiveTabId] = useState<string>('welcome')
  const [showTerminal, setShowTerminal] = useState(true)
  const [terminalHeight, setTerminalHeight] = useState(250)

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const handleTabClose = (tabId: string) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== tabId)
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id)
      }
      return newTabs
    })
  }

  const handleNewFile = () => {
    const newTab: FileTab = {
      id: `file-${Date.now()}`,
      name: 'untitled.js',
      path: `/workspace/untitled.js`,
      content: '',
      language: 'javascript',
      modified: true,
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const handleContentChange = (content: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, content, modified: true } : t)),
    )
  }

  const handleSave = async (content: string) => {
    if (!activeTab) return

    try {
      const response = await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeTab.path,
          content,
        }),
      })

      if (response.ok) {
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, modified: false } : t)))
      }
    } catch (error) {
      console.error('Failed to save:', error)
    }
  }

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      const existingTab = tabs.find((t) => t.path === filePath)
      if (existingTab) {
        setActiveTabId(existingTab.id)
        return
      }

      try {
        const response = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`)
        if (response.ok) {
          const { content } = await response.json()
          const fileName = filePath.split('/').pop() || 'untitled'
          const newTab: FileTab = {
            id: `file-${Date.now()}`,
            name: fileName,
            path: filePath,
            content,
            language: getLanguageFromFileName(fileName),
            modified: false,
          }
          setTabs((prev) => [...prev, newTab])
          setActiveTabId(newTab.id)
        }
      } catch (error) {
        console.error('Failed to open file:', error)
      }
    },
    [tabs],
  )

  const handleRunCode = async (code: string, language: string) => {
    try {
      const response = await fetch('/api/code-execution/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      })
      const result = await response.json()
      return result
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  return (
    <div className={styles.ideContainer}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`${styles.tab} ${tab.id === activeTabId ? styles.activeTab : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className={styles.tabName}>
                {tab.modified && <span className={styles.modifiedDot}>●</span>}
                {tab.name}
              </span>
              <button
                className={styles.closeButton}
                onClick={(e) => {
                  e.stopPropagation()
                  handleTabClose(tab.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button className={styles.newTabButton} onClick={handleNewFile}>
            + New
          </button>
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.actionButton} ${showTerminal ? styles.active : ''}`}
            onClick={() => setShowTerminal(!showTerminal)}
            title="Toggle Terminal"
          >
            Terminal
          </button>
        </div>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.editorPanel}>
          {activeTab && (
            <CodeEditor
              initialContent={activeTab.content}
              language={activeTab.language}
              onChange={handleContentChange}
              onSave={handleSave}
            />
          )}
        </div>

        {showTerminal && (
          <div className={styles.terminalPanel} style={{ height: terminalHeight }}>
            <Terminal />
          </div>
        )}
      </div>

      <div className={styles.statusBar}>
        <span>Workspace: {workspaceId || 'default'}</span>
        <span>Language: {activeTab?.language || 'plaintext'}</span>
        <span>{activeTab?.modified ? 'Modified' : 'Saved'}</span>
      </div>
    </div>
  )
}

export function useIDE() {
  return { IntegratedIDE }
}
