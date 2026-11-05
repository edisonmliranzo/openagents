'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { BoardSessionRow, BoardSessionSummary, BoardAgentDef } from '@openagents/sdk'
import { Loader2, Trash2 } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="oa-float-card p-5">
      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-[var(--muted)]">{subtitle}</p>}
      {children}
    </section>
  )
}

const scoreColor = (n?: number) => (n === undefined ? 'bg-slate-200 text-slate-600' : n >= 75 ? 'bg-emerald-100 text-emerald-800' : n >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')

export default function BoardroomPage() {
  const [question, setQuestion] = useState('')
  const [specialists, setSpecialists] = useState<Array<Required<BoardAgentDef>>>([])
  const [picked, setPicked] = useState<string[]>([])
  const [rounds, setRounds] = useState(2)
  const [model, setModel] = useState('')
  const [judgeModel, setJudgeModel] = useState('')
  const [maxCost, setMaxCost] = useState(0.5)
  const [history, setHistory] = useState<BoardSessionSummary[]>([])
  const [session, setSession] = useState<BoardSessionRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadHistory = useCallback(() => sdk.boardroom.list().then(setHistory).catch(() => undefined), [])

  const stopPoll = () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  const poll = useCallback((id: string) => {
    stopPoll()
    const tick = async () => {
      try {
        const s = await sdk.boardroom.get(id)
        setSession(s)
        if (s.status !== 'running') { stopPoll(); void loadHistory() }
      } catch (e: any) { stopPoll(); setError(e?.message ?? 'Lost session') }
    }
    void tick()
    timer.current = setInterval(tick, 2500)
  }, [loadHistory])

  useEffect(() => {
    sdk.boardroom.defaults().then((d) => { setSpecialists(d.specialists); setPicked(d.specialists.slice(0, 3).map((s) => s.name)) }).catch((e) => setError(e?.message))
    void loadHistory()
    return stopPoll
  }, [loadHistory])

  const start = async () => {
    setBusy(true); setError(null)
    try {
      const agents = specialists.filter((s) => picked.includes(s.name))
      const s = await sdk.boardroom.start({ question, agents, rounds, maxCostUsd: maxCost, ...(model.trim() ? { model: model.trim() } : {}), ...(judgeModel.trim() ? { judgeModel: judgeModel.trim() } : {}) })
      setSession(s); poll(s.id)
    } catch (e: any) { setError(e?.message ?? 'Failed to start') } finally { setBusy(false) }
  }

  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : p.length < 5 ? [...p, name] : p))

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5 pb-24">
        <header>
          <h1 className="text-xl font-extrabold text-[var(--tone-strong)]">Multi-Agent Boardroom</h1>
          <p className="text-xs text-[var(--muted)]">Specialist agents debate over rounds; a judge scores every argument against a rubric and issues a verdict with dissent notes. Rounds, calls and cost are capped.</p>
        </header>
        {error && <p className="rounded-xl bg-red-100 px-3 py-2 text-xs text-red-800">{error}</p>}

        <Card title="Start a session">
          <textarea className="oa-input-surface min-h-[80px] w-full rounded-xl p-3 text-sm outline-none" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="The question or decision for the board…" maxLength={4000} />
          <div className="mt-3 flex flex-wrap gap-2">
            {specialists.map((s) => (
              <button key={s.name} title={s.role} onClick={() => toggle(s.name)} className={`rounded-full px-3 py-1 text-xs font-medium ${picked.includes(s.name) ? 'bg-slate-900 text-white' : 'bg-slate-200/70 text-slate-600'}`}>{s.name}</button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs text-[var(--muted)]">Rounds (1-3)<input type="number" min={1} max={3} className={inputCls} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} /></label>
            <label className="text-xs text-[var(--muted)]">Cost cap (USD)<input type="number" step={0.05} min={0.01} max={5} className={inputCls} value={maxCost} onChange={(e) => setMaxCost(Number(e.target.value))} /></label>
            <label className="text-xs text-[var(--muted)]">Agent model<input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="provider:model" /></label>
            <label className="text-xs text-[var(--muted)]">Judge model<input className={inputCls} value={judgeModel} onChange={(e) => setJudgeModel(e.target.value)} placeholder="provider:model" /></label>
          </div>
          <button className={`${btnCls} mt-3`} disabled={busy || !question.trim() || picked.length < 2 || session?.status === 'running'} onClick={start}>{busy ? 'Starting…' : 'Convene board'}</button>
        </Card>

        {session && (
          <>
            <Card title={session.question} subtitle={`${session.status === 'running' ? `Running — ${session.phase}` : session.status} · ${session.calls}/${session.config.maxCalls} calls · est. $${session.estCostUsd.toFixed(4)} of $${session.config.maxCostUsd} cap`}>
              {session.status === 'running' && <Loader2 className="animate-spin" size={16} />}
              {session.error && <p className="text-xs text-red-700">{session.error}</p>}
              {session.stoppedEarly && <p className="text-xs text-[var(--muted)]">{session.stoppedEarly}</p>}
              {session.verdict && (
                <div className="mt-2 space-y-2 rounded-xl bg-slate-100/70 p-4">
                  <p className="text-sm font-semibold text-[var(--tone-strong)]">
                    Verdict — winner: {session.verdict.winner} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${scoreColor(session.verdict.finalScore)}`}>{session.verdict.finalScore}/100</span>
                    <span className="ml-2 text-xs font-normal text-[var(--muted)]">confidence {session.verdict.confidence}%</span>
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{session.verdict.summary}</p>
                  <div className="flex flex-wrap gap-2 text-xs">{session.verdict.agentTotals.map((t) => <span key={t.agent} className={`rounded-full px-2 py-0.5 ${scoreColor(t.avg)}`}>{t.agent}: {t.avg}</span>)}</div>
                  {session.verdict.dissent.length > 0 && (
                    <div className="rounded-lg bg-amber-50 p-3 text-xs"><p className="mb-1 font-semibold text-amber-900">Dissent</p>
                      <ul className="list-disc pl-5">{session.verdict.dissent.map((d, i) => <li key={i}><b>{d.agent}:</b> {d.note}</li>)}</ul></div>
                  )}
                </div>
              )}
            </Card>
            {session.rounds.map((r) => (
              <Card key={r.index} title={`Round ${r.index}`} subtitle={`${r.judged ? 'Judged' : 'Awaiting judge'}${r.consensus !== undefined ? ` · consensus ${r.consensus}` : ''}`}>
                <div className="space-y-3">
                  {r.arguments.map((a) => (
                    <div key={a.agent} className="rounded-xl bg-slate-100/60 p-3 text-xs">
                      <div className="mb-1 flex items-center gap-2">
                        <b className="text-sm text-[var(--tone-strong)]">{a.agent}</b>
                        {a.total !== undefined && <span className={`rounded-full px-2 py-0.5 ${scoreColor(a.total)}`}>{a.total}/100</span>}
                        {a.scores && <span className="text-[var(--muted)]">{Object.entries(a.scores).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{a.text || a.error}</p>
                      {a.judgeNote && <p className="mt-1 italic text-[var(--muted)]">Judge: {a.judgeNote}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </>
        )}

        {history.length > 0 && (
          <Card title="Past sessions">
            <div className="space-y-1">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-xl bg-slate-100/50 px-3 py-2 text-xs">
                  <button className="flex-1 truncate text-left" onClick={() => { setError(null); poll(h.id) }}>{h.question}</button>
                  <span className="text-[var(--muted)]">{h.status}{h.winner ? ` · ${h.winner} ${h.finalScore}` : ''}</span>
                  <button aria-label="Delete session" onClick={() => sdk.boardroom.remove(h.id).then(() => { if (session?.id === h.id) setSession(null); return loadHistory() })}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
