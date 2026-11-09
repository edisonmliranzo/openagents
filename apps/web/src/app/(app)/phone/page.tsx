'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Film,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { sdk } from '@/stores/auth'
import { SpeechQueue, speak, stopSpeaking, takeSentences } from '@/lib/voice'
import {
  AVATAR_PERSONAS,
  type AvatarEmotion,
  type AvatarPersonaId,
  getSavedAvatarPersona,
  inferAvatarEmotion,
  LiveAvatar,
  setSavedAvatarPersona,
} from '@/components/chat/LiveAvatar'
import {
  RealisticAvatar,
  useAvatars,
  type RealisticAvatarRecord,
} from '@/components/avatar/RealisticAvatar'

interface PhoneTurn {
  role: 'caller' | 'agent'
  text: string
  at: string
}

interface PhoneCallRecord {
  id: string
  direction: 'outbound' | 'inbound'
  to: string
  from: string
  goal: string
  status: 'pending_approval' | 'rejected' | 'dialing' | 'in_progress' | 'completed' | 'failed'
  transcript: PhoneTurn[]
  summary?: string
  error?: string
  createdAt: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: any) => void) | null
  onend: (() => void) | null
  onerror: ((event: any) => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null
}

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function cleanError(e: any, fallback: string): string {
  const raw = String(e?.message ?? '').trim()
  if (!raw || raw.startsWith('<') || /<html|<!doctype/i.test(raw)) return fallback
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.message) return String(parsed.message)
  } catch {
    /* not JSON */
  }
  return raw.length > 240 ? fallback : raw
}

const CALL_LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'es-ES', label: 'Español' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'zh-CN', label: '中文 (简体)' },
]

const CALL_STARTERS = [
  'Give me a 30-second executive briefing on my priorities today.',
  'Roleplay a customer discovery call with me and ask tough questions.',
  'Help me think through our launch checklist out loud.',
  'Draft a warm follow-up message for my top prospect.',
]

export default function PhoneAgentPage() {
  const { avatars: customAvatars, active: activeCustomAvatar, refresh: refreshAvatars } = useAvatars()
  // ── Live Avatar Voice Call state ──
  const [personaId, setPersonaId] = useState<AvatarPersonaId>('nova')
  const [emotionOverride, setEmotionOverride] = useState<'auto' | AvatarEmotion>('auto')
  const [inLiveCall, setInLiveCall] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const [callState, setCallState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')
  const [muted, setMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [interimText, setInterimText] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [liveTurns, setLiveTurns] = useState<PhoneTurn[]>([])
  const [liveConvId, setLiveConvId] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const bargeRef = useRef<SpeechRecognitionLike | null>(null)
  const speechQueueRef = useRef<SpeechQueue | null>(null)
  const [handsFree, setHandsFree] = useState(false)
  const [callLang, setCallLang] = useState<string>('en-US')
  const [callSummary, setCallSummary] = useState<{ status: 'loading' | 'ready' | 'saved' | 'error'; text: string } | null>(null)
  const [briefingTime, setBriefingTime] = useState('08:00')
  const [briefingMsg, setBriefingMsg] = useState<string | null>(null)

  useEffect(() => {
    try {
      setHandsFree(window.localStorage.getItem('openagents-phone-handsfree') === '1')
      const savedLang = window.localStorage.getItem('openagents-phone-lang')
      if (savedLang && CALL_LANGUAGES.some((l) => l.code === savedLang)) setCallLang(savedLang)
    } catch {
      /* ignore */
    }
    return () => {
      speechQueueRef.current?.stop()
    }
  }, [])

  // ── Telephony Call Queue state ──
  const [status, setStatus] = useState<{ configured: boolean; fromNumber: string | null } | null>(null)
  const [calls, setCalls] = useState<PhoneCallRecord[]>([])
  const [selected, setSelected] = useState<PhoneCallRecord | null>(null)
  const [to, setTo] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPersonaId(getSavedAvatarPersona())
  }, [])

  const persona = AVATAR_PERSONAS[personaId] ?? AVATAR_PERSONAS.nova
  const stageAvatarRecord: RealisticAvatarRecord = useMemo(() => {
    if (activeCustomAvatar) return activeCustomAvatar
    return {
      id: `preset-${persona.id}`,
      name: persona.name,
      description: persona.tagline,
      media: {
        portrait: { url: persona.portraitSrc, mime: 'image/jpeg' },
      },
      jobs: {},
      voiceProvider: null,
      voiceId: null,
      isActive: true,
      createdAt: '',
    }
  }, [activeCustomAvatar, persona])
  const displayAvatarName = activeCustomAvatar ? activeCustomAvatar.name : persona.name

  // Call timer
  useEffect(() => {
    if (!inLiveCall) {
      setCallSeconds(0)
      return
    }
    const t = setInterval(() => setCallSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [inLiveCall])

  const lastAgentTurnText = useMemo(() => {
    const last = [...liveTurns].reverse().find((t) => t.role === 'agent')
    return last?.text ?? ''
  }, [liveTurns])

  const activeEmotion: AvatarEmotion = useMemo(() => {
    if (emotionOverride !== 'auto') return emotionOverride
    return inferAvatarEmotion(lastAgentTurnText, callState)
  }, [emotionOverride, lastAgentTurnText, callState])

  const load = useCallback(async () => {
    try {
      const [st, list] = await Promise.all([
        sdk.client.get<{ configured: boolean; fromNumber: string | null }>('/api/v1/phone/status'),
        sdk.client.get<PhoneCallRecord[]>('/api/v1/phone/calls'),
      ])
      setStatus(st)
      setCalls(list)
      if (selected) {
        const updated = list.find((c) => c.id === selected.id)
        if (updated) setSelected(updated)
      } else if (list.length > 0) {
        setSelected(list[0])
      }
    } catch (e: any) {
      setError(cleanError(e, 'Failed to load phone agent'))
    }
  }, [selected])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [load])

  const inLiveCallRef = useRef(false)
  useEffect(() => {
    inLiveCallRef.current = inLiveCall
  }, [inLiveCall])
  const handsFreeRef = useRef(handsFree)
  useEffect(() => {
    handsFreeRef.current = handsFree
    try {
      window.localStorage.setItem('openagents-phone-handsfree', handsFree ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [handsFree])
  useEffect(() => {
    try {
      window.localStorage.setItem('openagents-phone-lang', callLang)
    } catch {
      /* ignore */
    }
  }, [callLang])
  const startMicCaptureRef = useRef<() => void>(() => {})

  /** Builds a fresh sentence queue bound to the active avatar voice. */
  const newSpeechQueue = useCallback(() => {
    speechQueueRef.current?.stop()
    const q = new SpeechQueue({
      voiceId: activeCustomAvatar?.voiceId || undefined,
      provider: activeCustomAvatar?.voiceProvider || undefined,
      onStart: () => setCallState('speaking'),
      onIdle: () => {
        if (speechQueueRef.current !== q) return
        setCallState((s) => (s === 'speaking' || s === 'thinking' ? 'idle' : s))
        // Hands-free: reopen the mic automatically once the reply finished.
        if (handsFreeRef.current && inLiveCallRef.current) {
          setTimeout(() => {
            if (speechQueueRef.current === q && inLiveCallRef.current) startMicCaptureRef.current()
          }, 250)
        }
      },
    })
    speechQueueRef.current = q
    return q
  }, [activeCustomAvatar])

  const speakAgentReply = useCallback(
    async (text: string) => {
      if (!speakerOn) {
        setCallState('idle')
        return
      }
      const q = newSpeechQueue()
      const { sentences } = takeSentences(text, true)
      sentences.forEach((s) => q.enqueue(s))
      q.end()
    },
    [speakerOn, newSpeechQueue],
  )

  const sendVoiceCallTurn = useCallback(
    async (userText: string, opts?: { displayText?: string }) => {
      const clean = userText.trim()
      if (!clean) return
      setInterimText('')
      speechQueueRef.current?.stop()
      const userTurn: PhoneTurn = { role: 'caller', text: opts?.displayText || clean, at: new Date().toISOString() }
      setLiveTurns((prev) => [...prev, userTurn])
      setCallState('thinking')
      const at = new Date().toISOString()
      const langName = CALL_LANGUAGES.find((l) => l.code === callLang)?.label ?? 'English'
      const prompt =
        callLang === 'en-US'
          ? clean
          : `${clean}\n\n[Voice call — the caller is speaking ${langName} (${callLang}). Reply in ${langName}, conversationally and briefly.]`

      // Streaming spoken reply: speak sentence-by-sentence as tokens arrive.
      const q = speakerOn ? newSpeechQueue() : null
      let full = ''
      let pending = ''
      let consumed = 0
      const pushText = (text: string) => {
        full = text
        setLiveTurns((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'agent' && last.at === at) {
            return [...prev.slice(0, -1), { ...last, text }]
          }
          return [...prev, { role: 'agent', text, at }]
        })
        if (!q) return
        pending += text.slice(consumed)
        consumed = text.length
        const { sentences, rest } = takeSentences(pending)
        pending = rest
        sentences.forEach((s) => q.enqueue(s))
      }

      try {
        let convId = liveConvId
        if (!convId) {
          const created = await sdk.conversations.create(`Voice Call with ${displayAvatarName}`)
          convId = created.id
          setLiveConvId(convId)
        }
        await sdk.conversations.sendMessage(convId, prompt, (chunk) => {
          try {
            const data = JSON.parse(chunk)
            if (data.event === 'delta') {
              const piece = typeof data.data?.content === 'string' ? data.data.content : ''
              if (!piece) return
              // Deltas may be cumulative or incremental — handle both.
              pushText(piece.startsWith(full) ? piece : full + piece)
            } else if (data.event === 'delta_reset') {
              full = ''
              pending = ''
              consumed = 0
            }
          } catch {
            /* ignore malformed chunk */
          }
        })
        if (!full.trim()) {
          const msgs = await sdk.conversations.messages(convId)
          const lastAgent = [...msgs].reverse().find((m) => m.role === 'agent')
          pushText(lastAgent?.content?.trim() || `I heard you say: "${clean}". How would you like to proceed?`)
        }
        if (q) {
          const { sentences } = takeSentences(pending, true)
          sentences.forEach((s) => q.enqueue(s))
          pending = ''
          q.end()
        } else {
          setCallState('idle')
        }
      } catch {
        const fallback = `I'm right here with you on the call! Regarding "${clean}", let's tackle the highest-impact step first. What details should I lock in?`
        if (q) q.stop()
        pushText(fallback)
        await speakAgentReply(fallback)
      }
    },
    [liveConvId, displayAvatarName, speakAgentReply, speakerOn, newSpeechQueue, callLang],
  )

  const startMicCapture = useCallback(() => {
    if (muted) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('Browser speech recognition is unavailable — type your voice turn below.')
      return
    }
    speechQueueRef.current?.stop()
    stopSpeaking()
    try {
      bargeRef.current?.abort()
    } catch {
      // ignore
    }
    bargeRef.current = null
    try {
      recognitionRef.current?.abort()
    } catch {
      // ignore
    }
    const r = new Ctor()
    r.lang = callLang
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 1
    let finalTranscript = ''
    r.onresult = (event: any) => {
      let heard = ''
      for (let i = 0; i < (event.results?.length ?? 0); i++) {
        const res = event.results[i]
        const txt = String(res?.[0]?.transcript ?? '')
        heard += txt
        if (res?.isFinal) finalTranscript = heard
      }
      setInterimText(heard.trim())
    }
    r.onend = () => {
      if (recognitionRef.current === r) recognitionRef.current = null
      if (finalTranscript.trim()) {
        void sendVoiceCallTurn(finalTranscript)
      } else {
        setCallState((s) => (s === 'listening' ? 'idle' : s))
      }
    }
    r.onerror = () => {
      if (recognitionRef.current === r) recognitionRef.current = null
      setCallState('idle')
    }
    recognitionRef.current = r
    try {
      r.start()
      setCallState('listening')
    } catch {
      recognitionRef.current = null
    }
  }, [muted, sendVoiceCallTurn, callLang])

  useEffect(() => {
    startMicCaptureRef.current = startMicCapture
  }, [startMicCapture])

  // ── Barge-in: while the avatar speaks, listen lightly; if the caller talks, interrupt. ──
  useEffect(() => {
    if (!inLiveCall || muted || callState !== 'speaking') return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    const r = new Ctor()
    r.lang = callLang
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    let interrupted = false
    let finalText = ''
    r.onresult = (event: any) => {
      let heard = ''
      for (let i = 0; i < (event.results?.length ?? 0); i++) {
        const res = event.results[i]
        heard += String(res?.[0]?.transcript ?? '')
        if (res?.isFinal) finalText = heard
      }
      const words = heard.trim().split(/\s+/).filter(Boolean)
      // Require two words to avoid triggering on the avatar's own audio bleed.
      if (!interrupted && words.length >= 2) {
        interrupted = true
        speechQueueRef.current?.stop()
        stopSpeaking()
        setCallState('listening')
      }
      if (interrupted) {
        setInterimText(heard.trim())
        if (finalText.trim()) {
          const text = finalText
          finalText = ''
          try {
            r.abort()
          } catch {
            /* ignore */
          }
          if (bargeRef.current === r) bargeRef.current = null
          void sendVoiceCallTurn(text)
        }
      }
    }
    r.onend = () => {
      if (bargeRef.current === r) bargeRef.current = null
    }
    r.onerror = () => {
      if (bargeRef.current === r) bargeRef.current = null
    }
    bargeRef.current = r
    try {
      r.start()
    } catch {
      bargeRef.current = null
    }
    return () => {
      // Keep the recognizer alive if it is mid-capture after an interruption.
      if (!interrupted) {
        try {
          r.abort()
        } catch {
          /* ignore */
        }
        if (bargeRef.current === r) bargeRef.current = null
      }
    }
  }, [inLiveCall, muted, callState, callLang, sendVoiceCallTurn])

  // ── Daily briefing deep link: /phone?briefing=1 auto-starts a briefing call ──
  const briefingStartedRef = useRef(false)
  useEffect(() => {
    if (briefingStartedRef.current || typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('briefing') !== '1') return
    briefingStartedRef.current = true
    setInLiveCall(true)
    setLiveTurns([])
    void sendVoiceCallTurn(
      "Give me today's briefing: top priorities, meetings, anything urgent in my inbox or tasks, and one suggestion. Keep it under a minute when spoken.",
      { displayText: "📅 Today's briefing, please." },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleScheduleBriefing() {
    setBriefingMsg(null)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const [lhRaw, lmRaw] = (briefingTime || '08:00').split(':')
      const localHour = Number(lhRaw || 8)
      const localMin = Number(lmRaw || 0)
      const now = new Date()
      const localDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), localHour, localMin, 0)
      const utcHour = localDate.getUTCHours()
      const utcMin = localDate.getUTCMinutes()
      const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
      await sdk.scheduler.create({
        name: 'Daily briefing call',
        description: 'Sends a notification each morning linking to a live briefing call on /phone.',
        schedule: `${utcMin} ${utcHour} * * *`,
        message: `Send me a short notification: "Your daily briefing call is ready — tap to start: ${origin}/phone?briefing=1". Include the link exactly.`,
        deliveryMode: 'announce',
      })
      setBriefingMsg(`Daily briefing call scheduled for ${briefingTime || '08:00'} (${tzName}). You'll get a notification linking to /phone?briefing=1.`)
    } catch (e: any) {
      setBriefingMsg(cleanError(e, 'Could not schedule the briefing call.'))
    }
  }

  async function summarizeCall(turns: PhoneTurn[], convId: string | null) {
    const exchanges = turns.filter((t) => t.role === 'caller').length
    if (exchanges < 2) return
    setCallSummary({ status: 'loading', text: '' })
    const transcript = turns
      .map((t) => `${t.role === 'agent' ? displayAvatarName : 'Caller'}: ${t.text}`)
      .join('\n')
      .slice(-6000)
    try {
      let id = convId
      if (!id) id = (await sdk.conversations.create(`Voice Call summary`)).id
      let text = ''
      await sdk.conversations.sendMessage(
        id,
        `The voice call just ended. Summarize it in exactly 3 short bullet points (start each with "- "), covering decisions and next steps. Do not use tools.\n\nTranscript:\n${transcript}`,
        (chunk) => {
          try {
            const data = JSON.parse(chunk)
            if (data.event === 'delta' && typeof data.data?.content === 'string') {
              const piece = data.data.content
              text = piece.startsWith(text) ? piece : text + piece
            } else if (data.event === 'delta_reset') {
              text = ''
            }
          } catch {
            /* ignore */
          }
        },
      )
      if (!text.trim()) {
        const msgs = await sdk.conversations.messages(id)
        text = [...msgs].reverse().find((m) => m.role === 'agent')?.content ?? ''
      }
      text = text.trim()
      if (!text) throw new Error('empty summary')
      setCallSummary({ status: 'ready', text })
      try {
        await sdk.memory.writeEvent({
          kind: 'conversation',
          summary: `Voice call with ${displayAvatarName} (${new Date().toLocaleString()}):\n${text}`,
          sourceRef: id ? `conversation:${id}` : undefined,
          tags: ['voice-call', 'call-summary'],
        })
        setCallSummary({ status: 'saved', text })
      } catch {
        /* summary still shown even if memory save fails */
      }
    } catch {
      setCallSummary({ status: 'error', text: 'Could not generate a call summary.' })
    }
  }

  async function handleStartLiveCall() {
    setError(null)
    setCallSummary(null)
    setInLiveCall(true)
    const greeting = `Hey! It's ${displayAvatarName}. We're connected on a live voice call—what would you like to work on together?`
    setLiveTurns([{ role: 'agent', text: greeting, at: new Date().toISOString() }])
    await speakAgentReply(greeting)
  }

  function handleEndLiveCall() {
    speechQueueRef.current?.stop()
    speechQueueRef.current = null
    stopSpeaking()
    for (const ref of [recognitionRef, bargeRef]) {
      try {
        ref.current?.abort()
      } catch {
        // ignore
      }
      ref.current = null
    }
    setInLiveCall(false)
    setCallState('idle')
    setInterimText('')
    void summarizeCall(liveTurns, liveConvId)
  }

  function handleSelectPersona(id: AvatarPersonaId) {
    setPersonaId(id)
    setSavedAvatarPersona(id)
  }

  async function handleActivateCustomAvatar(id: string) {
    try {
      await sdk.client.post(`/api/v1/avatars/${id}/activate`, {})
      await refreshAvatars()
    } catch (e: any) {
      setError(cleanError(e, 'Could not activate avatar'))
    }
  }

  async function handleQueueCall(e: React.FormEvent) {
    e.preventDefault()
    if (!to.trim() || !goal.trim()) return
    setBusy(true)
    setError(null)
    try {
      const created = await sdk.client.post<PhoneCallRecord>('/api/v1/phone/calls', {
        to: to.trim(),
        goal: goal.trim(),
      })
      setTo('')
      setGoal('')
      setSelected(created)
      await load()
    } catch (e: any) {
      setError(cleanError(e, 'Could not queue call'))
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove(id: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await sdk.client.post<PhoneCallRecord>(`/api/v1/phone/calls/${id}/approve`, {})
      setSelected(updated)
      await load()
    } catch (e: any) {
      setError(cleanError(e, 'Approval failed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleReject(id: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await sdk.client.post<PhoneCallRecord>(`/api/v1/phone/calls/${id}/reject`, {})
      setSelected(updated)
      await load()
    } catch (e: any) {
      setError(cleanError(e, 'Reject failed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSpeakTurn(text: string) {
    setCallState('speaking')
    await speak(text, {
      voiceId: activeCustomAvatar?.voiceId || undefined,
      provider: activeCustomAvatar?.voiceProvider || undefined,
      onEnd: () => setCallState('idle'),
      onError: () => setCallState('idle'),
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-0.5 text-[11px] font-semibold text-rose-500 mb-1.5">
            <Sparkles className="h-3 w-3" /> Voice Calls &amp; Realistic Video Avatars
          </div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-[var(--tone-strong)]">
            <Phone className="h-6 w-6 text-rose-500" /> Live Voice Calls &amp; Realistic Avatars
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Talk face-to-face with your photorealistic multi-angle video avatar using Fish Audio or ElevenLabs, or dispatch PSTN phone calls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/avatars"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:brightness-110"
          >
            <Film className="h-3.5 w-3.5" />
            <span>Avatar Studio (Multi-Angle Video &amp; Upload)</span>
          </Link>
          <Link
            href="/frontier/voice-console"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--tone-strong)] hover:bg-[var(--surface-muted)]"
          >
            <Mic className="h-3.5 w-3.5 text-rose-500" />
            <span>Operator Call Console</span>
          </Link>
          <Link
            href="/settings/voice"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--tone-strong)] hover:bg-[var(--surface-muted)]"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>Neural Voice Settings</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* ── FLAGSHIP LIVE REALISTIC AVATAR VOICE CALL DECK ── */}
      <section className="overflow-hidden rounded-[20px] border border-white/15 bg-gradient-to-br from-[#0f1424] via-[#0b101d] to-[#130d1e] p-4 text-white shadow-2xl sm:rounded-[28px] sm:p-8">
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-12 lg:items-center">
          {/* Left: Realistic Video / Portrait Avatar Call Stage */}
          <div className="flex flex-col items-center text-center lg:col-span-5">
            <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {inLiveCall ? `On Call • ${formatCallDuration(callSeconds)}` : 'Ready for Voice Call'}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] capitalize text-rose-300">
                Expression: {activeEmotion}
              </span>
            </div>

            <div
              onClick={() => (inLiveCall ? startMicCapture() : void handleStartLiveCall())}
              className="group relative my-2 w-full max-w-[220px] cursor-pointer focus:outline-none sm:max-w-[260px]"
              title={inLiveCall ? 'Tap avatar to speak or interrupt' : 'Tap to start live voice call'}
            >
              <RealisticAvatar avatar={stageAvatarRecord} state={callState} />
            </div>

            <h2 className="mt-2 text-xl font-bold text-white">
              {displayAvatarName}{' '}
              <span className="text-sm font-normal text-slate-400">
                • {activeCustomAvatar?.description || persona.tagline}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              {activeCustomAvatar?.voiceProvider
                ? `${activeCustomAvatar.voiceProvider === 'fish' ? 'Fish Audio 2.0' : 'ElevenLabs'} Neural Voice`
                : persona.voiceStyle}
            </p>

            {/* Primary Call Controls */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {!inLiveCall ? (
                <button
                  type="button"
                  onClick={() => void handleStartLiveCall()}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110"
                >
                  <PhoneCall className="h-4 w-4" />
                  <span>Start Voice Call with {displayAvatarName}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={startMicCapture}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold text-white shadow-lg transition ${
                      callState === 'listening'
                        ? 'bg-rose-500 animate-pulse'
                        : 'bg-gradient-to-r from-rose-500 to-orange-500 hover:brightness-110'
                    }`}
                  >
                    <Mic className="h-4 w-4" />
                    <span>{callState === 'listening' ? 'Listening…' : 'Push to Talk'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                      muted
                        ? 'border-amber-400/50 bg-amber-500/20 text-amber-300'
                        : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                    title={muted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (speakerOn) stopSpeaking()
                      setSpeakerOn((s) => !s)
                    }}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                      speakerOn
                        ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                        : 'border-white/15 bg-white/5 text-slate-400'
                    }`}
                    title={speakerOn ? 'Speakerphone ON' : 'Speakerphone Muted'}
                  >
                    {speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleEndLiveCall}
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-500"
                  >
                    <PhoneOff className="h-4 w-4" />
                    <span>End Call</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right: Persona Switcher, Expression Controls & Live Call Transcript */}
          <div className="space-y-4 lg:col-span-7">
            {/* Call options: language, hands-free, daily briefing */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
              <label className="inline-flex items-center gap-1.5">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">Language</span>
                <select
                  value={callLang}
                  onChange={(e) => setCallLang(e.target.value)}
                  className="h-7 rounded-lg border border-white/15 bg-slate-900 px-2 text-xs text-white outline-none"
                >
                  {CALL_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} ({l.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5" title="Automatically re-open the mic after each reply. Speak over the avatar any time to interrupt.">
                <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} className="accent-emerald-500" />
                <span>Hands-free (auto-listen after reply)</span>
              </label>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <input
                  type="time"
                  value={briefingTime}
                  onChange={(e) => setBriefingTime(e.target.value)}
                  className="h-7 rounded-lg border border-white/15 bg-slate-900 px-2 text-xs text-white outline-none"
                  title="Briefing time (UTC)"
                />
                <button
                  type="button"
                  onClick={() => void handleScheduleBriefing()}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 font-semibold text-white hover:bg-white/10"
                >
                  <PhoneIncoming className="h-3.5 w-3.5 text-emerald-400" /> Schedule daily briefing call
                </button>
              </span>
              {briefingMsg && <p className="w-full text-[11px] text-emerald-300">{briefingMsg}</p>}
            </div>

            {callSummary && (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs text-slate-100">
                <div className="mb-1 flex items-center justify-between font-semibold text-emerald-300">
                  <span>Call summary</span>
                  <span className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
                    {callSummary.status === 'loading' ? 'Summarizing…' : callSummary.status === 'saved' ? 'Saved to Memory ✓' : callSummary.status === 'error' ? 'Failed' : ''}
                    <button type="button" onClick={() => setCallSummary(null)} title="Dismiss" className="text-slate-400 hover:text-white">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                {callSummary.text && <p className="whitespace-pre-wrap leading-relaxed">{callSummary.text}</p>}
              </div>
            )}
            {/* 4 Realistic Avatars + Custom Studio Avatars Selector */}
            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Select Realistic Avatar Persona</span>
                <Link href="/avatars" className="text-rose-400 underline hover:text-rose-300">
                  + Custom Multi-Angle Video in Avatar Studio →
                </Link>
              </div>
              {customAvatars.length > 0 && (
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  {customAvatars.map((ca) => (
                    <button
                      key={ca.id}
                      type="button"
                      onClick={() => void handleActivateCustomAvatar(ca.id)}
                      className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-xs font-semibold transition ${
                        ca.isActive
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                          : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {ca.media.portrait?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ca.media.portrait.url} alt={ca.name} className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="h-6 w-6 rounded-full bg-rose-500/40" />
                      )}
                      <span>{ca.name}</span>
                      {(ca.media.idle || ca.media.talking) && (
                        <span className="rounded bg-rose-500/30 px-1.5 py-0.5 text-[9px] uppercase text-rose-200">
                          Video
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.values(AVATAR_PERSONAS) as Array<(typeof AVATAR_PERSONAS)[AvatarPersonaId]>).map((p) => {
                  const active = p.id === personaId
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPersona(p.id)}
                      className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition ${
                        active
                          ? 'border-rose-400/60 bg-white/12 shadow-md'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                      }`}
                    >
                      <LiveAvatar
                        personaId={p.id}
                        emotion={active ? activeEmotion : 'happy'}
                        speaking={active && callState === 'speaking'}
                        size={36}
                        showRings={false}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-white">{p.name}</div>
                        <div className="truncate text-[10px] text-slate-400">{p.tagline}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Expression Mood Selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Mood:
              </span>
              {(
                ['auto', 'happy', 'empathetic', 'focused', 'thinking', 'surprised'] as Array<
                  'auto' | AvatarEmotion
                >
              ).map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmotionOverride(em)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                    emotionOverride === em
                      ? 'bg-white text-slate-950 font-semibold'
                      : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {em === 'auto' ? 'Auto-Detect' : em}
                </button>
              ))}
            </div>

            {/* Live Call Transcript Box */}
            <div className="flex h-56 flex-col justify-between rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="space-y-2.5 overflow-y-auto pr-1">
                {liveTurns.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Click <strong>Start Voice Call with {persona.name}</strong> or pick a starter prompt below to begin talking face-to-face.
                  </p>
                ) : (
                  liveTurns.map((t, i) => (
                    <div
                      key={i}
                      className={`flex items-start justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs ${
                        t.role === 'agent'
                          ? 'border border-rose-500/25 bg-rose-500/10 text-slate-100'
                          : 'bg-white/10 text-slate-200'
                      }`}
                    >
                      <div>
                        <span className="mr-2 font-bold uppercase text-rose-300">
                          {t.role === 'agent' ? persona.name : 'You'}:
                        </span>
                        <span>{t.text}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSpeakTurn(t.text)}
                        className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1 text-slate-300 hover:bg-white/15"
                        title="Replay spoken audio"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
                {interimText && (
                  <p className="text-xs italic text-sky-300">Listening: &ldquo;{interimText}&rdquo;</p>
                )}
              </div>

              {/* Type or Speak into Call */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!manualInput.trim()) return
                  if (!inLiveCall) setInLiveCall(true)
                  const txt = manualInput
                  setManualInput('')
                  void sendVoiceCallTurn(txt)
                }}
                className="mt-3 flex gap-2 border-t border-white/10 pt-3"
              >
                <input
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder={`Say or type something to ${persona.name} on the call…`}
                  className="h-9 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-xs text-white placeholder:text-slate-400 outline-none focus:border-rose-400"
                />
                <button
                  type="submit"
                  disabled={!manualInput.trim() || callState === 'thinking'}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Speak</span>
                </button>
              </form>
            </div>

            {/* Quick Voice Call Starters */}
            <div className="flex flex-wrap gap-1.5">
              {CALL_STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    if (!inLiveCall) setInLiveCall(true)
                    void sendVoiceCallTurn(prompt)
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-300 transition hover:border-rose-400/40 hover:bg-white/10 hover:text-white"
                >
                  &ldquo;{prompt}&rdquo;
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TELEPHONY OUTBOUND / INBOUND CALL QUEUE ── */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[var(--tone-strong)]">
            Outbound &amp; Inbound Phone Call Queue (PSTN / Twilio)
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs">
            {status?.configured ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Twilio Connected · {status.fromNumber}
              </span>
            ) : (
              <span className="text-[var(--muted)]">
                PSTN Telephony Optional — Browser Avatar Voice Calls above work without Twilio
              </span>
            )}
          </div>
        </div>

        <form
          onSubmit={handleQueueCall}
          className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-4"
        >
          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">Phone Number (E.164)</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+14155550123"
              className="oa-input-surface mt-1 h-10 w-full rounded-xl px-3 text-sm outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[var(--muted)]">Call Objective / Instructions</label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Book a table for 2 at 7:00 PM this Friday under Alex"
              className="oa-input-surface mt-1 h-10 w-full rounded-xl px-3 text-sm outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy || !to.trim() || !goal.trim()}
              className="oa-accent-button inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <PhoneCall className="h-4 w-4" /> Queue Phone Call
            </button>
          </div>
        </form>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3">
            {calls.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
                No PSTN phone calls queued yet.
              </div>
            ) : (
              calls.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    selected?.id === c.id
                      ? 'border-rose-500/60 bg-rose-500/5'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--tone-strong)]">
                      {c.direction === 'inbound' ? (
                        <PhoneIncoming className="h-4 w-4 text-sky-500" />
                      ) : (
                        <PhoneOutgoing className="h-4 w-4 text-emerald-500" />
                      )}
                      {c.direction === 'inbound' ? c.from : c.to}
                    </span>
                    <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--tone-default)]">
                      {c.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-[var(--muted)]">{c.goal}</p>
                </div>
              ))
            )}
          </div>

          {selected && (
            <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <LiveAvatar
                    personaId={personaId}
                    speaking={callState === 'speaking'}
                    emotion="focused"
                    size={44}
                    showRings={false}
                  />
                  <div>
                    <h3 className="text-base font-semibold text-[var(--tone-strong)]">
                      {selected.direction === 'inbound'
                        ? `Inbound from ${selected.from}`
                        : `Outbound to ${selected.to}`}
                    </h3>
                    <p className="text-xs text-[var(--muted)]">{selected.goal}</p>
                  </div>
                </div>
                {selected.status === 'pending_approval' && (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-200">
                      Awaiting approval to dial
                    </span>
                    <button
                      onClick={() => handleApprove(selected.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      <Check className="h-3.5 w-3.5" /> Dial Now
                    </button>
                    <button
                      onClick={() => handleReject(selected.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1 text-xs text-rose-600 dark:text-rose-300"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                )}
              </div>

              {selected.summary && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                    Call Summary
                  </div>
                  {selected.summary}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Call Transcript
                </div>
                {selected.transcript.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No speech turns recorded yet.</p>
                ) : (
                  selected.transcript.map((t, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm"
                    >
                      <div>
                        <span className="mr-2 text-xs font-semibold uppercase text-[var(--muted)]">
                          {t.role}:
                        </span>
                        {t.text}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSpeakTurn(t.text)}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-xs hover:opacity-80"
                        title="Speak this turn with your Animated Avatar"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
