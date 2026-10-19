'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { stopSpeaking, synthesize, takeSentences } from '@/lib/voice'

/**
 * Real-time voice conversation for OpenAgents (browser pipeline):
 *   mic -> Web Speech API (fallback: MediaRecorder -> /nanobot/voice/transcribe)
 *   -> chat store sendMessage (streamed agent reply)
 *   -> sentence-chunked neural TTS (user's Fish Audio / ElevenLabs voice)
 *   -> ordered playback with barge-in (user speech stops playback).
 *
 * Voice output is OFF unless `ttsEnabled` is true; callers gate that on the
 * user having opted in from Settings -> Voice.
 */

export type VoiceConversationState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

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

/** Speakable prefix of a streaming reply: closed code blocks collapsed, open fence cut. */
function speakablePrefix(content: string): string {
  let text = content.replace(/```[\s\S]*?```/g, ' Code block omitted. ')
  const open = text.indexOf('```')
  if (open >= 0) text = text.slice(0, open)
  return text
}

export interface UseVoiceConversationOptions {
  /** Speak agent replies with the configured neural voice. */
  ttsEnabled: boolean
  /** Auto-listen again after each reply finishes (conversation mode). */
  handsFree: boolean
  locale?: string
}

export function useVoiceConversation({ ttsEnabled, handsFree, locale = 'en-US' }: UseVoiceConversationOptions) {
  const [state, setState] = useState<VoiceConversationState>('idle')
  const [error, setError] = useState('')
  const [interim, setInterim] = useState('')
  const [supported, setSupported] = useState(true)

  const sendMessage = useChatStore((s) => s.sendMessage)
  const isStreaming = useChatStore((s) => s.isStreaming)

  const ttsRef = useRef(ttsEnabled)
  const handsFreeRef = useRef(handsFree)
  ttsRef.current = ttsEnabled
  handsFreeRef.current = handsFree

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const bargeRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)

  // Playback queue: each item is a pending synth promise so synthesis runs ahead of playback.
  const queueRef = useRef<Array<Promise<string | null>>>([])
  const playingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const generationRef = useRef(0)

  // Streaming reply tracking
  const replyIdRef = useRef<string | null>(null)
  const offsetRef = useRef(0)
  const bufferRef = useRef('')
  const spokenIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()) || typeof MediaRecorder !== 'undefined')
  }, [])

  const stopBargeIn = useCallback(() => {
    const r = bargeRecognitionRef.current
    bargeRecognitionRef.current = null
    if (r) {
      r.onresult = null
      r.onend = null
      r.onerror = null
      try { r.abort() } catch { /* ignore */ }
    }
  }, [])

  /** Stop all audio and drop queued sentences (barge-in / stop button). */
  const stopPlayback = useCallback(() => {
    generationRef.current += 1
    queueRef.current = []
    playingRef.current = false
    bufferRef.current = ''
    if (replyIdRef.current) spokenIdsRef.current.add(replyIdRef.current)
    replyIdRef.current = null
    const a = audioRef.current
    audioRef.current = null
    if (a) {
      try { a.pause() } catch { /* ignore */ }
    }
    stopSpeaking()
    stopBargeIn()
  }, [stopBargeIn])

  const submitTranscript = useCallback(
    (text: string) => {
      const t = text.trim()
      setInterim('')
      if (!t) return
      setState('thinking')
      void sendMessage(t).catch((err: any) => {
        setError(err?.message ?? 'Failed to send message')
        setState('idle')
      })
    },
    [sendMessage],
  )

  /** While the agent talks, listen for the user; any speech interrupts playback. */
  const startBargeIn = useCallback(() => {
    if (bargeRecognitionRef.current || !handsFreeRef.current) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    const r = new Ctor()
    r.lang = locale
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (event: any) => {
      let finalText = ''
      let heard = ''
      for (let i = event.resultIndex ?? 0; i < (event.results?.length ?? 0); i++) {
        const res = event.results[i]
        const txt = String(res?.[0]?.transcript ?? '')
        heard += txt
        if (res?.isFinal) finalText += txt
      }
      // Require a few characters so speaker echo / clicks don't cut the agent off.
      if (heard.trim().length < 3) return
      if (playingRef.current || queueRef.current.length) stopPlayback()
      setState('listening')
      setInterim(heard.trim())
      if (finalText.trim()) submitTranscript(finalText)
    }
    r.onend = () => {
      if (bargeRecognitionRef.current === r) bargeRecognitionRef.current = null
    }
    r.onerror = () => {
      if (bargeRecognitionRef.current === r) bargeRecognitionRef.current = null
    }
    bargeRecognitionRef.current = r
    try { r.start() } catch { bargeRecognitionRef.current = null }
  }, [locale, stopPlayback, submitTranscript])

  const pump = useCallback(async () => {
    if (playingRef.current) return
    const gen = generationRef.current
    playingRef.current = true
    while (queueRef.current.length && gen === generationRef.current) {
      const next = queueRef.current.shift()!
      let url: string | null = null
      try {
        url = await next
      } catch (err: any) {
        setError(String(err?.message ?? 'Voice synthesis failed').slice(0, 160))
        continue
      }
      if (!url || gen !== generationRef.current) continue
      setState('speaking')
      startBargeIn()
      await new Promise<void>((resolve) => {
        const audio = new Audio(url!)
        audioRef.current = audio
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.onpause = () => resolve()
        audio.play().catch(() => resolve())
      })
    }
    if (gen === generationRef.current) {
      playingRef.current = false
      audioRef.current = null
      if (!useChatStore.getState().isStreaming) {
        stopBargeIn()
        setState((s) => (s === 'speaking' || s === 'thinking' ? 'idle' : s))
      }
    }
  }, [startBargeIn, stopBargeIn])

  const enqueue = useCallback(
    (sentences: string[]) => {
      if (!sentences.length) return
      for (const s of sentences) {
        const p = synthesize(s)
        p.catch(() => undefined) // surfaced in pump
        queueRef.current.push(p)
      }
      void pump()
    },
    [pump],
  )

  // Follow the streaming agent reply and feed complete sentences to TTS.
  useEffect(() => {
    const unsub = useChatStore.subscribe((s) => {
      if (!ttsRef.current) return
      const last = [...s.messages].reverse().find((m) => m.role === 'agent')
      if (!last || spokenIdsRef.current.has(last.id)) return
      if (replyIdRef.current !== last.id) {
        if (!s.isStreaming && last.status === 'done') return // historical message, don't read
        replyIdRef.current = last.id
        offsetRef.current = 0
        bufferRef.current = ''
      }
      const done = !s.isStreaming || last.status === 'done'
      const prefix = done ? String(last.content ?? '').replace(/```[\s\S]*?(```|$)/g, ' Code block omitted. ') : speakablePrefix(String(last.content ?? ''))
      if (prefix.length > offsetRef.current) {
        bufferRef.current += prefix.slice(offsetRef.current)
        offsetRef.current = prefix.length
      }
      const { sentences, rest } = takeSentences(bufferRef.current, done)
      bufferRef.current = rest
      enqueue(sentences)
      if (done) {
        spokenIdsRef.current.add(last.id)
        replyIdRef.current = null
        if (spokenIdsRef.current.size > 200) spokenIdsRef.current = new Set([last.id])
      }
    })
    return unsub
  }, [enqueue])

  const startRecognition = useCallback((): boolean => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return false
    const r = new Ctor()
    r.lang = locale
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 1
    let finalText = ''
    r.onresult = (event: any) => {
      let heard = ''
      for (let i = 0; i < (event.results?.length ?? 0); i++) {
        const res = event.results[i]
        const txt = String(res?.[0]?.transcript ?? '')
        heard += txt
        if (res?.isFinal) finalText = heard
      }
      setInterim(heard.trim())
    }
    r.onend = () => {
      if (recognitionRef.current === r) recognitionRef.current = null
      if (finalText.trim()) submitTranscript(finalText)
      else setState((s) => (s === 'listening' ? 'idle' : s))
    }
    r.onerror = (event: any) => {
      if (recognitionRef.current === r) recognitionRef.current = null
      const code = String(event?.error ?? '')
      if (code && code !== 'no-speech' && code !== 'aborted') setError(`Speech recognition: ${code}`)
      setState('idle')
    }
    recognitionRef.current = r
    try {
      r.start()
      setState('listening')
      return true
    } catch {
      recognitionRef.current = null
      return false
    }
  }, [locale, submitTranscript])

  const startRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (recorderRef.current === recorder) recorderRef.current = null
        try {
          setState('transcribing')
          const audioBase64 = await blobToBase64(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
          const result = await sdk.nanobot.transcribeVoice({ audioBase64, locale })
          if (result.transcript) submitTranscript(result.transcript)
          else setState('idle')
        } catch (err: any) {
          setError(err?.message ?? 'Transcription failed')
          setState('idle')
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setState('listening')
      window.setTimeout(() => {
        if (recorderRef.current === recorder && recorder.state === 'recording') recorder.stop()
      }, 10_000)
    } catch {
      setError('Microphone access denied')
      setState('idle')
    }
  }, [locale, submitTranscript])

  const startListening = useCallback(async () => {
    setError('')
    stopPlayback()
    if (startRecognition()) return
    await startRecorder()
  }, [startRecognition, startRecorder, stopPlayback])

  const stopListening = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
      return
    }
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
  }, [])

  const stopAll = useCallback(() => {
    const r = recognitionRef.current
    recognitionRef.current = null
    if (r) {
      r.onend = null
      try { r.abort() } catch { /* ignore */ }
    }
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null
      recorderRef.current.stream.getTracks().forEach((t) => t.stop())
      recorderRef.current.stop()
    }
    recorderRef.current = null
    stopPlayback()
    setInterim('')
    setState('idle')
  }, [stopPlayback])

  // Reflect agent streaming state in the UI.
  useEffect(() => {
    if (isStreaming) setState((s) => (s === 'idle' || s === 'transcribing' ? 'thinking' : s))
    else if (!playingRef.current && !queueRef.current.length) setState((s) => (s === 'thinking' ? 'idle' : s))
  }, [isStreaming])

  // Hands-free: re-open the mic once the agent has finished talking.
  useEffect(() => {
    if (!handsFree || state !== 'idle' || isStreaming) return
    const timer = window.setTimeout(() => {
      if (handsFreeRef.current && !useChatStore.getState().isStreaming && !playingRef.current) startRecognition()
    }, 400)
    return () => window.clearTimeout(timer)
  }, [handsFree, state, isStreaming, startRecognition])

  // Muting TTS mid-reply stops playback immediately.
  useEffect(() => {
    if (!ttsEnabled) stopPlayback()
  }, [ttsEnabled, stopPlayback])

  useEffect(() => () => stopAll(), [stopAll])

  return { state, error, interim, supported, startListening, stopListening, stopPlayback, stopAll, setError }
}
