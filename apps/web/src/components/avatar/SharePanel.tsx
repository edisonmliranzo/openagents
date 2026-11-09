'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, Share2 } from 'lucide-react'
import { sdk } from '@/stores/auth'

interface ShareSettings {
  enabled: boolean
  slug: string
  greeting: string
  dailyCap: number
  allowVoice: boolean
  url: string | null
}

/** Avatar Studio panel: publish an avatar at /p/<slug> with owner-controlled cost limits. */
export function SharePanel({ avatarId }: { avatarId: string | null | undefined }) {
  const [s, setS] = useState<ShareSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setS(null)
    setMsg('')
    if (!avatarId) return
    sdk.client
      .get<ShareSettings>(`/api/v1/avatars/${avatarId}/share`)
      .then(setS)
      .catch(() => setS({ enabled: false, slug: '', greeting: '', dailyCap: 50, allowVoice: false, url: null }))
  }, [avatarId])

  if (!avatarId) return null

  async function save(patch: Partial<ShareSettings> = {}) {
    if (!s) return
    setSaving(true)
    setMsg('')
    try {
      const next = { ...s, ...patch }
      const out = await sdk.client.post<ShareSettings>(`/api/v1/avatars/${avatarId}/share`, {
        enabled: next.enabled,
        slug: next.slug,
        greeting: next.greeting,
        dailyCap: next.dailyCap,
        allowVoice: next.allowVoice,
      })
      setS(out)
      setMsg(out.enabled ? 'Public page is live.' : 'Saved. Sharing is off.')
    } catch (err: any) {
      setMsg(err?.message || 'Could not save share settings')
    } finally {
      setSaving(false)
    }
  }

  const url = s?.url || (s?.slug && typeof window !== 'undefined' ? `${window.location.origin}/p/${s.slug}` : '')

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Share2 className="h-4 w-4 text-rose-600" /> Share publicly
        </h3>
        {s && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={s.enabled} disabled={saving} onChange={(e) => void save({ enabled: e.target.checked })} />
            {s.enabled ? 'On' : 'Off'}
          </label>
        )}
      </div>
      {!s ? (
        <Loader2 className="mt-3 h-4 w-4 animate-spin text-slate-400" />
      ) : (
        <div className="mt-3 space-y-3 text-xs">
          <p className="text-slate-500">
            Anyone with the link can chat with this avatar. Replies use <b>your</b> AI key, capped by the daily limit below.
          </p>
          <label className="block">
            <span className="font-medium text-slate-700">Link</span>
            <div className="mt-1 flex items-center rounded-lg border border-slate-200">
              <span className="pl-2.5 text-slate-400">/p/</span>
              <input
                value={s.slug}
                onChange={(e) => setS({ ...s, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder="my-avatar"
                maxLength={40}
                className="flex-1 bg-transparent px-1 py-1.5 outline-none"
              />
            </div>
          </label>
          <label className="block">
            <span className="font-medium text-slate-700">Greeting</span>
            <input
              value={s.greeting}
              onChange={(e) => setS({ ...s, greeting: e.target.value })}
              maxLength={400}
              placeholder="Hi! Ask me anything."
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="font-medium text-slate-700">Daily message cap</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={s.dailyCap}
                onChange={(e) => setS({ ...s, dailyCap: Number(e.target.value) || 1 })}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" checked={s.allowVoice} onChange={(e) => setS({ ...s, allowVoice: e.target.checked })} />
              Allow voice (uses your voice key)
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {s.enabled && url && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(url)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy link
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-rose-600 hover:underline">
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            )}
          </div>
          {msg && <p className="text-slate-500">{msg}</p>}
        </div>
      )}
    </section>
  )
}

export default SharePanel
