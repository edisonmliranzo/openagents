'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  FrontierStatus,
  TimelineHit,
  WatchTaskRow,
  PromptPatchRow,
  DebateResult,
  RoundtableResult,
  LearnedSkillRow,
  GrokDeepSearchResult,
  OpenClawSoulState,
  HermesSteerConfig,
  DotsRouteResult,
} from '@openagents/sdk'
import {
  Activity,
  AlarmClock,
  ArrowUpRight,
  BrainCircuit,
  GitCompareArrows,
  HeartPulse,
  Loader2,
  MessagesSquare,
  Network,
  Plus,
  Radar,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { FRONTIER_AGENTIC_LINKS } from '@/components/chat/FrontierEnginesDock'

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
  const router = useRouter()
  const addToast = useUIStore((s) => s.addToast)
  const [status, setStatus] = useState<FrontierStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Frontier 4 Signature AI Engines State
  const [grokQuery, setGrokQuery] = useState('')
  const [grokResult, setGrokResult] = useState<GrokDeepSearchResult | null>(null)
  const [openClaw, setOpenClaw] = useState<OpenClawSoulState | null>(null)
  const [hermesCfg, setHermesCfg] = useState<HermesSteerConfig | null>(null)
  const [dotsQuery, setDotsQuery] = useState('')
  const [dotsResult, setDotsResult] = useState<DotsRouteResult | null>(null)

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
    const [st, dg, ws, ps, oc, hm] = await Promise.allSettled([
      sdk.frontier.status(),
      sdk.frontier.digest(),
      sdk.frontier.watches.list(),
      sdk.frontier.patches.list(),
      sdk.agenticSuite.getOpenClawState(),
      sdk.agenticSuite.getHermesState(),
    ])
    if (st.status === 'fulfilled') setStatus(st.value)
    if (dg.status === 'fulfilled' && dg.value) setDigest({ content: dg.value.content, createdAt: dg.value.createdAt })
    if (ws.status === 'fulfilled') setWatches(ws.value)
    if (ps.status === 'fulfilled') setPatches(ps.value)
    if (oc.status === 'fulfilled') setOpenClaw(oc.value)
    if (hm.status === 'fulfilled') setHermesCfg(hm.value.config)
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
      <div className="mx-auto max-w-4xl space-y-5 pb-24">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-[var(--tone-strong)]">
              OpenAgents Frontier Command Center
            </h1>
            <p className="text-xs text-[var(--muted)]">
              Unified autonomous operating system combining Grok DeepSearch, OpenClaw Soul &amp; Heartbeat, Hermes-3 Cognitive Steer, Dots MoE Router &amp; 8 Frontier Agentic Systems.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {status && Object.entries(status).map(([k, v]) => (
              <span key={k} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${v ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200/70 text-slate-500'}`}>
                {k}
              </span>
            ))}
          </div>
        </header>

        {/* 8 Autonomous Agentic Systems Launch Grid */}
        <Section
          icon={Zap}
          title="8 Autonomous Agentic Systems"
          subtitle="Direct access to self-synthesizing tools, MCTS speculative rollouts, vision computer use, sentinel reflexes, red-team verification, overnight missions, digital twin & swarm market"
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {FRONTIER_AGENTIC_LINKS.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 text-left transition hover:border-rose-400 hover:shadow-md dark:border-[#2d3347] dark:bg-[#151a28]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-lg bg-gradient-to-r ${item.color} px-2 py-0.5 text-[9px] font-black uppercase text-white`}>
                    {item.badge}
                  </span>
                  <ArrowUpRight size={14} className="text-slate-400 group-hover:text-rose-500" />
                </div>
                <div className="mt-2.5">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{item.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* Grok DeepSearch + Big Brain */}
        <Section
          icon={Radar}
          title="Grok 3 DeepSearch + Big Brain Engine"
          subtitle="Multi-hop truth-seeking synthesis with visible Chain-of-Thought trace, contrarian reality check & verified citations"
        >
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Ask Grok DeepSearch anything…"
              value={grokQuery}
              onChange={(e) => setGrokQuery(e.target.value)}
            />
            <button
              className={btnCls}
              disabled={busy === 'grok' || !grokQuery.trim()}
              onClick={() =>
                run('grok', async () => {
                  const res = await sdk.agenticSuite.runGrokDeepSearch({
                    query: grokQuery.trim(),
                    bigBrainEnabled: true,
                  })
                  setGrokResult(res)
                })
              }
            >
              {busy === 'grok' ? <Loader2 size={15} className="animate-spin" /> : 'DeepSearch'}
            </button>
          </div>
          {grokResult && (
            <div className="mt-3 space-y-2 rounded-2xl border border-sky-200 bg-sky-50/60 p-3.5 text-xs dark:border-sky-500/30 dark:bg-sky-500/10">
              <div className="font-mono text-[11px] font-bold text-sky-700 dark:text-sky-300">
                Confidence {grokResult.confidenceScore}% · {grokResult.durationMs}ms · {grokResult.citations.length} citations
              </div>
              <pre className="whitespace-pre-wrap rounded-xl bg-white/80 p-2.5 font-mono text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {grokResult.thinkingTrace.join('\n')}
              </pre>
              <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{grokResult.synthesisMarkdown}</p>
              <p className="rounded-xl bg-rose-500/10 p-2 font-medium text-rose-800 dark:text-rose-200">
                <b>Contrarian Reality Check:</b> {grokResult.contrarianTake}
              </p>
            </div>
          )}
        </Section>

        {/* OpenClaw Soul & Heartbeat Daemon */}
        <Section
          icon={HeartPulse}
          title="OpenClaw Autonomous Core (SOUL.md & Heartbeat Loop)"
          subtitle="Persistent markdown soul identity + background heartbeat daemon checking git, goals & sentinel state"
        >
          {openClaw && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 p-3 text-xs dark:bg-slate-900/70">
                <span>
                  <b>Heartbeat Loop:</b> {openClaw.heartbeatEnabled ? 'ACTIVE' : 'PAUSED'} (every{' '}
                  {openClaw.heartbeatIntervalSec}s) · {openClaw.channels.length} Claw Channels
                </span>
                <button
                  className={btnCls}
                  disabled={busy === 'hb'}
                  onClick={() =>
                    run('hb', async () => {
                      const res = await sdk.agenticSuite.runOpenClawHeartbeat('manual')
                      setOpenClaw(res.state)
                      addToast('success', res.latestRun.proactiveDecision)
                    })
                  }
                >
                  {busy === 'hb' ? <Loader2 size={15} className="animate-spin" /> : 'Pulse Heartbeat Now'}
                </button>
              </div>
              {openClaw.recentHeartbeats[0] && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <b>Latest Pulse ({openClaw.recentHeartbeats[0].gitBranch}):</b>{' '}
                  {openClaw.recentHeartbeats[0].proactiveDecision}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Hermes-3 Cognitive Steer & Dots MoE Router */}
        <Section
          icon={Network}
          title="Dots Mixture-of-Reasoners & Hermes-3 Cognitive Steer"
          subtitle="Dynamic expert compute routing across Fast Reflex, Deep Logic, Code Synth & Vision Grounding"
        >
          {hermesCfg && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-800">
                Hermes Depth: {hermesCfg.reasoningDepth}%
              </span>
              <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-800">
                Tool Aggressiveness: {hermesCfg.toolAggressiveness}%
              </span>
              <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-800">
                Directness: {hermesCfg.directness}%
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Test Dots Mixture-of-Reasoners compute routing on any task…"
              value={dotsQuery}
              onChange={(e) => setDotsQuery(e.target.value)}
            />
            <button
              className={btnCls}
              disabled={busy === 'dots' || !dotsQuery.trim()}
              onClick={() =>
                run('dots', async () => {
                  const res = await sdk.agenticSuite.routeWithDots({ prompt: dotsQuery.trim() })
                  setDotsResult(res)
                })
              }
            >
              {busy === 'dots' ? <Loader2 size={15} className="animate-spin" /> : 'Route Compute'}
            </button>
          </div>
          {dotsResult && (
            <div className="mt-3 space-y-2 rounded-xl bg-white/80 p-3 text-xs dark:bg-slate-900/70">
              <div className="font-bold text-emerald-700 dark:text-emerald-400">
                {dotsResult.selectedPrimaryPath} · Saved {dotsResult.computeSavedPct}% compute
              </div>
              <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{dotsResult.synthesizedAnswer}</p>
            </div>
          )}
        </Section>

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
