'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { Loader2, Mic, Save, Volume2 } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const ghostBtn = 'h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--tone-strong)] transition hover:bg-[var(--surface-muted)]'

interface TtsConfigView {
  provider: string | null
  elevenlabsVoice: string
  fishVoice: string
  hasElevenlabsKey: boolean
  hasFishKey: boolean
  envElevenlabs: boolean
  envFish: boolean
}

export default function VoiceSettingsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [cfg, setCfg] = useState<TtsConfigView | null>(null)
  const [provider, setProvider] = useState('')
  const [elKey, setElKey] = useState('')
  const [elVoice, setElVoice] = useState('')
  const [fishKey, setFishKey] = useState('')
  const [fishVoice, setFishVoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [voices, setVoices] = useState<Array<{ id: string; name: string; provider: string }>>([])

  const load = useCallback(async () => {
    try {
      const view = await sdk.life.ttsGetConfig()
      setCfg(view)
      setProvider(view.provider ?? '')
      setElVoice(view.elevenlabsVoice)
      setFishVoice(view.fishVoice)
      const list = await sdk.life.ttsVoices().catch(() => [])
      setVoices(list)
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'Failed to load voice settings'))
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setBusy(true)
    try {
      await sdk.life.ttsSetConfig({
        provider: provider as 'elevenlabs' | 'fish' | '',
        elevenlabsKey: elKey ? elKey : undefined,
        elevenlabsVoice: elVoice,
        fishKey: fishKey ? fishKey : undefined,
        fishVoice: fishVoice,
      })
      addToast('success', 'Voice settings saved')
      setElKey('')
      setFishKey('')
      await load()
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'Save failed').slice(0, 200))
    } finally {
      setBusy(false)
    }
  }

  async function clearKey(which: 'elevenlabs' | 'fish') {
    setBusy(true)
    try {
      await sdk.life.ttsSetConfig(which === 'elevenlabs' ? { elevenlabsKey: null } : { fishKey: null })
      addToast('success', 'Key removed')
      await load()
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'Failed'))
    } finally {
      setBusy(false)
    }
  }

  async function testVoice() {
    setTesting(true)
    try {
      const res = await sdk.life.tts('Hi! This is your OpenAgents assistant speaking with a natural human voice.')
      const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`)
      await audio.play()
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'TTS failed — check your key').slice(0, 220))
    } finally {
      setTesting(false)
    }
  }

  const elVoices = voices.filter((v) => v.provider === 'elevenlabs')
  const fishVoices = voices.filter((v) => v.provider === 'fish')

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-24 md:p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Mic size={15} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--tone-strong)]">Voice</h1>
          <p className="text-xs text-[var(--muted)]">Realistic text-to-speech for chat replies and briefings. Keys are encrypted and stored for your account only.</p>
        </div>
      </div>

      <section className="oa-float-card space-y-4 p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--tone-strong)]">Provider</label>
          <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Auto (first key found)</option>
            <option value="elevenlabs">ElevenLabs — most realistic</option>
            <option value="fish">Fish Audio — fast voice cloning</option>
          </select>
        </div>

        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--tone-strong)]">ElevenLabs</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg?.hasElevenlabsKey || cfg?.envElevenlabs ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
              {cfg?.hasElevenlabsKey ? 'key saved' : cfg?.envElevenlabs ? 'key from .env' : 'not configured'}
            </span>
          </div>
          <label className="mb-1 block text-xs text-[var(--muted)]">API key (xi-api-key from elevenlabs.io → Profile → API Keys)</label>
          <input
            className={inputCls}
            type="password"
            placeholder={cfg?.hasElevenlabsKey ? '•••••••• (saved — paste to replace)' : 'sk_...'}
            value={elKey}
            onChange={(e) => setElKey(e.target.value)}
          />
          <label className="mb-1 mt-3 block text-xs text-[var(--muted)]">Voice ID (leave empty for the default voice)</label>
          <input className={inputCls} placeholder="21m00Tcm4TlvDq8ikWAM" value={elVoice} onChange={(e) => setElVoice(e.target.value)} />
          {elVoices.length > 0 && (
            <select className={`${inputCls} mt-2`} value={elVoice} onChange={(e) => setElVoice(e.target.value)}>
              <option value="">— pick a voice —</option>
              {elVoices.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}
          {cfg?.hasElevenlabsKey && (
            <button type="button" className={`${ghostBtn} mt-2`} disabled={busy} onClick={() => void clearKey('elevenlabs')}>
              Remove saved key
            </button>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--tone-strong)]">Fish Audio</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg?.hasFishKey || cfg?.envFish ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
              {cfg?.hasFishKey ? 'key saved' : cfg?.envFish ? 'key from .env' : 'not configured'}
            </span>
          </div>
          <label className="mb-1 block text-xs text-[var(--muted)]">API key (fish.audio → API)</label>
          <input
            className={inputCls}
            type="password"
            placeholder={cfg?.hasFishKey ? '•••••••• (saved — paste to replace)' : 'fish api key'}
            value={fishKey}
            onChange={(e) => setFishKey(e.target.value)}
          />
          <label className="mb-1 mt-3 block text-xs text-[var(--muted)]">Reference ID (voice/model id from fish.audio library)</label>
          <input className={inputCls} placeholder="Voice model id" value={fishVoice} onChange={(e) => setFishVoice(e.target.value)} />
          {fishVoices.length > 0 && (
            <select className={`${inputCls} mt-2`} value={fishVoice} onChange={(e) => setFishVoice(e.target.value)}>
              <option value="">— pick a voice —</option>
              {fishVoices.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}
          {cfg?.hasFishKey && (
            <button type="button" className={`${ghostBtn} mt-2`} disabled={busy} onClick={() => void clearKey('fish')}>
              Remove saved key
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnCls} disabled={busy} onClick={() => void save()}>
            <span className="inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</span>
          </button>
          <button type="button" className={ghostBtn} disabled={testing} onClick={() => void testVoice()}>
            <span className="inline-flex items-center gap-1.5">{testing ? <Loader2 size={13} className="animate-spin" /> : <Volume2 size={13} />} Test voice</span>
          </button>
        </div>

        <p className="text-xs text-[var(--muted)]">
          Without a key, chat replies use your browser's built-in voice. With a key they sound human. Keys are AES-256 encrypted before storage.
        </p>
      </section>
    </div>
  )
}
