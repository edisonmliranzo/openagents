'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { FrontierStatus, TimelineHit, WatchTaskRow, PromptPatchRow, DebateResult, RoundtableResult, LearnedSkillRow } from '@openagents/sdk'
import { Activity, AlarmClock, BrainCircuit, GitCompareArrows, Loader2, MessagesSquare, Plus, Search, Sparkles, Trash2 } from 'lucide-react'

function Section({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="oa-float-card p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Icon size={15} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--tone-strong)]">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'

export default function FrontierPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [status, setStatus] = useState<FrontierStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [tq, setTq] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [hits, setHits] = useState<TimelineHit[] | null>(null)

  const [digest, setDigest] = useState<{ content: string; createdAt: string } | null>(null)
  const [debateQ, setDebateQ] = useState('')
  const [debate, setDebate] = useState<DebateResult | null>(null)
  const [roundTopic, setRoundTopic] = useState('')
  const [minutes, setMinutes] = useState<RoundtableResult | null>(null)
  const [watches, setWatches] = useState<WatchTaskRow[]>([])
  const [wName, setWName] = useState('')
  const [wTarget, setWTarget] = useState('')
  const [wCond, setWCond] = useState('')
  const [patches, setPatches] = useState<PromptPatchRow[]>([])
  const [skills, setSkills] = useState<LearnedSkillRow[]>([])

  const load = useCallback(async () => {
    const [st, dg, ws, ps] = await Promise.allSettled([
      sdk.frontier.status(),
      sdk.frontier.digest(),
      sdk.frontier.watches.list(),
      sdk.frontier.patches.list(),
    ])
    if (st.status === 'fulfilled') setStatus(st.value)
    if (dg.status === 'fulfilled' && dg.value) setDigest({ content: dg.value.content, createdAt: dg.value.createdAt })
    if (ws.status === 'fulfilled') setWatches(ws.value)
    if (ps.status === 'fulfilled') setPatches(ps.value)
    sdk.frontier.skills.list().then(setSkills).catch(() => undefined)
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Frontier action failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4 pb-24">
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-lg font-semibold text-[var(--tone-strong)]">Frontier</h1>
          {status && Object.entries(status).map(([k, v]) => (
            <span key={k} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${v ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200/70 text-slate-500'}`}>
              {k}
            </span>
          ))}
        </header>

        <Section icon={Search} title="Semantic timeline" subtitle="Time-travel across memories, summaries and messages">
          <div className="flex flex-wrap gap-2">
            <input className={inputCls} placeholder="What did I decide about…" value={tq} onChange={(e) => setTq(e.target.value)} />
            <input type="date" className={inputCls + ' w-auto'} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className={inputCls + ' w-auto'} value={to} onChange={(e) => setTo(e.target.value)} />
            <button className={btnCls} disabled={busy === 't'} onClick={() => run('t', async () => setHits(await sdk.frontier.timeline({ q: tq, from, to })))}>
              {busy === 't' ? <Loader2 size={15} className="animate-spin" /> : 'Search'}
            </button>
          </div>
          {hits && (
            <ul className="mt-3 space-y-2">
              {hits.length === 0 && <li className="text-sm text-[var(--muted)]">Nothing in that window.</li>}
              {hits.map((h) => (
                <li key={h.id} className="rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{h.kind} · {new Date(h.date).toLocaleDateString()}</div>
                  <div className="text-sm text-[var(--tone-strong)]">{h.text}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={BrainCircuit} title="Sleep digest" subtitle="Nightly consolidation of the day into episodic memory">
          {digest ? (
            <pre className="whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-sm text-[var(--tone-strong)]">{digest.content}</pre>
          ) : (
            <p className="text-sm text-[var(--muted)]">No digest yet — consolidate now or wait for 03:00.</p>
          )}
          <button className={btnCls + ' mt-3'} disabled={busy === 'c'} onClick={() => run('c', async () => { await sdk.frontier.consolidate(); await load() })}>
            {busy === 'c' ? <Loader2 size={15} className="animate-spin" /> : 'Consolidate now'}
          </button>
        </Section>

        <Section icon={GitCompareArrows} title="Model debate" subtitle="Two models answer, a critic merges and scores">
          <div className="flex gap-2">
            <input className={inputCls} placeholder="A question worth two opinions…" value={debateQ} onChange={(e) => setDebateQ(e.target.value)} />
            <button className={btnCls} disabled={busy === 'd' || !debateQ.trim()} onClick={() => run('d', async () => setDebate(await sdk.frontier.debate(debateQ.trim())))}>
              {busy === 'd' ? <Loader2 size={15} className="animate-spin" /> : 'Debate'}
            </button>
          </div>
          {debate && (
            <div className="mt-3 space-y-2 text-sm">
              {debate.transcript.map((t) => (
                <p key={t.seat} className="rounded-xl bg-white/70 p-3"><b>{t.seat}:</b> {t.text}</p>
              ))}
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <b>Verdict {debate.verdict.winner} · {debate.verdict.confidence}%</b> — {debate.verdict.merged}
              </p>
            </div>
          )}
        </Section>

        <Section icon={MessagesSquare} title="Roundtable" subtitle="Your specialists debate, a moderator writes minutes">
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Topic for the roundtable…" value={roundTopic} onChange={(e) => setRoundTopic(e.target.value)} />
            <button className={btnCls} disabled={busy === 'r' || !roundTopic.trim()} onClick={() => run('r', async () => setMinutes(await sdk.frontier.roundtable(roundTopic.trim())))}>
              {busy === 'r' ? <Loader2 size={15} className="animate-spin" /> : 'Convene'}
            </button>
          </div>
          {minutes && <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-sm">{minutes.minutes}</pre>}
        </Section>

        <Section icon={AlarmClock} title="Watch tasks" subtitle="Background pollers that notify you when a condition holds">
          <div className="flex flex-wrap gap-2">
            <input className={inputCls} placeholder="Name" value={wName} onChange={(e) => setWName(e.target.value)} />
            <input className={inputCls} placeholder="URL or ISO date" value={wTarget} onChange={(e) => setWTarget(e.target.value)} />
            <input className={inputCls} placeholder="Condition (e.g. price under $50)" value={wCond} onChange={(e) => setWCond(e.target.value)} />
            <button className={btnCls} disabled={busy === 'w' || !wName || !wTarget || !wCond} onClick={() => run('w', async () => {
              await sdk.frontier.watches.create({ name: wName, target: wTarget, condition: wCond, kind: /^\d{4}-\d{2}-\d{2}/.test(wTarget) ? 'time' : 'url' })
              setWName(''); setWTarget(''); setWCond(''); await load()
            })}>
              <Plus size={15} />
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {watches.map((w) => (
              <li key={w.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2 text-sm">
                <button onClick={() => run('w', async () => { await sdk.frontier.watches.setEnabled(w.id, !w.enabled); await load() })} className={`h-5 w-9 shrink-0 rounded-full transition ${w.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[var(--tone-strong)]">{w.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{w.lastStatus ?? 'idle'} · {w.lastDetail || w.condition}</div>
                </div>
                <button aria-label="Run now" onClick={() => run('w', async () => { await sdk.frontier.watches.run(w.id); await load() })}><Search size={14} /></button>
                <button aria-label="Delete" onClick={() => run('w', async () => { await sdk.frontier.watches.remove(w.id); await load() })}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Sparkles} title="Learned rules" subtitle="Auto-repair: prompt rules mined from past failures">
          <div className="flex items-center gap-2">
            <button className={btnCls} disabled={busy === 'm'} onClick={() => run('m', async () => { await sdk.frontier.mine(); await load(); addToast('success', 'Routines + rules refreshed') })}>
              {busy === 'm' ? <Loader2 size={15} className="animate-spin" /> : 'Mine now'}
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {patches.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2 text-sm">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{p.taskClass}</span>
                <span className={`min-w-0 flex-1 ${p.active ? '' : 'line-through opacity-50'}`}>{p.rule}</span>
                <button onClick={() => run('p', async () => { await sdk.frontier.patches.setActive(p.id, !p.active); await load() })}>{p.active ? 'Off' : 'On'}</button>
                <button aria-label="Delete" onClick={() => run('p', async () => { await sdk.frontier.patches.remove(p.id); await load() })}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Sparkles} title="Learned skills" subtitle="Repeated requests you make are distilled into reusable skills and applied automatically when they fit">
          <div className="flex items-center gap-2">
            <button className={btnCls} disabled={busy === 'sk'} onClick={() => run('sk', async () => {
              const r = await sdk.frontier.skills.learn()
              setSkills(await sdk.frontier.skills.list())
              addToast('success', `Learned ${r.created} new, updated ${r.updated} (from ${r.scanned} prompts)`)
            })}>
              {busy === 'sk' ? <Loader2 size={15} className="animate-spin" /> : 'Learn from my prompts'}
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {skills.length === 0 && <li className="text-sm text-[var(--muted)]">No skills yet. They appear after you repeat a kind of request about three times.</li>}
            {skills.map((s) => (
              <li key={s.id} className="rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{s.source === 'auto' ? 'auto' : 'manual'}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--tone-strong)]">{s.name}</span>
                  <span className="text-[11px] text-[var(--muted)]">used {s.timesUsed}×</span>
                  <select
                    aria-label="Skill status"
                    value={s.status}
                    onChange={(e) => run('sk', async () => { await sdk.frontier.skills.setStatus(s.id, e.target.value as LearnedSkillRow['status']); setSkills(await sdk.frontier.skills.list()) })}
                    className="oa-input-surface h-7 rounded-lg px-2 text-xs"
                  >
                    <option value="active">active</option>
                    <option value="draft">draft</option>
                    <option value="disabled">disabled</option>
                  </select>
                  <button aria-label="Delete skill" onClick={() => run('sk', async () => { await sdk.frontier.skills.remove(s.id); setSkills(await sdk.frontier.skills.list()) })}><Trash2 size={14} /></button>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">{s.description}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Activity} title="Cost autopilot" subtitle="Budget burn pins the fast tier; high stakes earn the powerful model">
          <p className="text-sm text-[var(--muted)]">Status chips above show which frontier capabilities are switched on via env flags.</p>
        </Section>
      </div>
    </div>
  )
}
