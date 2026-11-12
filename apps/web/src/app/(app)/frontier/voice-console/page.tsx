'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { VoiceSession, VoiceSessionSummary, VoiceTurn } from '@openagents/sdk'
import { Hand, Mic, PhoneOff, Send, Compass, Volume2, VolumeX } from 'lucide-react'
import { speak, stopSpeaking } from '@/lib/voice'
import {
  AVATAR_PERSONAS,
  type AvatarPersonaId,
  getSavedAvatarPersona,
  inferAvatarEmotion,
  LiveAvatar,
  setSavedAvatarPersona,
} from '@/components/chat/LiveAvatar'

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
  const [personaId, setPersonaId] = useState<AvatarPersonaId>('nova')
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [speakingNow, setSpeakingNow] = useState(false)
  const lastSeq = useRef(0)
  const lastSpokenSeq = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPersonaId(getSavedAvatarPersona())
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await sdk.growthVoice.voice.list())
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load sessions')
    }
  }, [])

  useEffect(() => {
    void loadSessions()
    sdk.growthVoice.voice.status().then(setStatus).catch(() => undefined)
  }, [loadSessions])

  const speakTurn = useCallback(async (text: string) => {
    setSpeakingNow(true)
    await speak(text, {
      onEnd: () => setSpeakingNow(false),
      onError: () => setSpeakingNow(false),
    })
    setSpeakingNow(false)
  }, [])

  const open = useCallback(
    (s: VoiceSession, shouldAutoSpeak = false) => {
      lastSeq.current = s.lastSeq
      setCurrent(s)
      setTurns(s.transcript)
      if (shouldAutoSpeak && autoSpeak) {
        const latestAgent = [...s.transcript].reverse().find((t) => t.role === 'agent' || t.role === 'human')
        if (latestAgent && latestAgent.seq > lastSpokenSeq.current) {
          lastSpokenSeq.current = latestAgent.seq
          void speakTurn(latestAgent.text)
        }
      }
    },
    [autoSpeak, speakTurn],
  )

  const select = async (id: string) => {
    try {
      open(await sdk.growthVoice.voice.get(id, 0), false)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to open session')
    }
  }

  // Poll the live transcript feed for new turns.
  const currentId = current?.id
  const currentStatus = current?.status
  useEffect(() => {
    if (!currentId || currentStatus === 'ended') return
    const t = setInterval(async () => {
      try {
        const s = await sdk.growthVoice.voice.get(currentId, lastSeq.current)
        lastSeq.current = Math.max(lastSeq.current, s.lastSeq)
        if (s.transcript.length) {
          setTurns((prev) => [...prev, ...s.transcript])
          if (autoSpeak) {
            const latestAgent = [...s.transcript].reverse().find((turn) => turn.role === 'agent')
            if (latestAgent && latestAgent.seq > lastSpokenSeq.current) {
              lastSpokenSeq.current = latestAgent.seq
              void speakTurn(latestAgent.text)
            }
          }
        }
        setCurrent((c) =>
          c && c.id === currentId
            ? { ...c, status: s.status, humanTakeover: s.humanTakeover, steering: s.steering }
            : c,
        )
      } catch {
        /* transient */
      }
    }, 2000)
    return () => clearInterval(t)
  }, [currentId, currentStatus, autoSpeak, speakTurn])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length])

  const wrap = async (fn: () => Promise<VoiceSession | void>, reopen = true) => {
    try {
      const s = await fn()
      if (s && reopen) {
        const full = await sdk.growthVoice.voice.get(s.id, 0)
        open(full, true)
      }
      setError(null)
      void loadSessions()
    } catch (e: any) {
      setError(e?.message ?? 'Action failed')
    }
  }

  const start = () =>
    wrap(async () => {
      const s = await sdk.growthVoice.voice.create(
        phoneCallId.trim()
          ? { phoneCallId: phoneCallId.trim() }
          : { direction, goal, party: 'Simulated caller' },
      )
      setGoal('')
      setPhoneCallId('')
      return s
    })

  const active = Boolean(current && current.status === 'active')
  const sim = current?.source === 'simulation'
  const persona = AVATAR_PERSONAS[personaId] ?? AVATAR_PERSONAS.nova

  const latestText = useMemo(() => {
    const last = [...turns].reverse().find((t) => t.role === 'agent' || t.role === 'caller')
    return last?.text ?? ''
  }, [turns])

  const activeEmotion = useMemo(
    () => inferAvatarEmotion(latestText, speakingNow ? 'speaking' : active ? 'listening' : 'idle'),
    [latestText, speakingNow, active],
  )

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-6 md:grid-cols-[310px_1fr]">
      <div className="space-y-4">
        <header className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Mic size={16} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Voice Call Console</h1>
            <p className="text-xs text-[var(--muted)]">
              {status?.telephonyConfigured
                ? `Telephony connected (${status.from})`
                : 'Animated Avatar + Live Voice Simulation Ready'}
            </p>
          </div>
        </header>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        {/* Animated Avatar Stage Card */}
        <div className="oa-float-card flex flex-col items-center p-4 text-center">
          <LiveAvatar
            personaId={personaId}
            emotion={activeEmotion}
            speaking={speakingNow}
            listening={active && !speakingNow}
            size={112}
            showRings={true}
          />
          <p className="mt-2 text-sm font-bold text-[var(--tone-strong)]">
            {persona.name} <span className="text-xs font-normal text-[var(--muted)]">• {activeEmotion}</span>
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {(Object.values(AVATAR_PERSONAS) as Array<(typeof AVATAR_PERSONAS)[AvatarPersonaId]>).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPersonaId(p.id)
                  setSavedAvatarPersona(p.id)
                }}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                  p.id === personaId
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'border border-[var(--border)] text-[var(--muted)] hover:text-[var(--tone-strong)]'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (autoSpeak) stopSpeaking()
              setAutoSpeak((a) => !a)
            }}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-[11px] font-medium text-[var(--tone-default)]"
          >
            {autoSpeak ? <Volume2 size={12} className="text-emerald-500" /> : <VolumeX size={12} />}
            <span>{autoSpeak ? 'Auto-Speak Turns: ON' : 'Auto-Speak Turns: Muted'}</span>
          </button>
        </div>

        <div className="oa-float-card space-y-2 p-3">
          <p className="text-xs font-semibold text-[var(--tone-strong)]">Start a Voice Call</p>
          <select
            className={inputCls}
            value={direction}
            onChange={(e) => setDirection(e.target.value as any)}
          >
            <option value="outbound">Outbound Call</option>
            <option value="inbound">Inbound Call</option>
          </select>
          <input
            className={inputCls}
            placeholder="Call goal (e.g. Confirm Friday 7 PM reservation)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="…or attach real phone call id"
            value={phoneCallId}
            onChange={(e) => setPhoneCallId(e.target.value)}
          />
          <button
            className={btnCls + ' w-full'}
            disabled={!goal.trim() && !phoneCallId.trim()}
            onClick={start}
          >
            Start Call with {persona.name}
          </button>
        </div>

        <div className="oa-float-card max-h-[280px] divide-y divide-black/5 overflow-y-auto">
          {!sessions.length && <p className="p-3 text-xs text-[var(--muted)]">No calls yet.</p>}
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`block w-full p-3 text-left text-xs ${current?.id === s.id ? 'bg-slate-100 dark:bg-white/10' : ''}`}
              onClick={() => select(s.id)}
            >
              <p className="font-medium text-[var(--tone-strong)]">
                {s.direction} · {s.source}
              </p>
              <p className="truncate text-[var(--muted)]">{s.goal}</p>
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
                {s.status}
                {s.humanTakeover ? ' · human' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {!current && (
          <div className="oa-float-card flex flex-col items-center justify-center p-10 text-center">
            <LiveAvatar personaId={personaId} emotion="happy" size={96} showRings={false} />
            <p className="mt-3 text-sm font-semibold text-[var(--tone-strong)]">
              Ready to Launch a Live Voice Call with {persona.name}
            </p>
            <p className="mt-1 max-w-md text-xs text-[var(--muted)]">
              Enter a call goal on the left (for example, &ldquo;Book a table for 4 at 7:30 PM&rdquo;) and click Start Call to watch and hear {persona.name} conduct the call live.
            </p>
          </div>
        )}
        {current && (
          <section className="oa-float-card flex h-[min(640px,78dvh)] flex-col p-4 sm:h-[640px]">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <LiveAvatar
                personaId={personaId}
                emotion={activeEmotion}
                speaking={speakingNow}
                listening={active && !speakingNow}
                size={40}
                showRings={false}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--tone-strong)]">
                  {current.party} · {current.direction} ({persona.name})
                </p>
                <p className="truncate text-xs text-[var(--muted)]">{current.goal}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200'
                }`}
              >
                {current.status}
              </span>
              <button
                className={`flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold ${
                  current.humanTakeover ? 'bg-emerald-600 text-white' : 'border'
                }`}
                disabled={!active}
                onClick={() => wrap(() => sdk.growthVoice.voice.takeover(current.id, !current.humanTakeover))}
              >
                <Hand size={13} />
                {current.humanTakeover ? 'Return to agent' : 'Take over'}
              </button>
              <button
                className="flex h-9 items-center gap-1 rounded-xl border px-3 text-xs text-red-600"
                disabled={!active}
                onClick={() => wrap(() => sdk.growthVoice.voice.end(current.id))}
              >
                <PhoneOff size={13} />
                End
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-white/50 p-3 dark:bg-black/20">
              {turns.map((t) => (
                <div
                  key={t.seq}
                  className={`flex max-w-[82%] items-start justify-between gap-2 rounded-2xl px-3.5 py-2 text-sm ${
                    roleStyle[t.role] ?? roleStyle.system
                  }`}
                >
                  <div>
                    {t.role !== 'system' && (
                      <p className="mb-0.5 text-[10px] uppercase opacity-60">
                        {t.role === 'agent' ? persona.name : t.role}
                      </p>
                    )}
                    {t.text}
                  </div>
                  {t.role !== 'system' && (
                    <button
                      type="button"
                      onClick={() => void speakTurn(t.text)}
                      className="mt-0.5 shrink-0 rounded-lg p-1 opacity-70 hover:opacity-100"
                      title="Speak this turn aloud"
                    >
                      <Volume2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder="Steer the agent mid-call (e.g. offer a 10% discount)…"
                  value={steer}
                  onChange={(e) => setSteer(e.target.value)}
                  disabled={!active}
                />
                <button
                  className={btnCls}
                  disabled={!active || !steer.trim()}
                  onClick={() =>
                    wrap(async () => {
                      const s = await sdk.growthVoice.voice.steer(current.id, steer)
                      setSteer('')
                      return s
                    })
                  }
                >
                  <Compass size={14} className="mr-1 inline" />
                  Steer
                </button>
              </div>
              {current.humanTakeover && sim && (
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    placeholder="Speak as the human operator…"
                    value={say}
                    onChange={(e) => setSay(e.target.value)}
                  />
                  <button
                    className={btnCls}
                    disabled={!active || !say.trim()}
                    onClick={() =>
                      wrap(async () => {
                        const s = await sdk.growthVoice.voice.say(current.id, say)
                        setSay('')
                        return s
                      })
                    }
                  >
                    <Send size={14} />
                  </button>
                </div>
              )}
              {sim && (
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    placeholder="Simulate the other party (blank = scripted line)"
                    value={callerText}
                    onChange={(e) => setCallerText(e.target.value)}
                  />
                  <button
                    className="h-10 shrink-0 rounded-xl border px-4 text-sm"
                    disabled={!active}
                    onClick={() =>
                      wrap(async () => {
                        const s = await sdk.growthVoice.voice.simulateCaller(
                          current.id,
                          callerText || undefined,
                        )
                        setCallerText('')
                        return s
                      })
                    }
                  >
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
