'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { Loader2, Mic, Save, Volume2, VolumeX, CheckCircle2, Sparkles } from 'lucide-react'
import { voiceEnabled, setVoiceEnabled } from '@/lib/voice'

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

const AMERICAN_FISH_PRESETS = [
  {
    id: 'us-preset-madison',
    name: 'Madison',
    accent: 'American Female • Warm & Natural (Veda)',
    desc: 'Conversational, warm US English voice ideal for daily assistance.',
  },
  {
    id: 'us-preset-claire',
    name: 'Claire',
    accent: 'American Female • Calm & Thoughtful (Nova)',
    desc: 'Soft, composed US English voice great for reading and planning.',
  },
  {
    id: 'us-preset-ethan',
    name: 'Ethan',
    accent: 'American Male • Direct & Analytical (Atlas)',
    desc: 'Crisp, fast-paced US English voice suited for code & tasks.',
  },
  {
    id: 'us-preset-marcus',
    name: 'Marcus',
    accent: 'American Male • Deep Executive Briefing',
    desc: 'Studio-quality American broadcast tone for morning briefings.',
  },
  {
    id: 'us-preset-sophia',
    name: 'Sophia',
    accent: 'American Female • Crisp & Energetic',
    desc: 'Bright, articulate American voice for quick updates and summaries.',
  },
]

export default function VoiceSettingsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [cfg, setCfg] = useState<TtsConfigView | null>(null)
  const [provider, setProvider] = useState('fish')
  const [spokenRepliesOn, setSpokenRepliesOn] = useState(false)
  const [elKey, setElKey] = useState('')
  const [elKeyDirty, setElKeyDirty] = useState(false)
  const [elVoice, setElVoice] = useState('')
  const [fishKey, setFishKey] = useState('')
  const [fishKeyDirty, setFishKeyDirty] = useState(false)
  const [fishVoice, setFishVoice] = useState('us-preset-madison')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [voices, setVoices] = useState<Array<{ id: string; name: string; provider: string }>>([])

  const load = useCallback(async () => {
    try {
      setSpokenRepliesOn(voiceEnabled())
      const view = await sdk.life.ttsGetConfig()
      setCfg(view)
      setProvider(view.provider || 'fish')
      setElVoice(view.elevenlabsVoice)
      setFishVoice(view.fishVoice || 'us-preset-madison')
      const list = await sdk.life.ttsVoices().catch(() => [])
      setVoices(list)
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'Failed to load voice settings'))
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  function handleToggleSpokenReplies(next: boolean) {
    setSpokenRepliesOn(next)
    setVoiceEnabled(next)
    addToast(
      'success',
      next
        ? 'Spoken replies enabled for chat (using your configured neural voice)'
        : 'Spoken replies turned off (default)',
    )
  }

  async function save() {
    setBusy(true)
    try {
      const problems: string[] = []
      try {
        await sdk.life.ttsSetConfig({
          provider: (provider || 'fish') as 'elevenlabs' | 'fish' | '',
          elevenlabsVoice: elVoice,
          fishVoice: fishVoice || 'us-preset-madison',
        })
      } catch (err: any) {
        problems.push(String(err?.message ?? 'settings save failed').slice(0, 160))
      }
      if (fishKeyDirty && fishKey.trim()) {
        try {
          await sdk.life.ttsSetConfig({ fishKey: fishKey.trim() })
          setFishKey('')
          setFishKeyDirty(false)
        } catch (err: any) {
          problems.push(`Fish Audio 2.0 key: ${String(err?.message ?? 'rejected').slice(0, 160)}`)
        }
      }
      if (elKeyDirty && elKey.trim()) {
        try {
          await sdk.life.ttsSetConfig({ elevenlabsKey: elKey.trim() })
          setElKey('')
          setElKeyDirty(false)
        } catch (err: any) {
          problems.push(`ElevenLabs key: ${String(err?.message ?? 'rejected').slice(0, 160)}`)
        }
      }
      if (problems.length) {
        addToast('error', problems.join(' · '))
      } else {
        addToast('success', 'Voice settings saved')
      }
      await load()
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
      const res = await sdk.life.tts(
        'Hi! This is your OpenAgents personal assistant speaking with Fish Audio 2.0 natural American voice.',
        {
          provider: provider || 'fish',
          voiceId: (provider || 'fish') === 'fish' ? fishVoice : elVoice,
        },
      )
      const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`)
      await audio.play()
    } catch (err: any) {
      addToast('error', String(err?.message ?? 'TTS failed — add your Fish Audio 2.0 API key first').slice(0, 220))
    } finally {
      setTesting(false)
    }
  }

  const elVoices = voices.filter((v) => v.provider === 'elevenlabs')
  const fishVoices = voices.filter((v) => v.provider === 'fish')
  const hasAnyKey = Boolean(
    cfg?.hasFishKey || cfg?.envFish || cfg?.hasElevenlabsKey || cfg?.envElevenlabs,
  )

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-24 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm">
            <Mic size={16} />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--tone-strong)]">
              Voice & Fish Audio 2.0
            </h1>
            <p className="text-xs text-[var(--muted)]">
              Opt-in realistic American neural voices. Robotic browser voices are permanently disabled.
            </p>
          </div>
        </div>
      </div>

      {/* Default-Off Opt-In Control */}
      <section className="oa-float-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="max-w-md">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--tone-strong)]">
              Spoken Replies in Chat
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                spokenRepliesOn && hasAnyKey
                  ? 'bg-emerald-500/15 text-emerald-700'
                  : 'bg-slate-200/80 text-slate-600'
              }`}
            >
              {spokenRepliesOn && hasAnyKey ? 'Enabled' : 'Off by Default'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Voice is strictly opt-in and off by default. Add your Fish Audio 2.0 API key below, pick an American voice, and toggle this on when you want spoken replies.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleToggleSpokenReplies(!spokenRepliesOn)}
          disabled={!hasAnyKey && !spokenRepliesOn}
          title={
            !hasAnyKey
              ? 'Save a Fish Audio 2.0 or ElevenLabs key below first'
              : 'Toggle spoken replies'
          }
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
            spokenRepliesOn && hasAnyKey
              ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
              : 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--tone-strong)] hover:opacity-90 disabled:opacity-50'
          }`}
        >
          {spokenRepliesOn && hasAnyKey ? (
            <>
              <Volume2 size={14} /> Spoken Replies On
            </>
          ) : (
            <>
              <VolumeX size={14} /> Off by Default
            </>
          )}
        </button>
      </section>

      <section className="oa-float-card space-y-5 p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--tone-strong)]">
            Active Neural Voice Engine
          </label>
          <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="fish">Fish Audio 2.0 (S1) — Free for Developers • American Voices</option>
            <option value="elevenlabs">ElevenLabs — Multilingual v2</option>
          </select>
        </div>

        {/* Fish Audio 2.0 Card (Primary) */}
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.03] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-rose-500" />
              <h3 className="text-sm font-bold text-[var(--tone-strong)]">
                Fish Audio 2.0 (Free Developer API)
              </h3>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                cfg?.hasFishKey || cfg?.envFish
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {cfg?.hasFishKey ? 'Key Saved' : cfg?.envFish ? 'Key from .env' : 'Add Key to Enable'}
            </span>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">
              Fish Audio 2.0 API Key (Get your free developer key at{' '}
              <a
                href="https://fish.audio"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-rose-500 underline"
              >
                fish.audio
              </a>{' '}
              → API)
            </label>
            <input
              className={inputCls}
              type="password"
              autoComplete="new-password"
              placeholder={
                cfg?.hasFishKey
                  ? '•••••••• (saved — paste a new key to replace)'
                  : 'Paste your Fish Audio 2.0 API key...'
              }
              value={fishKey}
              onChange={(e) => {
                setFishKey(e.target.value)
                setFishKeyDirty(true)
              }}
            />
          </div>

          {/* Curated American Voices Picker */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--tone-strong)]">
              Pick an American Voice (US English)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AMERICAN_FISH_PRESETS.map((preset) => {
                const selected = fishVoice === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setProvider('fish')
                      setFishVoice(preset.id)
                    }}
                    className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                      selected
                        ? 'border-rose-500 bg-rose-500/10 shadow-sm'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-rose-400/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--tone-strong)]">
                        🇺🇸 {preset.name}
                      </span>
                      {selected && <CheckCircle2 size={14} className="text-rose-500 shrink-0" />}
                    </div>
                    <span className="mt-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {preset.accent}
                    </span>
                    <span className="mt-1 text-[10px] text-[var(--muted)] leading-snug">
                      {preset.desc}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Fish Audio Reference ID or Library Dropdown */}
          <div className="pt-1">
            <label className="mb-1 block text-xs text-[var(--muted)]">
              Selected Voice Preset or Custom Fish Audio Reference ID
            </label>
            <input
              className={inputCls}
              placeholder="us-preset-madison or custom fish.audio model id"
              value={fishVoice}
              onChange={(e) => setFishVoice(e.target.value)}
            />
            {fishVoices.length > 0 && (
              <select
                className={`${inputCls} mt-2`}
                value={fishVoice}
                onChange={(e) => setFishVoice(e.target.value)}
              >
                <option value="">— Or choose from all available Fish Audio voices —</option>
                {fishVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {cfg?.hasFishKey && (
            <button
              type="button"
              className={ghostBtn}
              disabled={busy}
              onClick={() => void clearKey('fish')}
            >
              Remove saved Fish Audio key
            </button>
          )}
        </div>

        {/* Optional ElevenLabs Card */}
        <div className="rounded-2xl border border-[var(--border)] p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--tone-strong)]">
              ElevenLabs (Optional Alternative)
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                cfg?.hasElevenlabsKey || cfg?.envElevenlabs
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {cfg?.hasElevenlabsKey
                ? 'Key Saved'
                : cfg?.envElevenlabs
                  ? 'Key from .env'
                  : 'Not Configured'}
            </span>
          </div>
          <label className="mb-1 block text-xs text-[var(--muted)]">
            API Key (xi-api-key from elevenlabs.io)
          </label>
          <input
            className={inputCls}
            type="password"
            autoComplete="new-password"
            placeholder={cfg?.hasElevenlabsKey ? '•••••••• (saved — paste to replace)' : 'sk_...'}
            value={elKey}
            onChange={(e) => {
              setElKey(e.target.value)
              setElKeyDirty(true)
            }}
          />
          <label className="mb-1 mt-3 block text-xs text-[var(--muted)]">
            Voice ID (optional)
          </label>
          <input
            className={inputCls}
            placeholder="21m00Tcm4TlvDq8ikWAM (Rachel — American Female)"
            value={elVoice}
            onChange={(e) => setElVoice(e.target.value)}
          />
          {elVoices.length > 0 && (
            <select
              className={`${inputCls} mt-2`}
              value={elVoice}
              onChange={(e) => setElVoice(e.target.value)}
            >
              <option value="">— pick an ElevenLabs voice —</option>
              {elVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          {cfg?.hasElevenlabsKey && (
            <button
              type="button"
              className={`${ghostBtn} mt-2`}
              disabled={busy}
              onClick={() => void clearKey('elevenlabs')}
            >
              Remove saved ElevenLabs key
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnCls} disabled={busy} onClick={() => void save()}>
            <span className="inline-flex items-center gap-1.5">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Voice Settings
            </span>
          </button>
          <button
            type="button"
            className={ghostBtn}
            disabled={testing}
            onClick={() => void testVoice()}
          >
            <span className="inline-flex items-center gap-1.5">
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Volume2 size={13} />}{' '}
              Test American Voice
            </span>
          </button>
        </div>

        <p className="text-xs text-[var(--muted)]">
          Robotic browser speech is permanently disabled. Voice replies only play when you add your Fish Audio 2.0 (or ElevenLabs) API key and enable spoken replies above. All keys are AES-256 encrypted at rest.
        </p>
      </section>
    </div>
  )
}
