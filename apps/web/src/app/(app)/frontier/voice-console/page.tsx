'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { VoiceSession, VoiceSessionSummary, VoiceTurn } from '@openagents/sdk'
import { Hand, Mic, PhoneOff, Send, Compass } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'

const roleStyle: Record<string, string> = {
  agent: 'bg-slate-900 text-white self-end',
  caller: 'bg-slate-100 text-[var(--tone-strong)] self-start',
  human: 'bg-emerald-600 text-white self-end',
  system: 'bg-amber-50 text-amber-800 self-center text-[11px]',
}

export default function VoiceConsolePage() {
  const [sessions, setSessions] = useState<VoiceSessionSummary[]>([])
  const [status, setStatus] = useState<{ telephonyConfigured: boolean; from: string | null } | null>(null)
  const [current, setCurrent] = useState<VoiceSession | null>(null)
  const [turns, setTurns] = useState<VoiceTurn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [goal, setGoal] = useState('')
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [phoneCallId, setPhoneCallId] = useState('')
  const [steer, setSteer] = useState('')
  const [say, setSay] = useState('')
  const [callerText, setCallerText] = useState('')
  const lastSeq = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(async () => {
    try { setSessions(await sdk.growthVoice.voice.list()) } catch (e: any) { setError(e?.message ?? 'Failed to load sessions') }
  }, [])

  useEffect(() => {
    void loadSessions()
    sdk.growthVoice.voice.status().then(setStatus).catch(() => undefined)
  }, [loadSessions])

  const open = useCallback((s: VoiceSession) => {
    lastSeq.current = s.lastSeq
    setCurrent(s)
    setTurns(s.transcript)
  }, [])

  const select = async (id: string) => {
    try { open(await sdk.growthVoice.voice.get(id, 0)) } catch (e: any) { setError(e?.message ?? 'Failed to open session') }
  }

  // Poll the live transcript feed for new turns.
  useEffect(() => {
    if (!current || current.status === 'ended') return
    const id = current.id
    const t = setInterval(async () => {
      try {
        const s = await sdk.growthVoice.voice.get(id, lastSeq.current)
        lastSeq.current = Math.max(lastSeq.current, s.lastSeq)
        if (s.transcript.length) setTurns((prev) => [...prev, ...s.transcript])
        setCurrent((c) => (c && c.id === id ? { ...c, status: s.status, humanTakeover: s.humanTakeover, steering: s.steering } : c))
      } catch { /* transient */ }
    }, 2000)
    return () => clearInterval(t)
  }, [current?.id, current?.status])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns.length])

  const wrap = async (fn: () => Promise<VoiceSession | void>, reopen = true) => {
    try {
      const s = await fn()
      if (s && reopen) {
        // Merge returned full transcript (after=0 semantics) so the view is authoritative.
        const full = await sdk.growthVoice.voice.get(s.id, 0)
        open(full)
      }
      setError(null)
      void loadSessions()
    } catch (e: any) { setError(e?.message ?? 'Action failed') }
  }

  const start = () => wrap(async () => {
    const s = await sdk.growthVoice.voice.create(phoneCallId.trim() ? { phoneCallId: phoneCallId.trim() } : { direction, goal, party: 'Simulated caller' })
    setGoal('')
    setPhoneCallId('')
    return s
  })

  const active = current && current.status === 'active'
  const sim = current?.source === 'simulation'

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-6 md:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <header className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"><Mic size={16} /></span>
          <div>
            <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Voice Call Console</h1>
            <p className="text-xs text-[var(--muted)]">{status?.telephonyConfigured ? `Telephony connected (${status.from})` : 'No telephony credentials — simulation mode'}</p>
          </div>
        </header>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div className="oa-float-card space-y-2 p-3">
          <p className="text-xs font-semibold text-[var(--tone-strong)]">Start a call</p>
          <select className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as any)}>
            <option value="outbound">Outbound (simulated)</option><option value="inbound">Inbound (simulated)</option>
          </select>
          <input className={inputCls} placeholder="Call goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <input className={inputCls} placeholder="…or attach real phone call id" value={phoneCallId} onChange={(e) => setPhoneCallId(e.target.value)} />
          <button className={btnCls + ' w-full'} disabled={!goal.trim() && !phoneCallId.trim()} onClick={start}>Start</button>
        </div>
        <div className="oa-float-card max-h-[380px] divide-y divide-black/5 overflow-y-auto">
          {!sessions.length && <p className="p-3 text-xs text-[var(--muted)]">No calls yet.</p>}
          {sessions.map((s) => (
            <button key={s.id} className={`block w-full p-3 text-left text-xs ${current?.id === s.id ? 'bg-slate-100' : ''}`} onClick={() => select(s.id)}>
              <p className="font-medium text-[var(--tone-strong)]">{s.direction} · {s.source}</p>
              <p className="truncate text-[var(--muted)]">{s.goal}</p>
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px]">{s.status}{s.humanTakeover ? ' · human' : ''}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {!current && <p className="oa-float-card p-6 text-sm text-[var(--muted)]">Start or select a call to open the live console.</p>}
        {current && (
          <section className="oa-float-card flex h-[620px] flex-col p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--tone-strong)]">{current.party} · {current.direction}</p>
                <p className="truncate text-xs text-[var(--muted)]">{current.goal}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200'}`}>{current.status}</span>
              <button
                className={`flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold ${current.humanTakeover ? 'bg-emerald-600 text-white' : 'border'}`}
                disabled={!active}
                onClick={() => wrap(() => sdk.growthVoice.voice.takeover(current.id, !current.humanTakeover))}
              >
                <Hand size={13} />{current.humanTakeover ? 'Return to agent' : 'Take over'}
              </button>
              <button className="flex h-9 items-center gap-1 rounded-xl border px-3 text-xs text-red-600" disabled={!active} onClick={() => wrap(() => sdk.growthVoice.voice.end(current.id))}>
                <PhoneOff size={13} />End
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-white/50 p-3">
              {turns.map((t) => (
                <div key={t.seq} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${roleStyle[t.role] ?? roleStyle.system}`}>
                  {t.role !== 'system' && <p className="mb-0.5 text-[10px] uppercase opacity-60">{t.role}</p>}
                  {t.text}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Steer the agent mid-call (e.g. offer a 10% discount)…" value={steer} onChange={(e) => setSteer(e.target.value)} disabled={!active} />
                <button className={btnCls} disabled={!active || !steer.trim()} onClick={() => wrap(async () => { const s = await sdk.growthVoice.voice.steer(current.id, steer); setSteer(''); return s })}>
                  <Compass size={14} className="mr-1 inline" />Steer
                </button>
              </div>
              {current.humanTakeover && sim && (
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="Speak as the human operator…" value={say} onChange={(e) => setSay(e.target.value)} />
                  <button className={btnCls} disabled={!active || !say.trim()} onClick={() => wrap(async () => { const s = await sdk.growthVoice.voice.say(current.id, say); setSay(''); return s })}><Send size={14} /></button>
                </div>
              )}
              {sim && (
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="Simulate the other party (blank = scripted line)" value={callerText} onChange={(e) => setCallerText(e.target.value)} />
                  <button className="h-10 shrink-0 rounded-xl border px-4 text-sm" disabled={!active} onClick={() => wrap(async () => { const s = await sdk.growthVoice.voice.simulateCaller(current.id, callerText || undefined); setCallerText(''); return s })}>
                    Caller speaks
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
