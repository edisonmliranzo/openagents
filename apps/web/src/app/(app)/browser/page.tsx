'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, Globe, Keyboard, Loader2, MousePointerClick, Play, RefreshCw, Square, X,
} from 'lucide-react'
import { sdk, useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

type ActionType = 'navigate' | 'click' | 'type' | 'scroll' | 'extract' | 'press'
interface ActionInput { type: ActionType; selector?: string; value?: string; url?: string }
interface LogEntry { id: string; at: string; action: ActionInput; status: string; detail?: string }
interface Pending { id: string; action: ActionInput; reason: string; createdAt: string }
interface SessionRow { id: string; url: string; status: string; createdAt: string }
interface Frame { sessionId: string; url: string; status: string; screenshot?: string | null; log: LogEntry[]; pending: Pending[] }

const STATUS_COLORS: Record<string, string> = {
  executed: 'text-emerald-500',
  approved: 'text-emerald-500',
  failed: 'text-red-500',
  denied: 'text-red-500',
  needs_approval: 'text-amber-500',
}

export default function BrowserPage() {
  const addToast = useUIStore((s) => s.addToast)
  const accessToken = useAuthStore((s) => s.accessToken)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionId, setSessionId] = useState('')
  const [urlInput, setUrlInput] = useState('https://example.com')
  const [frame, setFrame] = useState<Frame | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selector, setSelector] = useState('')
  const [value, setValue] = useState('')
  const [extracted, setExtracted] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(async () => {
    try {
      const rows = (await sdk.browser.listSessions()) as SessionRow[]
      setSessions(rows)
      setSessionId((current) => current || rows[0]?.id || '')
    } catch (error: any) {
      addToast('error', error?.message ?? 'Failed to load sessions')
    }
  }, [addToast])

  useEffect(() => { void loadSessions() }, [loadSessions])

  // SSE stream via fetch (EventSource cannot send Authorization headers).
  useEffect(() => {
    if (!sessionId || !accessToken) return
    const controller = new AbortController()
    setFrame(null)
    setScreenshot(null)
    ;(async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/v1/browser/sessions/${encodeURIComponent(sessionId)}/stream`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`)
        setConnected(true)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { done, value: chunk } = await reader.read()
          if (done) break
          buffer += decoder.decode(chunk, { stream: true })
          let idx: number
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const raw = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            const event = /^event: (.+)$/m.exec(raw)?.[1]
            const data = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n')
            if (event === 'frame' && data) {
              const next = JSON.parse(data) as Frame
              setFrame(next)
              if (next.screenshot) setScreenshot(next.screenshot)
            } else if (event === 'end') {
              void loadSessions()
            }
          }
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') addToast('warning', error?.message ?? 'Live stream disconnected')
      } finally {
        setConnected(false)
      }
    })()
    return () => controller.abort()
  }, [sessionId, accessToken, addToast, loadSessions])

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'end' }) }, [frame?.log.length])

  async function go() {
    if (!urlInput.trim()) return
    setBusy(true)
    try {
      if (sessionId && frame?.status === 'active') {
        await runAction({ type: 'navigate', url: urlInput.trim() })
      } else {
        const session = (await sdk.browser.startSession(urlInput.trim())) as SessionRow
        setSessionId(session.id)
        await loadSessions()
      }
    } catch (error: any) {
      addToast('error', error?.message ?? 'Navigation failed')
    } finally {
      setBusy(false)
    }
  }

  async function runAction(action: ActionInput) {
    if (!sessionId) return
    setBusy(true)
    try {
      const result: any = await sdk.browser.action(sessionId, action)
      if (result?.status === 'needs_approval') addToast('warning', `Approval required: ${result.reason}`)
      else if (result?.status === 'error') addToast('error', String(result.result ?? 'Action failed'))
      else if (action.type === 'extract') setExtracted(String(result?.result ?? ''))
    } catch (error: any) {
      addToast('error', error?.message ?? 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  async function decide(pendingId: string, decision: 'approve' | 'deny') {
    try {
      const result: any = decision === 'approve'
        ? await sdk.browser.approve(sessionId, pendingId)
        : await sdk.browser.deny(sessionId, pendingId)
      if (result?.status === 'error') addToast('error', String(result.result ?? 'Action failed'))
      else addToast('success', decision === 'approve' ? 'Action approved' : 'Action denied')
    } catch (error: any) {
      addToast('error', error?.message ?? 'Failed')
    }
  }

  async function closeSession() {
    if (!sessionId) return
    await sdk.browser.close(sessionId).catch(() => undefined)
    setSessionId('')
    setFrame(null)
    setScreenshot(null)
    await loadSessions()
  }

  const pending = frame?.pending ?? []
  const log = frame?.log ?? []

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-indigo-500" />
        <h1 className="text-lg font-semibold">OpenAgents Browser</h1>
        <span className={`ml-2 text-xs ${connected ? 'text-emerald-500' : 'text-slate-400'}`}>
          {connected ? '● live' : '○ offline'}
        </span>
        <select
          className="ml-auto rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">New session</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.url.slice(0, 50)} ({s.status})</option>)}
        </select>
        <button onClick={() => void loadSessions()} className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void go() }}>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://"
          className="flex-1 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        />
        <button disabled={busy} className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Go
        </button>
        {sessionId && (
          <button type="button" onClick={() => void closeSession()} className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
            <Square className="h-4 w-4" /> Close
          </button>
        )}
      </form>

      {pending.map((p) => (
        <div key={p.id} className="flex items-center gap-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <div className="font-medium">Approval needed: {p.reason}</div>
            <div className="text-xs text-slate-500">
              {p.action.type} {p.action.selector ?? p.action.url ?? ''}
            </div>
          </div>
          <button onClick={() => void decide(p.id, 'approve')} className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-white">
            <Check className="h-3.5 w-3.5" /> Approve
          </button>
          <button onClick={() => void decide(p.id, 'deny')} className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-white">
            <X className="h-3.5 w-3.5" /> Deny
          </button>
        </div>
      ))}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="truncate border-b border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800">
            {frame?.url ?? 'No active session'}
          </div>
          <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 dark:bg-slate-900">
            {screenshot
              ? <img src={screenshot} alt="Live browser view" className="max-h-full max-w-full object-contain" />
              : <span className="text-sm text-slate-400">Enter a URL and press Go to start a session.</span>}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-3">
          <section className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <h2 className="text-sm font-medium">Manual controls</h2>
            <input value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="CSS selector"
              className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700" />
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Text / key / scroll px"
              className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700" />
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <Ctl disabled={!sessionId || busy || !selector} onClick={() => void runAction({ type: 'click', selector })} icon={<MousePointerClick className="h-3.5 w-3.5" />} label="Click" />
              <Ctl disabled={!sessionId || busy || !selector} onClick={() => void runAction({ type: 'type', selector, value })} icon={<Keyboard className="h-3.5 w-3.5" />} label="Type" />
              <Ctl disabled={!sessionId || busy} onClick={() => void runAction({ type: 'press', value: value || 'Enter' })} icon={<Keyboard className="h-3.5 w-3.5" />} label="Key" />
              <Ctl disabled={!sessionId || busy} onClick={() => void runAction({ type: 'scroll', value: '-600' })} icon={<ArrowUp className="h-3.5 w-3.5" />} label="Up" />
              <Ctl disabled={!sessionId || busy} onClick={() => void runAction({ type: 'scroll', value: '600' })} icon={<ArrowDown className="h-3.5 w-3.5" />} label="Down" />
              <Ctl disabled={!sessionId || busy} onClick={() => void runAction({ type: 'extract', selector: selector || undefined })} icon={<Globe className="h-3.5 w-3.5" />} label="Extract" />
            </div>
            {extracted && (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-xs dark:bg-slate-900">{extracted}</pre>
            )}
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 dark:border-slate-800">
            <h2 className="border-b border-slate-200 px-3 py-2 text-sm font-medium dark:border-slate-800">Action log</h2>
            <div className="flex-1 space-y-1 overflow-auto p-2 text-xs">
              {log.length === 0 && <div className="text-slate-400">No actions yet.</div>}
              {log.map((entry) => (
                <div key={entry.id + entry.status} className="flex gap-2">
                  <span className="shrink-0 text-slate-400">{new Date(entry.at).toLocaleTimeString()}</span>
                  <span className={`shrink-0 ${STATUS_COLORS[entry.status] ?? ''}`}>{entry.status}</span>
                  <span className="truncate" title={entry.detail}>
                    {entry.action.type} {entry.action.selector ?? entry.action.url ?? ''}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Ctl({ onClick, disabled, icon, label }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center justify-center gap-1 rounded border border-slate-300 px-2 py-1.5 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">
      {icon}{label}
    </button>
  )
}
