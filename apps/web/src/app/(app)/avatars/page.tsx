'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Camera, CheckCircle2, Film, Loader2, Mic, Play, Plus, Sparkles, Trash2, Upload, Wand2, XCircle } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { SharePanel } from '@/components/avatar/SharePanel'
import { VoiceCloneCard } from '@/components/avatar/VoiceCloneCard'
import { VariationCard } from '@/components/avatar/VariationCard'
import {
  RealisticAvatar,
  useAvatars,
  type AvatarCallState,
  type AvatarSlot,
  type RealisticAvatarRecord,
} from '@/components/avatar/RealisticAvatar'

const PRESETS = [
  { id: 'nova', name: 'Nova', description: 'Warm, upbeat and organized personal assistant.', src: '/avatars/presets/nova.jpg' },
  { id: 'atlas', name: 'Atlas', description: 'Calm, confident chief-of-staff who keeps you on track.', src: '/avatars/presets/atlas.jpg' },
  { id: 'sage', name: 'Sage', description: 'Thoughtful researcher who explains things clearly.', src: '/avatars/presets/sage.jpg' },
  { id: 'ember', name: 'Ember', description: 'Energetic creative partner for ideas and content.', src: '/avatars/presets/ember.jpg' },
]

const CLIP_SLOTS: Array<{ slot: AvatarSlot; label: string; hint: string }> = [
  { slot: 'idle', label: 'Idle', hint: 'Front view, calm, blinking' },
  { slot: 'listening', label: 'Listening', hint: '3/4 left angle, nodding' },
  { slot: 'thinking', label: 'Thinking', hint: 'Glances aside' },
  { slot: 'talking', label: 'Talking A', hint: 'Front close-up speaking' },
  { slot: 'talking_alt', label: 'Talking B', hint: '3/4 right angle speaking' },
]

function errMsg(e: unknown, fallback: string) {
  const raw = String((e as any)?.message ?? '')
  try {
    return JSON.parse(raw)?.message || fallback
  } catch {
    return raw && !raw.startsWith('<') && raw.length < 240 ? raw : fallback
  }
}

export default function AvatarStudioPage() {
  const { avatars, loaded, refresh, setAvatars } = useAvatars()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [likenessConsent, setLikenessConsent] = useState(false)
  const [previewState, setPreviewState] = useState<AvatarCallState>('idle')
  const [videoModel, setVideoModel] = useState('veo-3.1')

  // voice
  const [ttsCfg, setTtsCfg] = useState<{ hasFishKey: boolean; hasElevenlabsKey: boolean } | null>(null)
  const [voices, setVoices] = useState<Array<{ id: string; name: string; provider: string }>>([])

  const selected = useMemo(
    () => avatars.find((a) => a.id === selectedId) ?? avatars.find((a) => a.isActive) ?? avatars[0] ?? null,
    [avatars, selectedId],
  )

  const replace = useCallback(
    (a: RealisticAvatarRecord) => setAvatars((prev) => prev.map((x) => (x.id === a.id ? a : x))),
    [setAvatars],
  )

  // Load voice options
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await sdk.life.ttsGetConfig()
        setTtsCfg(cfg)
        const list: Array<{ id: string; name: string; provider: string }> = []
        if (cfg.hasElevenlabsKey) list.push(...(await sdk.life.ttsVoices().catch(() => [])))
        if (cfg.hasFishKey) {
          const fish = await sdk.life.ttsFishVoices().catch(() => null)
          if (fish) list.push(...[...fish.live, ...fish.curated].map((v) => ({ id: v.id, name: `${v.name}${v.source === 'mine' ? ' (yours)' : ''}`, provider: 'fish' })))
        }
        setVoices(list)
      } catch {
        setTtsCfg({ hasFishKey: false, hasElevenlabsKey: false })
      }
    })()
  }, [])

  // Poll generation jobs while any are running
  const running = useMemo(
    () => Boolean(selected && Object.values(selected.jobs || {}).some((j) => j && ['queued', 'processing', 'in_progress'].includes(j.status))),
    [selected],
  )
  useEffect(() => {
    if (!running || !selected) return
    const id = selected.id
    const t = setInterval(async () => {
      try {
        replace(await sdk.client.get<RealisticAvatarRecord>(`/api/v1/avatars/${id}/generate-status`))
      } catch {
        /* keep polling */
      }
    }, 8000)
    return () => clearInterval(t)
  }, [running, selected, replace])

  async function createFromBlob(name: string, description: string, blob: Blob, consent: '1' | 'preset' = '1') {
    setBusy('create')
    setError(null)
    try {
      const created = await sdk.client.post<RealisticAvatarRecord>('/api/v1/avatars', { name, description })
      const withPortrait = await sdk.client.upload<RealisticAvatarRecord>(
        `/api/v1/avatars/${created.id}/upload?slot=portrait&consent=${consent}`,
        blob,
        blob.type || 'image/jpeg',
      )
      await refresh()
      setSelectedId(withPortrait.id)
      setCreating(false)
      setNotice('Avatar created. Click "Generate all angles" to turn the photo into realistic video clips.')
    } catch (e) {
      setError(errMsg(e, 'Could not create avatar'))
    } finally {
      setBusy(null)
    }
  }

  async function createFromPreset(p: (typeof PRESETS)[number]) {
    const res = await fetch(p.src)
    const blob = await res.blob()
    await createFromBlob(p.name, p.description, blob, 'preset')
  }

  async function uploadSlot(slot: AvatarSlot, file: File) {
    if (!selected) return
    if (slot === 'portrait' && !likenessConsent) {
      setError('Please confirm you own this likeness or have permission before uploading a photo.')
      return
    }
    setBusy(`upload-${slot}`)
    setError(null)
    try {
      const consentQs = slot === 'portrait' ? '&consent=1' : ''
      replace(await sdk.client.upload<RealisticAvatarRecord>(`/api/v1/avatars/${selected.id}/upload?slot=${slot}${consentQs}`, file, file.type))
    } catch (e) {
      setError(errMsg(e, 'Upload failed'))
    } finally {
      setBusy(null)
    }
  }

  async function generate(slots?: AvatarSlot[]) {
    if (!selected) return
    setBusy('generate')
    setError(null)
    try {
      const updated = await sdk.client.post<RealisticAvatarRecord>(`/api/v1/avatars/${selected.id}/generate`, { slots, model: videoModel.trim() })
      replace(updated)
      const failed = Object.values(updated.jobs).filter((j) => j?.status === 'failed')
      if (failed.length > 0) setError(failed[0]?.error || 'Some clips failed to start.')
      else setNotice('Generating realistic clips with APIsRouter — this usually takes 1–5 minutes per angle. You can leave this page.')
    } catch (e) {
      setError(errMsg(e, 'Generation failed'))
    } finally {
      setBusy(null)
    }
  }

  async function activate() {
    if (!selected) return
    await sdk.client.post(`/api/v1/avatars/${selected.id}/activate`, {})
    await refresh()
    setNotice(`${selected.name} is now your avatar for voice calls.`)
  }

  async function remove() {
    if (!selected || !window.confirm(`Delete ${selected.name} and all its videos?`)) return
    await sdk.client.delete(`/api/v1/avatars/${selected.id}`)
    setSelectedId(null)
    await refresh()
  }

  async function saveVoice(voiceKey: string) {
    if (!selected) return
    const [provider, ...rest] = voiceKey.split(':')
    replace(
      await sdk.client.patch<RealisticAvatarRecord>(`/api/v1/avatars/${selected.id}`, {
        voiceProvider: provider || null,
        voiceId: rest.join(':') || null,
      }),
    )
  }

  const audioRef = useRef<HTMLAudioElement | null>(null)
  async function testVoice() {
    if (!selected) return
    setError(null)
    setPreviewState('thinking')
    try {
      const out = await sdk.life.tts(`Hi, I'm ${selected.name}. It's great to finally meet you face to face. What should we work on today?`, {
        provider: selected.voiceProvider || undefined,
        voiceId: selected.voiceId || undefined,
      })
      audioRef.current?.pause()
      const audio = new Audio(`data:${out.mimeType};base64,${out.audioBase64}`)
      audioRef.current = audio
      audio.onplay = () => setPreviewState('speaking')
      audio.onended = () => setPreviewState('idle')
      audio.onerror = () => setPreviewState('idle')
      await audio.play()
    } catch (e) {
      setPreviewState('idle')
      setError(errMsg(e, 'Add a Fish Audio or ElevenLabs key in Voice Settings first.'))
    }
  }

  const voiceKey = selected?.voiceProvider ? `${selected.voiceProvider}:${selected.voiceId ?? ''}` : ''
  const hasVoiceKey = Boolean(ttsCfg?.hasFishKey || ttsCfg?.hasElevenlabsKey)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-600">
            <Sparkles size={12} /> Avatar Studio
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Realistic Video Avatars</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Turn a photo into a lifelike multi-angle video avatar with your APIsRouter key, give it a Fish Audio or ElevenLabs voice, and talk to it on a live call.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/phone" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Start a call →
          </Link>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            <Plus size={15} /> New avatar
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> <span>{notice}</span>
        </div>
      )}

      {(creating || (loaded && avatars.length === 0)) && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Choose a starting face</h2>
          <p className="mt-1 text-sm text-slate-500">Pick a realistic preset or upload your own photo (clear, front-facing, good light).</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy === 'create'}
                onClick={() => void createFromPreset(p)}
                className="group overflow-hidden rounded-2xl border border-slate-200 text-left transition hover:border-rose-300 hover:shadow-md disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.name} className="aspect-[3/4] w-full object-cover transition group-hover:scale-[1.03]" />
                <div className="p-2.5">
                  <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                  <p className="line-clamp-2 text-[11px] text-slate-500">{p.description}</p>
                </div>
              </button>
            ))}
            <label
              onClick={(e) => {
                if (!likenessConsent) {
                  e.preventDefault()
                  setError('Please tick the consent box below before uploading your photo.')
                }
              }}
              className={clsx(
                'flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 transition hover:border-rose-300 hover:text-rose-600 sm:aspect-auto',
                !likenessConsent && 'opacity-60',
              )}
            >
              {busy === 'create' ? <Loader2 className="animate-spin" /> : <Camera />}
              <span className="text-sm font-semibold">Upload your photo</span>
              <span className="px-3 text-center text-[11px]">JPG / PNG / WebP</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={!likenessConsent}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void createFromBlob(f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My Avatar', '', f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" className="mt-0.5" checked={likenessConsent} onChange={(e) => setLikenessConsent(e.target.checked)} />
            <span>I own this likeness/voice or have permission to use it.</span>
          </label>
          {avatars.length > 0 && (
            <button type="button" onClick={() => setCreating(false)} className="mt-3 text-xs text-slate-500 underline">
              Cancel
            </button>
          )}
        </section>
      )}

      {selected && (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Preview */}
          <div className="space-y-3">
            <RealisticAvatar avatar={selected} state={previewState} />
            <SharePanel avatarId={selected.id} />
            <div className="grid grid-cols-4 gap-1.5">
              {(['idle', 'listening', 'thinking', 'speaking'] as AvatarCallState[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPreviewState(s)}
                  className={clsx(
                    'rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize',
                    previewState === s ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white text-slate-600',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void activate()}
                disabled={selected.isActive}
                className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-emerald-600"
              >
                {selected.isActive ? '✓ Active avatar' : 'Use for calls'}
              </button>
              <button type="button" onClick={() => void remove()} className="rounded-xl border border-red-200 px-3 text-red-500 hover:bg-red-50" title="Delete avatar">
                <Trash2 size={15} />
              </button>
            </div>
            {avatars.length > 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {avatars.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={clsx(
                      'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-medium',
                      a.id === selected.id ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600',
                    )}
                  >
                    {a.media.portrait ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.media.portrait.url} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <span className="h-6 w-6 rounded-full bg-slate-200" />
                    )}
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <Film size={16} className="text-rose-500" /> Multi-angle video clips
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Generated from the portrait with your <Link href="/settings/config" className="underline">APIsRouter key</Link>, or upload your own MP4/WebM clips (max 30 MB each).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={videoModel}
                    onChange={(e) => setVideoModel(e.target.value)}
                    className="h-9 w-36 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-700"
                    placeholder="video model id"
                    title="APIsRouter video model id"
                  />
                  <button
                    type="button"
                    disabled={busy === 'generate' || running || !selected.media.portrait}
                    onClick={() => void generate()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {busy === 'generate' || running ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {running ? 'Generating…' : 'Generate all angles'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {CLIP_SLOTS.map(({ slot, label, hint }) => {
                  const clip = selected.media[slot]
                  const job = selected.jobs?.[slot]
                  const jobRunning = job && ['queued', 'processing', 'in_progress'].includes(job.status)
                  return (
                    <div key={slot} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      <div className="relative aspect-video bg-slate-900">
                        {clip ? (
                          <video src={clip.url} muted loop playsInline autoPlay className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-slate-400">
                            {jobRunning ? (
                              <span className="flex items-center gap-1.5">
                                <Loader2 size={13} className="animate-spin" /> {job?.status}
                                {typeof job?.progress === 'number' ? ` ${Math.round(job.progress)}%` : ''}
                              </span>
                            ) : (
                              'No clip yet'
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">{label}</p>
                          {clip && <CheckCircle2 size={14} className="text-emerald-500" />}
                        </div>
                        <p className="text-[11px] text-slate-500">{hint}</p>
                        {job?.status === 'failed' && <p className="text-[11px] text-red-500">{job.error}</p>}
                        <div className="flex gap-1.5 pt-1">
                          <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
                            {busy === `upload-${slot}` ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                            <input
                              type="file"
                              accept="video/mp4,video/webm"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) void uploadSlot(slot, f)
                                e.target.value = ''
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={Boolean(jobRunning) || busy === 'generate' || !selected.media.portrait}
                            onClick={() => void generate([slot])}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 py-1.5 text-[11px] font-semibold text-violet-700 disabled:opacity-50"
                          >
                            <Wand2 size={12} /> {clip ? 'Regenerate' : 'Generate'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="relative aspect-video bg-slate-900">
                    {selected.media.portrait && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.media.portrait.url} alt="Portrait" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="space-y-1.5 p-3">
                    <p className="text-sm font-semibold text-slate-800">Portrait photo</p>
                    <p className="text-[11px] text-slate-500">Reference face for every angle</p>
                    <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
                      <Camera size={12} /> Replace photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void uploadSlot('portrait', f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <label className="flex items-start gap-1.5 text-[10px] leading-tight text-slate-500">
                      <input type="checkbox" checked={likenessConsent} onChange={(e) => setLikenessConsent(e.target.checked)} />
                      <span>I own this likeness/voice or have permission</span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Mic size={16} className="text-rose-500" /> Voice
              </h2>
              {!hasVoiceKey ? (
                <p className="mt-2 text-sm text-slate-500">
                  Add your own <strong>Fish Audio</strong> or <strong>ElevenLabs</strong> API key in{' '}
                  <Link href="/settings/voice" className="font-semibold text-rose-600 underline">Voice Settings</Link> to give {selected.name} a realistic voice.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={voiceKey}
                    onChange={(e) => void saveVoice(e.target.value)}
                    className="h-10 w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:min-w-[260px]"
                  >
                    <option value="">Default voice from Voice Settings</option>
                    {voices.map((v) => (
                      <option key={`${v.provider}:${v.id}`} value={`${v.provider}:${v.id}`}>
                        {v.provider === 'fish' ? 'Fish Audio' : 'ElevenLabs'} — {v.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void testVoice()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"
                  >
                    <Play size={14} /> Test voice
                  </button>
                </div>
              )}
              {hasVoiceKey && (
                <VoiceCloneCard
                  avatarName={selected.name}
                  hasFishKey={Boolean(ttsCfg?.hasFishKey)}
                  hasElevenlabsKey={Boolean(ttsCfg?.hasElevenlabsKey)}
                  onCloned={async (v) => {
                    setVoices((prev) => [{ id: v.voiceId, name: `${v.name} (cloned)`, provider: v.provider }, ...prev])
                    await saveVoice(`${v.provider}:${v.voiceId}`)
                    setNotice(`Cloned voice saved as ${selected.name}'s voice.`)
                  }}
                />
              )}
            </section>
            <VariationCard
              avatar={selected}
              onCreated={async (created) => {
                await refresh()
                setSelectedId(created.id)
                setNotice(`Variation "${created.name}" saved as a new avatar.`)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
