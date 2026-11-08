'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Loader2, Mic, MicOff, Sparkles, Square, Volume2, VolumeX, X, Settings2 } from 'lucide-react'
import clsx from 'clsx'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { speak, stopSpeaking, voiceEnabled, setVoiceEnabled } from '@/lib/voice'
import { useVoiceConversation } from '@/lib/useVoiceConversation'
import {
  AVATAR_PERSONAS,
  type AvatarEmotion,
  type AvatarPersonaId,
  getSavedAvatarPersona,
  inferAvatarEmotion,
  LiveAvatar,
  setSavedAvatarPersona,
} from './LiveAvatar'

const EMOTION_OPTIONS: Array<{ id: 'auto' | AvatarEmotion; label: string }> = [
  { id: 'auto', label: 'Auto Expression' },
  { id: 'happy', label: 'Happy' },
  { id: 'empathetic', label: 'Empathetic' },
  { id: 'focused', label: 'Focused' },
  { id: 'surprised', label: 'Surprised' },
  { id: 'thinking', label: 'Thinking' },
]

const VOICE_PROMPTS = [
  'Give me a quick morning briefing and top priorities.',
  'Help me brainstorm 3 high-impact product launch ideas.',
  'Summarize what we worked on recently and what is next.',
]

export function WebRtcVoiceControls() {
  const [studioOpen, setStudioOpen] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [hasNeuralTtsKey, setHasNeuralTtsKey] = useState<boolean | null>(null)
  const [personaId, setPersonaId] = useState<AvatarPersonaId>('nova')
  const [emotionOverride, setEmotionOverride] = useState<'auto' | AvatarEmotion>('auto')
  const [previewSpeaking, setPreviewSpeaking] = useState(false)

  const messages = useChatStore((s) => s.messages)
  const sendMessage = useChatStore((s) => s.sendMessage)

  const voice = useVoiceConversation({
    ttsEnabled: ttsEnabled || studioOpen,
    handsFree,
  })
  const { state, error, interim, supported, lastSpokenText, activeAudio } = voice

  useEffect(() => {
    setPersonaId(getSavedAvatarPersona())
    const onPersona = (e: Event) => {
      const detail = (e as CustomEvent<AvatarPersonaId>).detail
      if (detail && detail in AVATAR_PERSONAS) setPersonaId(detail)
    }
    window.addEventListener('openagents:avatar-persona-changed', onPersona)
    return () => window.removeEventListener('openagents:avatar-persona-changed', onPersona)
  }, [])

  const checkNeuralConfig = useCallback(async () => {
    try {
      const status = await sdk.life.ttsStatus()
      const configured = Boolean(status.configured)
      setHasNeuralTtsKey(configured)
      setTtsEnabled(voiceEnabled())
      return configured
    } catch {
      setHasNeuralTtsKey(false)
      setTtsEnabled(voiceEnabled())
      return false
    }
  }, [])

  useEffect(() => {
    void checkNeuralConfig()
    const sync = () => void checkNeuralConfig()
    window.addEventListener('openagents:voice-settings-changed', sync)
    return () => window.removeEventListener('openagents:voice-settings-changed', sync)
  }, [checkNeuralConfig])

  const latestAgentMessage = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'agent')
    return last?.content ?? ''
  }, [messages])

  const activeEmotion: AvatarEmotion = useMemo(() => {
    if (emotionOverride !== 'auto') return emotionOverride
    return inferAvatarEmotion(lastSpokenText || latestAgentMessage, state)
  }, [emotionOverride, lastSpokenText, latestAgentMessage, state])

  const persona = AVATAR_PERSONAS[personaId] ?? AVATAR_PERSONAS.nova
  const isSpeakingNow = state === 'speaking' || previewSpeaking

  function handleSelectPersona(next: AvatarPersonaId) {
    setPersonaId(next)
    setSavedAvatarPersona(next)
  }

  function handleToggleTts() {
    if (isSpeakingNow) {
      voice.stopPlayback()
      stopSpeaking()
      setPreviewSpeaking(false)
      return
    }
    const next = !ttsEnabled
    setTtsEnabled(next)
    setVoiceEnabled(next)
  }

  function toggleListening() {
    voice.setError('')
    if (state === 'listening') return voice.stopListening()
    if (state === 'speaking' || state === 'thinking' || previewSpeaking) {
      stopSpeaking()
      setPreviewSpeaking(false)
      void voice.startListening()
      return
    }
    if (state === 'transcribing') return
    void voice.startListening()
  }

  function toggleHandsFree() {
    setHandsFree((v) => {
      if (v) voice.stopAll()
      return !v
    })
  }

  function openAvatarStudio() {
    setStudioOpen(true)
    if (!ttsEnabled) {
      setTtsEnabled(true)
      setVoiceEnabled(true)
    }
  }

  function closeAvatarStudio() {
    setStudioOpen(false)
    setPreviewSpeaking(false)
    stopSpeaking()
  }

  async function handlePreviewVoice() {
    if (isSpeakingNow) {
      voice.stopPlayback()
      stopSpeaking()
      setPreviewSpeaking(false)
      return
    }
    setPreviewSpeaking(true)
    const intro = `Hi! I'm ${persona.name}, your expressive personal agent in OpenAgents. You can talk with me naturally anytime.`
    await speak(intro, {
      onEnd: () => setPreviewSpeaking(false),
      onError: () => setPreviewSpeaking(false),
    })
  }

  async function handleQuickVoicePrompt(prompt: string) {
    if (!ttsEnabled) {
      setTtsEnabled(true)
      setVoiceEnabled(true)
    }
    await sendMessage(prompt)
  }

  if (!supported) {
    return (
      <span
        title="Voice input is not supported in this browser"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300"
      >
        <MicOff size={14} />
      </span>
    )
  }

  const label =
    state === 'listening'
      ? interim
        ? `“${interim}” — tap to send`
        : 'Listening… tap to stop'
      : state === 'transcribing'
        ? 'Transcribing…'
        : state === 'thinking'
          ? 'Agent is thinking — tap to interrupt and speak'
          : isSpeakingNow
            ? 'Speaking — tap (or talk in hands-free) to interrupt'
            : 'Voice input'

  const ttsTooltip = ttsEnabled
    ? `Spoken replies ON (${persona.name}${hasNeuralTtsKey ? ' • Neural TTS' : ' • Expressive Voice'}) — click to mute`
    : 'Enable spoken replies & expressive avatar voice'

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Expressive Avatar Studio Launcher Pill */}
        <button
          type="button"
          onClick={openAvatarStudio}
          title="Open Live Voice & Expressive Avatar Mode"
          className={clsx(
            'group inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold transition',
            isSpeakingNow || state === 'listening' || studioOpen
              ? 'border-rose-400/50 bg-gradient-to-r from-rose-500/15 to-amber-500/15 text-rose-600 dark:text-rose-300 shadow-sm'
              : 'border-[#e4e7ec] bg-white text-[#344054] hover:border-rose-300 hover:bg-rose-50/50 dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-slate-200',
          )}
        >
          <LiveAvatar
            speaking={isSpeakingNow}
            listening={state === 'listening'}
            thinking={state === 'thinking'}
            emotion={activeEmotion}
            personaId={personaId}
            audioElement={activeAudio}
            size={22}
            showRings={false}
          />
          <span className="hidden sm:inline">{persona.name}</span>
          <Sparkles size={11} className="text-rose-500 transition-transform group-hover:scale-110" />
        </button>

        {/* Mute / Unmute Spoken Replies */}
        <button
          type="button"
          onClick={handleToggleTts}
          title={ttsTooltip}
          aria-label={ttsTooltip}
          className={clsx(
            'inline-flex h-8 w-8 items-center justify-center rounded-full transition',
            ttsEnabled
              ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-[#232837]',
          )}
        >
          {isSpeakingNow ? <Square size={13} /> : ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>

        {/* Hands-Free Conversation Mode */}
        <button
          type="button"
          onClick={toggleHandsFree}
          title={handsFree ? 'Hands-free conversation mode ON (auto-listen + barge-in)' : 'Hands-free conversation mode OFF'}
          aria-label="Toggle hands-free conversation mode"
          className={clsx(
            'rounded-full px-2 py-1 text-[10px] font-semibold transition',
            handsFree
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-400 hover:text-slate-600 dark:bg-[#232837] dark:text-slate-500',
          )}
        >
          HF
        </button>

        {/* Mic Trigger */}
        <button
          type="button"
          onClick={toggleListening}
          title={label}
          aria-label={label}
          className={clsx(
            'inline-flex h-8 w-8 items-center justify-center rounded-full border transition',
            state === 'listening'
              ? 'border-rose-300 bg-rose-500 text-white animate-pulse'
              : state === 'transcribing' || state === 'thinking'
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : isSpeakingNow
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                  : 'border-[#e4e7ec] bg-white text-[#475467] hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]',
          )}
        >
          {state === 'transcribing' ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
        </button>

        {state === 'listening' && interim && (
          <span className="ml-1 max-w-[180px] truncate text-[10px] italic text-slate-500">{interim}</span>
        )}
        {error && <span className="ml-1 text-[10px] text-rose-500">{error}</span>}
      </div>

      {/* ── FULL-SCREEN / FLOATING EXPRESSIVE AVATAR & NATURAL VOICE STUDIO MODAL ── */}
      {studioOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xl animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAvatarStudio()
          }}
        >
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-[32px] border border-white/15 bg-gradient-to-b from-[#0f1424] via-[#0b101d] to-[#080b14] p-6 text-white shadow-2xl sm:p-8">
            {/* Top Header */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold text-rose-300">
                  <Sparkles size={12} /> Voice &amp; Expressive Avatars
                </span>
                <span className="text-xs text-slate-400">
                  {hasNeuralTtsKey ? 'Neural TTS Connected' : 'Expressive Voice Active'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/settings/voice"
                  onClick={closeAvatarStudio}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                >
                  <Settings2 size={13} />
                  <span>Voice Settings</span>
                </Link>
                <button
                  type="button"
                  onClick={closeAvatarStudio}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  aria-label="Close Expressive Avatar Studio"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Centerpiece Expressive Avatar */}
            <div className="my-6 flex flex-col items-center justify-center text-center">
              <button
                type="button"
                onClick={toggleListening}
                className="group relative flex items-center justify-center rounded-full p-4 focus:outline-none"
                title="Tap avatar to speak or interrupt"
              >
                <LiveAvatar
                  speaking={isSpeakingNow}
                  listening={state === 'listening'}
                  thinking={state === 'thinking'}
                  emotion={activeEmotion}
                  personaId={personaId}
                  audioElement={activeAudio}
                  size={196}
                  showRings={true}
                />
              </button>

              {/* State & Emotion Pill */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    border: `1px solid ${persona.primaryColor}`,
                    color: persona.eyeColor,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full animate-pulse"
                    style={{ backgroundColor: persona.primaryColor }}
                  />
                  {persona.name} •{' '}
                  {state === 'listening'
                    ? 'Listening to you…'
                    : state === 'thinking'
                      ? 'Thinking…'
                      : isSpeakingNow
                        ? `Speaking (${activeEmotion})`
                        : `Ready (${activeEmotion})`}
                </span>
                <button
                  type="button"
                  onClick={() => void handlePreviewVoice()}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/10"
                >
                  {previewSpeaking ? 'Stop Sample' : 'Hear Voice Sample'}
                </button>
              </div>

              {/* Live Captions Box */}
              <div className="mt-4 min-h-[60px] w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-200">
                {state === 'listening' && interim ? (
                  <p className="italic text-sky-300">&ldquo;{interim}&rdquo;</p>
                ) : lastSpokenText || latestAgentMessage ? (
                  <p className="line-clamp-3 text-slate-200">
                    {(lastSpokenText || latestAgentMessage)
                      .replace(/```[\s\S]*?```/g, '')
                      .replace(/[*_#>`~-]+/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 260)}
                  </p>
                ) : (
                  <p className="text-slate-400">
                    Tap the microphone or avatar to talk naturally with {persona.name}, or pick a quick starter below.
                  </p>
                )}
              </div>
            </div>

            {/* Persona Selector (4 Expressive Avatars) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Choose Your Expressive Avatar</span>
                <span>{persona.voiceStyle}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.values(AVATAR_PERSONAS) as Array<(typeof AVATAR_PERSONAS)[AvatarPersonaId]>).map((p) => {
                  const selected = p.id === personaId
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPersona(p.id)}
                      className={clsx(
                        'flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition',
                        selected
                          ? 'border-white/40 bg-white/12 shadow-md'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]',
                      )}
                    >
                      <LiveAvatar
                        personaId={p.id}
                        emotion={selected ? activeEmotion : 'happy'}
                        speaking={selected && isSpeakingNow}
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

            {/* Expression Mood Override */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Expression Mode
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EMOTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEmotionOverride(opt.id)}
                    className={clsx(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
                      emotionOverride === opt.id
                        ? 'bg-white text-slate-900 font-semibold'
                        : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Voice Starters */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {VOICE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleQuickVoicePrompt(prompt)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-rose-400/40 hover:bg-white/10 hover:text-white"
                >
                  &ldquo;{prompt}&rdquo;
                </button>
              ))}
            </div>

            {/* Bottom Controls Bar */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleHandsFree}
                  className={clsx(
                    'rounded-full px-3.5 py-2 text-xs font-semibold transition',
                    handsFree
                      ? 'bg-emerald-500 text-slate-950'
                      : 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10',
                  )}
                >
                  {handsFree ? 'Hands-Free: ON (Auto Turn-Taking)' : 'Hands-Free: OFF'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleTts}
                  className={clsx(
                    'rounded-full px-3.5 py-2 text-xs font-semibold transition',
                    ttsEnabled
                      ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                      : 'border border-white/15 bg-white/5 text-slate-400',
                  )}
                >
                  {ttsEnabled ? 'Voice Output: ON' : 'Voice Output: Muted'}
                </button>
              </div>

              <button
                type="button"
                onClick={toggleListening}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-bold text-white shadow-lg transition',
                  state === 'listening'
                    ? 'bg-rose-500 animate-pulse'
                    : 'bg-gradient-to-r from-rose-500 to-orange-500 hover:brightness-110',
                )}
              >
                <Mic size={15} />
                <span>
                  {state === 'listening'
                    ? 'Listening… Tap to Send'
                    : isSpeakingNow
                      ? 'Interrupt & Speak'
                      : `Talk to ${persona.name}`}
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
