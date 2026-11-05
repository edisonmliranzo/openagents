'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { SandboxLanguage, SandboxRunResult, SandboxStatus } from '@openagents/sdk'
import { Box, Play, ShieldCheck, Trash2 } from 'lucide-react'

const SAMPLES: Record<SandboxLanguage, string> = {
  sh: 'echo "hello from the sandbox"\npwd',
  node: 'console.log("node", process.version, Object.keys(process.env).length, "env vars")',
  python: 'import sys\nprint("python", sys.version.split()[0])',
}

export default function SandboxExecPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [status, setStatus] = useState<SandboxStatus | null>(null)
  const [history, setHistory] = useState<SandboxRunResult[]>([])
  const [language, setLanguage] = useState<SandboxLanguage>('node')
  const [code, setCode] = useState(SAMPLES.node)
  const [isolation, setIsolation] = useState<'auto' | 'docker' | 'restricted'>('auto')
  const [network, setNetwork] = useState(false)
  const [timeoutMs, setTimeoutMs] = useState(10000)
  const [result, setResult] = useState<SandboxRunResult | null>(null)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([sdk.sandboxExec.status(), sdk.sandboxExec.history()])
      setStatus(s)
      setHistory(h)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load sandbox status (owner role required)')
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  const run = async () => {
    setRunning(true)
    try {
      const r = await sdk.sandboxExec.run({ language, code, isolation, network, timeoutMs })
      setResult(r)
      setHistory((h) => [r, ...h])
    } catch (e: any) {
      addToast('error', e?.message ?? 'Execution failed')
    } finally {
      setRunning(false)
    }
  }

  const modeBadge = (m: string) => (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${m === 'docker' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{m}</span>
  )

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4 pb-24">
        <header className="oa-float-card flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Box size={18} />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Sandboxed Tool Execution</h1>
              <p className="text-xs text-[var(--muted)]">
                Run snippets in an ephemeral Docker container (no network, memory/CPU/time limits, read-only mount) or a restricted fallback.
              </p>
            </div>
          </div>
          {status && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium">
              <ShieldCheck size={13} /> Docker {status.docker.available ? `v${status.docker.version}` : 'unavailable'} → {modeBadge(status.preferredMode)}
            </span>
          )}
        </header>

        <section className="oa-float-card space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={language}
              onChange={(e) => {
                const l = e.target.value as SandboxLanguage
                setLanguage(l)
                setCode(SAMPLES[l])
              }}
              className="rounded-lg border border-[var(--border)] bg-white px-2 py-2"
            >
              <option value="node">Node.js</option>
              <option value="python">Python</option>
              <option value="sh">Shell</option>
            </select>
            <select value={isolation} onChange={(e) => setIsolation(e.target.value as any)} className="rounded-lg border border-[var(--border)] bg-white px-2 py-2">
              <option value="auto">Isolation: auto</option>
              <option value="docker">Docker only</option>
              <option value="restricted">Restricted only</option>
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={network} onChange={(e) => setNetwork(e.target.checked)} /> network (Docker)
            </label>
            <label className="flex items-center gap-1">
              timeout ms
              <input type="number" value={timeoutMs} min={500} max={60000} onChange={(e) => setTimeoutMs(Number(e.target.value))} className="w-24 rounded-lg border border-[var(--border)] bg-white px-2 py-1" />
            </label>
            <button onClick={run} disabled={running || !code.trim()} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50">
              <Play size={13} /> {running ? 'Running…' : 'Run'}
            </button>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={9}
            className="w-full rounded-lg border border-[var(--border)] bg-slate-950 p-3 font-mono text-xs text-slate-100"
          />
        </section>

        {result && (
          <section className="oa-float-card space-y-2 p-5 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {modeBadge(result.mode)}
              <span>exit {result.exitCode ?? '—'}</span>
              <span>{result.durationMs}ms</span>
              {result.timedOut && <span className="font-semibold text-rose-700">timed out</span>}
              {result.truncated && <span className="text-amber-700">output truncated</span>}
              <span className="text-[var(--muted)]">network {result.network ? 'on' : 'off'}</span>
            </div>
            {result.fallbackReason && <p className="text-amber-700">Fallback: {result.fallbackReason}</p>}
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3">{result.stdout || '(no stdout)'}</pre>
            {result.stderr && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-rose-50 p-3 text-rose-800">{result.stderr}</pre>}
          </section>
        )}

        <section className="oa-float-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">History ({history.length})</h2>
            {history.length > 0 && (
              <button
                onClick={async () => {
                  await sdk.sandboxExec.clearHistory()
                  setHistory([])
                }}
                className="inline-flex items-center gap-1 text-xs text-[var(--muted)]"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id}>
                <button onClick={() => setResult(h)} className="w-full rounded-xl border border-[var(--border)] bg-white/75 p-3 text-left text-xs">
                  <div className="flex items-center gap-2">
                    {modeBadge(h.mode)}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase">{h.language}</span>
                    <span>exit {h.exitCode ?? '—'}</span>
                    <span className="ml-auto text-[var(--muted)]">{new Date(h.at).toLocaleString()} · {h.durationMs}ms</span>
                  </div>
                  <pre className="mt-1 truncate font-mono text-[11px] text-[var(--muted)]">{h.codePreview.split('\n')[0]}</pre>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
