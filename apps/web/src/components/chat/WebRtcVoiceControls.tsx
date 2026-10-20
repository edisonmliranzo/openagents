'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react'
import clsx from 'clsx'
import { sdk } from '@/stores/auth'
import { voiceEnabled, setVoiceEnabled } from '@/lib/voice'
import { useVoiceConversation } from '@/lib/useVoiceConversation'

export function WebRtcVoiceControls() {
  const router = useRouter()
  const [handsFree, setHandsFree] = useState(false)
  // Strictly OFF by default — users must opt in and configure Fish Audio / ElevenLabs in Settings -> Voice
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [hasNeuralTtsKey, setHasNeuralTtsKey] = useState<boolean | null>(null)

  const voice = useVoiceConversation({ ttsEnabled: ttsEnabled && Boolean(hasNeuralTtsKey), handsFree })
  const { state, error, interim, supported } = voice

  const checkNeuralConfig = useCallback(async () => {
    try {
      // Saved provider OR server env provider counts as available; playback stays opt-in via voiceEnabled().
      const status = await sdk.life.ttsStatus()
      const configured = Boolean(status.configured)
      setHasNeuralTtsKey(configured)
      setTtsEnabled(configured && voiceEnabled())
      return configured
    } catch {
      setHasNeuralTtsKey(false)
      setTtsEnabled(false)
      return false
    }
  }, [])

  useEffect(() => {
    void checkNeuralConfig()
    const sync = () => void checkNeuralConfig()
    window.addEventListener('openagents:voice-settings-changed', sync)
    return () => window.removeEventListener('openagents:voice-settings-changed', sync)
  }, [checkNeuralConfig])

  async function handleToggleTts() {
    if (state === 'speaking') {
      voice.stopPlayback()
      return
    }
    const configured = await checkNeuralConfig()
    if (!configured) {
      router.push('/settings/voice')
      return
    }
    const next = !ttsEnabled
    setTtsEnabled(next)
    setVoiceEnabled(next)
  }

  function toggleListening() {
    voice.setError('')
    if (state === 'listening') return voice.stopListening()
    if (state === 'speaking' || state === 'thinking') {
      // Barge-in by tap: cut the agent off and listen.
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

  if (!supported) {
    return (
      <span title="Voice input is not supported in this browser" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300">
        <MicOff size={14} />
      </span>
    )
  }

  const label =
    state === 'listening' ? (interim ? `“${interim}” — tap to send` : 'Listening… tap to stop')
      : state === 'transcribing' ? 'Transcribing…'
      : state === 'thinking' ? 'Agent is replying — tap to interrupt and speak'
      : state === 'speaking' ? 'Speaking — tap (or just talk in hands-free) to interrupt'
      : 'Voice input'

  const ttsTooltip = !hasNeuralTtsKey
    ? 'Voice is off by default — click to pick a Fish Audio voice in Settings'
    : ttsEnabled
      ? 'Spoken replies on — click to mute'
      : 'Spoken replies muted — click to enable'

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => void handleToggleTts()}
        title={ttsTooltip}
        aria-label={ttsTooltip}
        className={clsx(
          'inline-flex h-8 w-8 items-center justify-center rounded-full transition',
          ttsEnabled && hasNeuralTtsKey
            ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300'
            : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-600 dark:hover:bg-[#232837]',
        )}
      >
        {state === 'speaking' ? <Square size={13} /> : ttsEnabled && hasNeuralTtsKey ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </button>
      <button
        type="button"
        onClick={toggleHandsFree}
        title={handsFree ? 'Conversation mode on (auto-listen + barge-in)' : 'Conversation mode off'}
        aria-label="Toggle conversation mode"
        className={clsx(
          'rounded-full px-2 py-1 text-[10px] font-semibold transition',
          handsFree
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-400 hover:text-slate-600 dark:bg-[#232837] dark:text-slate-500',
        )}
      >
        HF
      </button>
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
            : state === 'speaking'
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
  )
}
