'use client'

import { useState } from 'react'
import { Loader2, Shirt } from 'lucide-react'
import { sdk } from '@/stores/auth'
import type { RealisticAvatarRecord } from '@/components/avatar/RealisticAvatar'

const SUGGESTIONS = ['business suit, office background', 'casual hoodie, cozy cafe', 'smart casual, modern studio backdrop', 'doctor coat, clinic background']

function errMsg(e: unknown, fallback: string) {
  const raw = String((e as any)?.message ?? '')
  try {
    return JSON.parse(raw)?.message || fallback
  } catch {
    return raw && !raw.startsWith('<') && raw.length < 240 ? raw : fallback
  }
}

/** Generate an outfit/background variation of the avatar portrait (saved as a new avatar). */
export function VariationCard({
  avatar,
  onCreated,
}: {
  avatar: RealisticAvatarRecord
  onCreated: (created: RealisticAvatarRecord) => Promise<void> | void
}) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('gpt-image-1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    const p = prompt.trim()
    if (!p) return
    setBusy(true)
    setError(null)
    try {
      const created = await sdk.client.post<RealisticAvatarRecord>(`/api/v1/avatars/${avatar.id}/variation`, {
        prompt: p,
        model: model.trim() || 'gpt-image-1',
      })
      setPrompt('')
      await onCreated(created)
    } catch (e) {
      setError(errMsg(e, 'Could not generate a variation.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Shirt size={16} className="text-rose-500" /> Outfits &amp; backgrounds
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Creates a new avatar with the same face in a different outfit or setting, using your APIsRouter image model.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
          placeholder="e.g. business suit, office background"
          maxLength={400}
          className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          title="APIsRouter image model id"
          className="h-10 w-32 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-700"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !prompt.trim() || !avatar.media.portrait}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Shirt size={14} />} Generate variation
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPrompt(s)}
            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  )
}

export default VariationCard
