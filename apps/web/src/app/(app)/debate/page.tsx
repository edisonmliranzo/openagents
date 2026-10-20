'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { Award, Check, GitCompareArrows, Loader2, MessageSquareWarning, Scale, Sparkles } from 'lucide-react'

interface DebateSeat {
  seat: string
  provider: string
  model?: string
}

interface MultiDebateResult {
  question: string
  seats: DebateSeat[]
  answers: Array<{ seat: string; text: string; error?: string }>
  critiques: Array<{ seat: string; text: string; error?: string }>
  verdict: { winner: string; confidence: number; synthesis: string; rationale: string }
  judge: DebateSeat
  durationMs: number
}

export default function DebatePage() {
  const addToast = useUIStore((s) => s.addToast)
  const [providers, setProviders] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MultiDebateResult | null>(null)

  const loadProviders = useCallback(async () => {
    try {
      const res = await sdk.client.get<{ providers: string[] }>('/api/v1/frontier/debate/providers')
      const list = res.providers ?? []
      setProviders(list)
      setSelected(list.slice(0, 3))
    } catch {
      // ignore initial error
    }
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const toggleProvider = (p: string) => {
    setSelected((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p)
      if (prev.length >= 3) {
        addToast('info', 'Select up to 3 providers for a debate.')
        return prev
      }
      return [...prev, p]
    })
  }

  const runDebate = async () => {
    if (!question.trim()) return
    setBusy(true)
    try {
      const res = await sdk.client.post<MultiDebateResult>('/api/v1/frontier/debate/multi', {
        question: question.trim(),
        models: selected.length >= 2 ? selected : undefined,
      })
      setResult(res)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Multi-model debate failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5 pb-24">
        <header className="oa-float-card p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <GitCompareArrows size={18} />
            </span>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Multi-Model Debate Arena</h1>
              <p className="text-xs text-[var(--muted)]">
                2–3 models answer independently, critique each other&apos;s blind spots, and an impartial judge synthesizes the strongest verdict.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                Active Providers (pick 2–3 seats)
              </label>
              <div className="flex flex-wrap gap-2">
                {providers.length === 0 ? (
                  <span className="text-xs text-amber-700">
                    Need at least 2 active LLM provider keys in Settings (e.g. Anthropic, OpenAI, Gemini, Ollama).
                  </span>
                ) : (
                  providers.map((p) => {
                    const active = selected.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleProvider(p)}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-[var(--border)] bg-white/80 text-[var(--tone-strong)] hover:bg-white'
                        }`}
                      >
                        {active && <Check size={12} />}
                        {p}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a complex engineering, strategic, or analytical question..."
                className="oa-input-surface w-full rounded-xl p-3 text-sm outline-none"
              />
              <button
                onClick={runDebate}
                disabled={busy || !question.trim()}
                className="oa-accent-button flex h-auto shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {busy ? 'Debating…' : 'Start Debate'}
              </button>
            </div>
          </div>
        </header>

        {result && (
          <div className="space-y-5">
            <section className="oa-float-card border-2 border-emerald-500/30 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Scale size={18} className="text-emerald-600" />
                  <h2 className="text-sm font-bold text-[var(--tone-strong)]">Synthesized Judge Verdict</h2>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-800">
                    <Award size={12} />
                    Winner: {result.verdict.winner.toUpperCase()} ({result.verdict.confidence}% confidence)
                  </span>
                  <span className="text-[var(--muted)]">
                    Judge: {result.judge.provider} · {(result.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
              {result.verdict.rationale && (
                <p className="mt-2 text-xs italic text-[var(--muted)]">{result.verdict.rationale}</p>
              )}
              <div className="mt-3 whitespace-pre-wrap rounded-xl bg-emerald-50/70 p-4 text-sm leading-relaxed text-[var(--tone-strong)]">
                {result.verdict.synthesis}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Round 1 · Independent Opening Positions
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {result.seats.map((s) => {
                  const ans = result.answers.find((a) => a.seat === s.seat)
                  const isWinner = result.verdict.winner === s.seat
                  return (
                    <div
                      key={s.seat}
                      className={`oa-float-card flex flex-col p-4 ${
                        isWinner ? 'ring-2 ring-emerald-500/60' : ''
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between border-b border-[var(--border)] pb-2">
                        <span className="text-xs font-bold text-[var(--tone-strong)]">
                          Seat {s.seat} · <span className="uppercase">{s.provider}</span>
                        </span>
                        {s.model && <span className="truncate text-[11px] text-[var(--muted)]">{s.model}</span>}
                      </div>
                      {ans?.error ? (
                        <p className="text-xs text-rose-600">Error: {ans.error}</p>
                      ) : (
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--tone-strong)]">
                          {ans?.text}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                <MessageSquareWarning size={13} />
                Round 2 · Cross-Examination & Peer Critiques
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {result.seats.map((s) => {
                  const crit = result.critiques.find((c) => c.seat === s.seat)
                  return (
                    <div key={s.seat} className="oa-float-card flex flex-col p-4">
                      <div className="mb-2 border-b border-[var(--border)] pb-2 text-xs font-semibold text-[var(--tone-strong)]">
                        Critique by Seat {s.seat} ({s.provider})
                      </div>
                      {crit?.error ? (
                        <p className="text-xs text-[var(--muted)]">({crit.error})</p>
                      ) : (
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--tone-strong)]">
                          {crit?.text}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
