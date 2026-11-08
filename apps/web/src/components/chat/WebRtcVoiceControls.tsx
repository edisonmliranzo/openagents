'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react'
import clsx from 'clsx'
import { sdk } from '@/stores/auth'
import { stopSpeaking, voiceEnabled, setVoiceEnabled } from '@/lib/voice'
import { useVoiceConversation } from '@/lib/useVoiceConversation'

export function WebRtcVoiceControls() {
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [hasNeuralTtsKey, setHasNeuralTtsKey] = useState<boolean | null>(null)

  const voice = useVoiceConversation({
    ttsEnabled,
    handsFree: false,
  })
  const { state, error, interim, supported } = voice

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

  const isSpeakingNow = state === 'speaking'

  function handleToggleTts() {
    if (isSpeakingNow) {
      voice.stopPlayback()
      stopSpeaking()
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
      stopSpeaking()
      void voice.startListening()
      return
    }
    if (state === 'transcribing') return
    void voice.startListening()
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
            ? 'Speaking — tap to interrupt'
            : 'Voice input'

  const ttsTooltip = ttsEnabled
    ? `Spoken replies ON (${hasNeuralTtsKey ? 'Neural TTS' : 'Browser Voice'}) — click to mute`
    : 'Enable spoken replies'

  return (
    <div className="flex items-center gap-1.5">
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
  )
}
