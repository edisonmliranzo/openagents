'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square, Upload } from 'lucide-react'
import { sdk } from '@/stores/auth'

const MAX_SECONDS = 30

function errMsg(e: unknown, fallback: string) {
  const raw = String((e as any)?.message ?? '')
  try {
    return JSON.parse(raw)?.message || fallback
  } catch {
    return raw && !raw.startsWith('<') && raw.length < 240 ? raw : fallback
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

interface VoiceCloneCardProps {
  avatarName: string
  hasFishKey: boolean
  hasElevenlabsKey: boolean
  /** Called with the new cloned voice so the parent can assign it to the avatar. */
  onCloned: (voice: { provider: string; voiceId: string; name: string }) => Promise<void> | void
}

/** Record (≤30s) or upload a voice sample and clone it with the user's own Fish Audio / ElevenLabs key. */
export function VoiceCloneCard({ avatarName, hasFishKey, hasElevenlabsKey, onCloned }: VoiceCloneCardProps) {
  const [consent, setConsent] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [sample, setSample] = useState<Blob | null>(null)
  const [sampleUrl, setSampleUrl] = useState<string | null>(null)
  const [provider, setProvider] = useState<'fish' | 'elevenlabs'>(hasFishKey ? 'fish' : 'elevenlabs')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      recRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    if (!sample) {
      setSampleUrl(null)
      return
    }
    const u = URL.createObjectURL(sample)
    setSampleUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [sample])

  async function startRecording() {
    setError(null)
    setDone(null)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Recording is not supported in this browser — upload an audio file instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (timerRef.current) clearInterval(timerRef.current)
        setRecording(false)
        setSample(new Blob(chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] }))
      }
      recRef.current = rec
      rec.start(250)
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS && rec.state === 'recording') rec.stop()
          return s + 1
        })
      }, 1000)
    } catch {
      setError('Microphone permission was denied.')
    }
  }

  function stopRecording() {
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }

  async function clone() {
    if (!sample) return
    if (!consent) {
      setError('Please confirm the consent checkbox first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const audioBase64 = await blobToBase64(sample)
      const name = `${avatarName} voice`
      const out = await sdk.life.ttsClone({ name, audioBase64, mimeType: sample.type || 'audio/webm', consent: true, provider })
      await onCloned({ provider: out.provider, voiceId: out.voiceId, name: out.name || name })
      setDone(`Voice cloned with ${out.provider === 'fish' ? 'Fish Audio' : 'ElevenLabs'} and set as ${avatarName}'s voice.`)
      setSample(null)
    } catch (e) {
      setError(errMsg(e, 'Voice cloning failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-800">Clone your voice</p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Read naturally for about 30 seconds in a quiet room. The sample is sent to your own provider account and stored there as a private voice.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 text-xs font-bold text-white disabled:opacity-50"
          >
            <Mic size={14} /> Record your voice (30s)
          </button>
        ) : (
          <button type="button" onClick={stopRecording} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-bold text-white">
            <Square size={12} className="animate-pulse text-rose-400" /> Stop · {seconds}s / {MAX_SECONDS}s
          </button>
        )}
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">
          <Upload size={13} /> Upload audio
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setSample(f)
                setDone(null)
                setError(null)
              }
              e.target.value = ''
            }}
          />
        </label>
        {hasFishKey && hasElevenlabsKey && (
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as 'fish' | 'elevenlabs')}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
          >
            <option value="fish">Fish Audio</option>
            <option value="elevenlabs">ElevenLabs</option>
          </select>
        )}
      </div>
      {sampleUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <audio src={sampleUrl} controls className="h-9 max-w-full" />
          <button
            type="button"
            onClick={() => void clone()}
            disabled={busy || !consent}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy && <Loader2 size={13} className="animate-spin" />} Clone &amp; use this voice
          </button>
        </div>
      )}
      <label className="mt-3 flex items-start gap-2 text-[11px] text-slate-600">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>This is my own voice, or I have explicit permission from the speaker to clone it.</span>
      </label>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      {done && <p className="mt-2 text-[11px] text-emerald-600">{done}</p>}
    </div>
  )
}

export default VoiceCloneCard
