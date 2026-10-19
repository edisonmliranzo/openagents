'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, CheckCircle2, Circle, ExternalLink, FileDown, Globe, Loader2, Search, XCircle } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

interface ResearchSource { n: number; url: string; title: string; snippet: string; kind: 'web' | 'library'; documentId?: string }
interface ResearchStep { id: string; label: string; status: 'pending' | 'running' | 'completed' | 'failed'; detail?: string }
interface ResearchJob {
  id: string; goal: string; status: 'running' | 'completed' | 'failed'
  steps: ResearchStep[]; queries: string[]; sources: ResearchSource[]; report: string; error?: string; artifactId?: string
}
interface ResearchApi {
  start: (input: { goal: string; includeLibrary?: boolean }) => Promise<ResearchJob>
  get: (id: string) => Promise<ResearchJob>
  export: (id: string, input?: { title?: string }) => Promise<{ artifactId: string }>
}

const researchApi = () => (sdk as unknown as { research: ResearchApi }).research

export default function ResearchPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [goal, setGoal] = useState('')
  const [includeLibrary, setIncludeLibrary] = useState(true)
  const [job, setJob] = useState<ResearchJob | null>(null)
  const [starting, setStarting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeSource, setActiveSource] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toast = useCallback((type: 'success' | 'error', message: string) => {
    addToast(type, message)
  }, [addToast])

  const poll = useCallback(async (id: string) => {
    try {
      const next = await researchApi().get(id)
      setJob(next)
      if (next.status === 'running') timer.current = setTimeout(() => void poll(id), 1500)
    } catch (err: any) {
      toast('error', err?.message ?? 'Failed to load research progress')
    }
  }, [toast])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function start() {
    if (!goal.trim() || starting) return
    if (timer.current) clearTimeout(timer.current)
    setStarting(true)
    setActiveSource(null)
    try {
      const created = await researchApi().start({ goal: goal.trim(), includeLibrary })
      setJob(created)
      void poll(created.id)
    } catch (err: any) {
      toast('error', err?.message ?? 'Failed to start research')
    } finally {
      setStarting(false)
    }
  }

  async function exportReport() {
    if (!job) return
    setExporting(true)
    try {
      const res = await researchApi().export(job.id)
      setJob({ ...job, artifactId: res.artifactId })
      toast('success', 'Report saved to Artifacts')
    } catch (err: any) {
      toast('error', err?.message ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const focusSource = (n: number) => {
    setActiveSource(n)
    document.getElementById(`source-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Search className="h-6 w-6" /> Deep Research</h1>
        <p className="mt-1 text-sm text-muted-foreground opacity-70">
          OpenAgents searches the web and your knowledge library, then writes a report with numbered citations.
        </p>
      </header>

      <section className="rounded-xl border border-white/10 p-4 space-y-3">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void start() }}
          placeholder="What do you want to research? e.g. Compare open-source vector databases for production RAG"
          rows={3}
          className="w-full resize-y rounded-lg border border-white/10 bg-transparent p-3 text-sm outline-none focus:border-blue-500"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeLibrary} onChange={(e) => setIncludeLibrary(e.target.checked)} />
            Include my knowledge library
          </label>
          <button
            onClick={() => void start()}
            disabled={!goal.trim() || starting || job?.status === 'running'}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {starting || job?.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {job?.status === 'running' ? 'Researching…' : 'Start research'}
          </button>
        </div>
      </section>

      {job && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6 min-w-0">
            <section className="rounded-xl border border-white/10 p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-70">Progress</h2>
              <ol className="space-y-2">
                {job.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    {s.status === 'completed' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-500" />
                      : s.status === 'running' ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-blue-500" />
                      : s.status === 'failed' ? <XCircle className="mt-0.5 h-4 w-4 text-red-500" />
                      : <Circle className="mt-0.5 h-4 w-4 opacity-40" />}
                    <div className="min-w-0">
                      <div>{s.label}</div>
                      {s.detail && <div className="truncate text-xs opacity-60">{s.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              {job.error && <p className="mt-3 text-sm text-red-500">{job.error}</p>}
            </section>

            {job.status === 'completed' && (
              <section className="rounded-xl border border-white/10 p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">Report</h2>
                  {job.artifactId ? (
                    <a href="/artifacts" className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline">
                      Saved to Artifacts <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <button
                      onClick={() => void exportReport()}
                      disabled={exporting}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50"
                    >
                      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Export to Artifacts
                    </button>
                  )}
                </div>
                <MarkdownWithCitations text={job.report} sources={job.sources} onCite={focusSource} />
              </section>
            )}
          </div>

          <aside className="rounded-xl border border-white/10 p-4 lg:sticky lg:top-4 lg:max-h-[80vh] lg:overflow-y-auto">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-70">Sources ({job.sources.length})</h2>
            {job.sources.length === 0 && <p className="text-sm opacity-60">No sources yet.</p>}
            <ol className="space-y-3">
              {job.sources.map((s) => (
                <li
                  key={s.n}
                  id={`source-${s.n}`}
                  className={`rounded-lg border p-2 text-sm transition-colors ${activeSource === s.n ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="rounded bg-white/10 px-1.5 text-xs font-mono">{s.n}</span>
                    {s.kind === 'web' ? <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" /> : <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />}
                    {s.kind === 'web' ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline break-words">{s.title}</a>
                    ) : (
                      <span className="font-medium break-words">{s.title}</span>
                    )}
                  </div>
                  {s.snippet && <p className="mt-1 line-clamp-3 text-xs opacity-70">{s.snippet}</p>}
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  )
}

function renderInline(text: string, sources: ResearchSource[], onCite: (n: number) => void): ReactNode[] {
  const parts = text.split(/(\[\d{1,3}\]|\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    const cite = p.match(/^\[(\d{1,3})\]$/)
    if (cite) {
      const n = Number(cite[1])
      const src = sources.find((s) => s.n === n)
      if (!src) return <Fragment key={i}>{p}</Fragment>
      return (
        <button
          key={i}
          type="button"
          title={src.title}
          onClick={() => onCite(n)}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-blue-500/20 px-1 align-super text-[10px] font-semibold text-blue-400 hover:bg-blue-500/40"
        >
          {n}
        </button>
      )
    }
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>
    return <Fragment key={i}>{p}</Fragment>
  })
}

function MarkdownWithCitations({ text, sources, onCite }: { text: string; sources: ResearchSource[]; onCite: (n: number) => void }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let list: ReactNode[] = []
  const flush = () => {
    if (list.length) out.push(<ul key={`ul-${out.length}`} className="my-2 list-disc space-y-1 pl-5">{list}</ul>)
    list = []
  }
  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)
    if (li) { list.push(<li key={i}>{renderInline(li[1]!, sources, onCite)}</li>); return }
    flush()
    if (h) {
      const level = h[1]!.length
      const cls = level === 1 ? 'mt-2 text-xl font-semibold' : level === 2 ? 'mt-5 text-lg font-semibold' : 'mt-4 font-semibold'
      out.push(<div key={i} className={cls}>{renderInline(h[2]!, sources, onCite)}</div>)
    } else if (line.trim()) {
      out.push(<p key={i} className="my-2 text-sm leading-relaxed">{renderInline(line, sources, onCite)}</p>)
    }
  })
  flush()
  return <div>{out}</div>
}
