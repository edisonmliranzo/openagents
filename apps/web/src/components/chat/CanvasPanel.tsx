'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Code2, Download, Eye, Loader2, Pencil, Save, X } from 'lucide-react'
import type { ArtifactDetail } from '@openagents/shared'
import { sdk } from '@/stores/auth'
import { useCanvasStore } from '@/stores/canvas'
import { useUIStore } from '@/stores/ui'

type Kind = 'markdown' | 'html' | 'code'

function detectKind(format: string | undefined, content: string): Kind {
  const f = (format ?? '').toLowerCase()
  if (f.includes('html') || /^\s*<(!doctype|html|body|div|section)/i.test(content)) return 'html'
  if (f.includes('md') || f.includes('markdown') || f === 'text' || f === '') return 'markdown'
  return 'code'
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Tiny, safe markdown renderer (escapes first, then applies a few rules). */
function renderMarkdown(md: string): string {
  const blocks = escapeHtml(md).split(/```/)
  return blocks
    .map((block, i) => {
      if (i % 2 === 1) return `<pre><code>${block.replace(/^\w*\n/, '')}</code></pre>`
      return block
        .replace(/^### (.*)$/gm, '<h3>$1</h3>')
        .replace(/^## (.*)$/gm, '<h2>$1</h2>')
        .replace(/^# (.*)$/gm, '<h1>$1</h1>')
        .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n{2,}/g, '<br/><br/>')
    })
    .join('')
}

const EXT: Record<Kind, string> = { markdown: 'md', html: 'html', code: 'txt' }

export default function CanvasPanel() {
  const { open, artifactId, width, close, setWidth } = useCanvasStore()
  const addToast = useUIStore((s) => s.addToast)
  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const dragging = useRef(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const detail = await sdk.artifacts.get(id)
      setArtifact(detail)
      setDraft(detail.currentVersion?.content ?? '')
      setMode('preview')
    } catch (error: any) {
      addToast('error', error?.message ?? 'Failed to load artifact')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { if (open && artifactId) void load(artifactId) }, [open, artifactId, load])

  useEffect(() => {
    const move = (e: MouseEvent) => { if (dragging.current) setWidth(window.innerWidth - e.clientX) }
    const up = () => { dragging.current = false; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [setWidth])

  if (!open) return null

  const format = artifact?.currentVersion?.format
  const kind = detectKind(format, draft)
  const dirty = artifact ? draft !== (artifact.currentVersion?.content ?? '') : false

  async function saveVersion() {
    if (!artifact) return
    setSaving(true)
    try {
      const next = await sdk.artifacts.addVersion(artifact.id, { content: draft, format, note: 'Edited in Canvas' })
      setArtifact(next)
      addToast('success', `Saved version ${next.currentVersion?.version ?? ''}`)
    } catch (error: any) {
      addToast('error', error?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function exportArtifact() {
    if (!artifact) return
    let content = draft
    let fileName = `${artifact.title || 'artifact'}.${EXT[kind]}`
    let mime = kind === 'html' ? 'text/html' : 'text/plain'
    if (!dirty) {
      try {
        const res = await sdk.artifacts.export(artifact.id)
        content = res.content
        fileName = res.fileName
        mime = res.mimeType
      } catch { /* fall back to local draft */ }
    }
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const srcDoc = kind === 'html'
    ? draft
    : `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px/1.6 system-ui,sans-serif;padding:16px;color:#0f172a}pre{background:#f1f5f9;padding:12px;border-radius:6px;overflow:auto}code{font-family:ui-monospace,monospace}</style></head><body>${
      kind === 'markdown' ? renderMarkdown(draft) : `<pre><code>${escapeHtml(draft)}</code></pre>`
    }</body></html>`

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      style={{ width }}
    >
      <div
        className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-indigo-400/50"
        onMouseDown={() => { dragging.current = true; document.body.style.userSelect = 'none' }}
      />
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <Code2 className="h-4 w-4 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{artifact?.title ?? 'Canvas'}</div>
          {artifact && <div className="text-xs text-slate-500">v{artifact.currentVersion?.version} · {kind}{dirty ? ' · unsaved' : ''}</div>}
        </div>
        <button onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" title={mode === 'edit' ? 'Preview' : 'Edit'}>
          {mode === 'edit' ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </button>
        <button onClick={() => void saveVersion()} disabled={!dirty || saving} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800" title="Save as new version">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </button>
        <button onClick={() => void exportArtifact()} disabled={!artifact} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800" title="Export">
          <Download className="h-4 w-4" />
        </button>
        <button onClick={close} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" title="Close">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : mode === 'edit' ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-3 font-mono text-xs outline-none"
          />
        ) : (
          <iframe title="Artifact preview" sandbox="allow-scripts" srcDoc={srcDoc} className="h-full w-full border-0 bg-white" />
        )}
      </div>
    </aside>
  )
}
