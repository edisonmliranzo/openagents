'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { Brain, CheckCircle2, Eye, Loader2, RefreshCw, Sparkles, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'

interface Lesson {
  id: string
  text: string
  score: number
  kind: 'do' | 'avoid' | 'preference'
  enabled: boolean
  conversationId?: string
  createdAt: string
}

interface LessonRun {
  conversationId: string
  score: number
  summary: string
  at: string
}

interface LessonsPayload {
  lessons: Lesson[]
  runs: LessonRun[]
  averageScore: number | null
}

const KIND_BADGE: Record<Lesson['kind'], { label: string; cls: string }> = {
  do: { label: 'DO', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  avoid: { label: 'AVOID', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  preference: { label: 'PREF', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
}

export default function LessonsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [data, setData] = useState<LessonsPayload | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)
  const [filterKind, setFilterKind] = useState<'all' | Lesson['kind']>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [res, prev] = await Promise.all([
        sdk.client.get<LessonsPayload>('/api/v1/reflection/lessons'),
        sdk.client.get<{ block: string }>('/api/v1/reflection/lessons/preview').catch(() => ({ block: '' })),
      ])
      setData(res)
      setPreview(prev.block ?? '')
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load lessons')
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  const triggerReflection = async () => {
    setBusy('reflect')
    try {
      const res = await sdk.client.post<{ score?: number; summary?: string; added?: Lesson[]; skipped?: boolean }>(
        '/api/v1/reflection/lessons/reflect',
        {},
      )
      if (res?.skipped) {
        addToast('info', 'No unreflected completed runs found yet.')
      } else {
        addToast('success', `Reflected (score ${res.score ?? '—'}): +${res.added?.length ?? 0} lessons`)
      }
      await load()
    } catch (e: any) {
      addToast('error', e?.message ?? 'Reflection failed')
    } finally {
      setBusy(null)
    }
  }

  const toggleLesson = async (l: Lesson) => {
    setBusy(l.id)
    try {
      await sdk.client.patch(`/api/v1/reflection/lessons/${encodeURIComponent(l.id)}/toggle`, {
        enabled: !l.enabled,
      })
      await load()
    } catch (e: any) {
      addToast('error', e?.message ?? 'Toggle failed')
    } finally {
      setBusy(null)
    }
  }

  const deleteLesson = async (id: string) => {
    setBusy(id)
    try {
      await sdk.client.delete(`/api/v1/reflection/lessons/${encodeURIComponent(id)}`)
      await load()
      addToast('success', 'Lesson removed')
    } catch (e: any) {
      addToast('error', e?.message ?? 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  const lessons = (data?.lessons ?? []).filter((l) => filterKind === 'all' || l.kind === filterKind)
  const activeCount = (data?.lessons ?? []).filter((l) => l.enabled).length

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5 pb-24">
        <header className="oa-float-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Brain size={18} />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Self-Improving Agent Lessons</h1>
              <p className="text-xs text-[var(--muted)]">
                OpenAgents critiques completed runs, scores outcomes, and injects active lessons into future system prompts.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview((v) => !v)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white/80 px-3 text-xs font-medium text-[var(--tone-strong)] hover:bg-white"
            >
              <Eye size={14} />
              {showPreview ? 'Hide Prompt Block' : 'Preview Prompt Block'}
            </button>
            <button
              onClick={triggerReflection}
              disabled={busy === 'reflect'}
              className="oa-accent-button flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'reflect' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Reflect Latest Run
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="oa-float-card p-4">
            <div className="text-xs text-[var(--muted)]">Active Lessons</div>
            <div className="mt-1 text-2xl font-bold text-[var(--tone-strong)]">
              {activeCount} <span className="text-sm font-normal text-[var(--muted)]">/ {data?.lessons.length ?? 0}</span>
            </div>
          </div>
          <div className="oa-float-card p-4">
            <div className="text-xs text-[var(--muted)]">Average Run Score</div>
            <div className="mt-1 text-2xl font-bold text-[var(--tone-strong)]">
              {data?.averageScore != null ? `${data.averageScore}/100` : '—'}
            </div>
          </div>
          <div className="oa-float-card p-4">
            <div className="text-xs text-[var(--muted)]">Scored Runs</div>
            <div className="mt-1 text-2xl font-bold text-[var(--tone-strong)]">{data?.runs.length ?? 0}</div>
          </div>
        </div>

        {showPreview && (
          <section className="oa-float-card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Injected System Prompt Block (~800 token cap)
            </div>
            <pre className="whitespace-pre-wrap rounded-xl bg-slate-900 p-3.5 font-mono text-xs text-slate-100">
              {preview || '(No active lessons to inject yet)'}
            </pre>
          </section>
        )}

        <section className="oa-float-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--tone-strong)]">Learned Rules & Preferences</h2>
            <div className="flex items-center gap-1.5">
              {(['all', 'do', 'avoid', 'preference'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilterKind(k)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition ${
                    filterKind === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {k}
                </button>
              ))}
              <button
                onClick={() => void load()}
                aria-label="Refresh"
                className="ml-1 rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted)] hover:text-[var(--tone-strong)]"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {lessons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
              No lessons recorded yet. Complete a conversation or click <b>Reflect Latest Run</b> to extract reusable insights.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {lessons.map((l) => {
                const badge = KIND_BADGE[l.kind] ?? KIND_BADGE.do
                return (
                  <li
                    key={l.id}
                    className={`flex items-start gap-3 rounded-xl border border-[var(--border)] bg-white/80 p-3.5 transition ${
                      l.enabled ? '' : 'opacity-55'
                    }`}
                  >
                    <button
                      onClick={() => toggleLesson(l)}
                      disabled={busy === l.id}
                      title={l.enabled ? 'Disable lesson' : 'Enable lesson'}
                      className="mt-0.5 text-slate-700 hover:text-slate-900"
                    >
                      {l.enabled ? (
                        <ToggleRight size={22} className="text-emerald-600" />
                      ) : (
                        <ToggleLeft size={22} className="text-slate-400" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs text-[var(--muted)]">Run score: {l.score}/100</span>
                        <span className="text-xs text-[var(--muted)]">· {new Date(l.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className={`mt-1 text-sm text-[var(--tone-strong)] ${l.enabled ? '' : 'line-through'}`}>
                        {l.text}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteLesson(l.id)}
                      disabled={busy === l.id}
                      aria-label="Delete lesson"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {data?.runs && data.runs.length > 0 && (
          <section className="oa-float-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--tone-strong)]">Recent Run Evaluations</h2>
            <ul className="space-y-2">
              {data.runs.map((r, i) => (
                <li
                  key={`${r.conversationId}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white/70 px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                    <span className="truncate text-[var(--tone-strong)]">{r.summary || 'Evaluated agent run'}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {r.score}/100
                    </span>
                    <span className="text-[var(--muted)]">{new Date(r.at).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
