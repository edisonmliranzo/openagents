'use client'

import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import styles from './CodeEditor.module.css'

export interface FileTab {
  id: string
  name: string
  path: string
  content: string
  language: string
  modified: boolean
}

export interface CodeEditorProps {
  initialContent?: string
  language?: string
  theme?: 'vs-dark' | 'vs-light'
  onChange?: (value: string) => void
  onSave?: (value: string) => void
  readOnly?: boolean
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  csharp: 'cs',
  cpp: 'cpp',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  html: 'html',
  css: 'css',
  json: 'json',
  markdown: 'md',
  sql: 'sql',
  yaml: 'yaml',
  shell: 'sh',
}

export function CodeEditor({
  initialContent = '',
  language = 'javascript',
  theme = 'vs-dark',
  onChange,
  onSave,
  readOnly = false,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    const editor = monaco.editor.create(containerRef.current, {
      value: initialContent,
      language,
      theme,
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      tabSize: 2,
      insertSpaces: true,
      scrollBeyondLastLine: false,
      readOnly,
      wordWrap: 'on',
      padding: { top: 16 },
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      parameterHints: { enabled: true },
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'mouseover',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
      },
    })

    editorRef.current = editor

    editor.onDidChangeModelContent(() => {
      const value = editor.getValue()
      onChange?.(value)
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const value = editor.getValue()
      onSave?.(value)
    })

    setIsReady(true)

    return () => {
      editor.dispose()
    }
  }, [])

  useEffect(() => {
    if (editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, language)
      }
    }
  }, [language])

  const runCode = async () => {
    if (!editorRef.current) return

    const code = editorRef.current.getValue()
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
    <div className={styles.editorContainer}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.languageLabel}>{language.toUpperCase()}</span>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.runButton} onClick={runCode} title="Run Code (Ctrl+Enter)">
            ▶ Run
          </button>
        </div>
      </div>
      <div ref={containerRef} className={styles.editor} />
      {!isReady && <div className={styles.loading}>Loading editor...</div>}
    </div>
  )
}

export function createFileTab(name: string, path: string, content: string = ''): FileTab {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
  }

  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    path,
    content,
    language: languageMap[ext] || 'plaintext',
    modified: false,
  }
}

export function getLanguageFromFileName(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    bash: 'shell',
  }
  return languageMap[ext] || 'plaintext'
}
