'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import clsx from 'clsx'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { speak as speakNeural, stopSpeaking, voiceEnabled, setVoiceEnabled } from '@/lib/voice'

type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking'

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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Failed to read audio blob'))
    reader.readAsDataURL(blob)
  })
}

export function WebRtcVoiceControls() {
  const router = useRouter()
  const [state, setState] = useState<VoiceState>('idle')
  const [handsFree, setHandsFree] = useState(false)
  // Strictly OFF by default — users must opt in and configure Fish Audio 2.0 / ElevenLabs in Settings -> Voice
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [hasNeuralTtsKey, setHasNeuralTtsKey] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(true)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const lastSpokenMessageIdRef = useRef<string | null>(null)
  const wasStreamingRef = useRef(false)
  const ttsEnabledRef = useRef(ttsEnabled)
  const handsFreeRef = useRef(handsFree)
  ttsEnabledRef.current = ttsEnabled
  handsFreeRef.current = handsFree

  const isStreaming = useChatStore((s) => s.isStreaming)
  const messages = useChatStore((s) => s.messages)
  const sendMessage = useChatStore((s) => s.sendMessage)

  const checkNeuralConfig = useCallback(async () => {
    try {
      const cfg = await sdk.life.ttsGetConfig()
      const configured = Boolean(
        cfg.hasFishKey || cfg.envFish || cfg.hasElevenlabsKey || cfg.envElevenlabs,
      )
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
    setSupported(Boolean(getSpeechRecognitionCtor()) || typeof MediaRecorder !== 'undefined')
    void checkNeuralConfig()
    const syncVoice = () => {
      void checkNeuralConfig()
    }
    window.addEventListener('openagents:voice-settings-changed', syncVoice)
    return () => window.removeEventListener('openagents:voice-settings-changed', syncVoice)
  }, [checkNeuralConfig])

  const speak = useCallback((text: string) => {
    void speakNeural(text, {
      onStart: () => setState('speaking'),
      onEnd: () => setState('idle'),
      onError: () => setState('idle'),
    })
  }, [])

  // Neural TTS readback (Fish Audio 2.0 / ElevenLabs ONLY — never robotic browser speechSynthesis)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      const lastAgent = [...messages].reverse().find((m) => m.role === 'agent' && m.status === 'done')
      if (lastAgent && lastAgent.id !== lastSpokenMessageIdRef.current) {
        lastSpokenMessageIdRef.current = lastAgent.id
        if (ttsEnabledRef.current && hasNeuralTtsKey) {
          speak(lastAgent.content)
        }
      }
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming, messages, speak, hasNeuralTtsKey])

  const stopAll = useCallback(() => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    mediaRecorderRef.current = null
    stopSpeaking()
    setState('idle')
  }, [])

  const startBrowserRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return false
    const recognition = new Ctor()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript ?? '').trim()
      if (transcript) void sendMessage(transcript)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setState((prev) => (prev === 'listening' ? 'idle' : prev))
    }
    recognition.onerror = () => {
      recognitionRef.current = null
      setState('idle')
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setState('listening')
      return true
    } catch {
      return false
    }
  }, [sendMessage])

  const startRecorderFallback = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          const audioBase64 = await blobToBase64(blob)
          setState('transcribing')
          const result = await sdk.nanobot.transcribeVoice({ audioBase64, locale: 'en-US' })
          if (result.transcript) void sendMessage(result.transcript)
        } catch (err: any) {
          setError(err?.message ?? 'Transcription failed')
        } finally {
          setState('idle')
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setState('listening')
      window.setTimeout(() => {
        if (mediaRecorderRef.current === recorder && recorder.state === 'recording') recorder.stop()
      }, 8000)
    } catch {
      setError('Microphone access denied')
      setState('idle')
    }
  }, [sendMessage])

  async function handleToggleTts() {
    if (state === 'speaking') {
      stopAll()
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

  async function toggleListening() {
    setError('')
    if (state === 'listening') {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      } else {
        stopAll()
      }
      return
    }
    if (state === 'speaking') {
      stopAll()
      return
    }
    if (startBrowserRecognition()) return
    await startRecorderFallback()
  }

  useEffect(() => {
    if (!handsFree || state !== 'idle' || isStreaming) return
    const timer = window.setTimeout(() => {
      if (handsFreeRef.current && !useChatStore.getState().isStreaming) {
        startBrowserRecognition()
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [handsFree, state, isStreaming, startBrowserRecognition])

  useEffect(() => () => stopAll(), [stopAll])

  if (!supported) {
    return (
      <span title="Voice input is not supported in this browser" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300">
        <MicOff size={14} />
      </span>
    )
  }

  const label =
    state === 'listening' ? 'Listening… tap to stop'
      : state === 'transcribing' ? 'Transcribing…'
      : state === 'speaking' ? 'Speaking — tap to stop'
      : 'Voice input'

  const ttsTooltip = !hasNeuralTtsKey
    ? 'Voice off by default — click to configure Fish Audio 2.0 (American voices) in Settings'
    : ttsEnabled
      ? 'Fish Audio / Neural voice enabled — click to mute'
      : 'Neural voice muted — click to enable spoken replies'

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
        {ttsEnabled && hasNeuralTtsKey ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </button>
      <button
        type="button"
        onClick={() => setHandsFree((v) => !v)}
        title={handsFree ? 'Hands-free mode on' : 'Hands-free mode off'}
        aria-label="Toggle hands-free mode"
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
        onClick={() => void toggleListening()}
        title={label}
        aria-label={label}
        className={clsx(
          'inline-flex h-8 w-8 items-center justify-center rounded-full border transition',
          state === 'listening'
            ? 'border-rose-300 bg-rose-500 text-white animate-pulse'
            : state === 'transcribing'
            ? 'border-amber-300 bg-amber-100 text-amber-800'
            : state === 'speaking'
            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
            : 'border-[#e4e7ec] bg-white text-[#475467] hover:bg-[#f1f3f7] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#a1a1aa]',
        )}
      >
        <Mic size={14} />
      </button>
      {error && <span className="ml-1 text-[10px] text-rose-500">{error}</span>}
    </div>
  )
}
