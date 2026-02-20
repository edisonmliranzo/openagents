'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { NanobotMarketplacePack } from '@openagents/shared'

export default function MarketplacePage() {
  const addToast = useUIStore((state) => state.addToast)
  const [packs, setPacks] = useState<NanobotMarketplacePack[]>([])
  const [exportName, setExportName] = useState('my-skill-pack')
  const [exportDescription, setExportDescription] = useState('')
  const [includeOnlyEnabled, setIncludeOnlyEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await sdk.nanobot.listMarketplacePacks()
      setPacks(list)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load marketplace packs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleInstall(packId: string) {
    setIsSaving(true)
    setError('')
    try {
      const result = await sdk.nanobot.installMarketplacePack(packId)
      await load()
      addToast('success', `Installed ${result.installedSkills.length} skills from ${packId}`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to install pack')
      addToast('error', err?.message ?? 'Failed to install pack')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleExport() {
    const name = exportName.trim()
    if (!name) {
      setError('Pack name is required.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const exported = await sdk.nanobot.exportMarketplacePack({
        name,
        description: exportDescription.trim() || undefined,
        includeOnlyEnabled,
      })
      addToast('success', `Exported pack to ${exported.fileName}`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to export pack')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Capability Marketplace</h1>
          <p className="mt-1 text-sm text-slate-500">Install curated skill packs and export your own packs for reuse.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Curated Packs</h2>
        <p className="mt-1 text-sm text-slate-500">One-click installs for common workflows.</p>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {packs.map((pack) => (
            <article key={pack.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{pack.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{pack.id} - v{pack.version}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    pack.installed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {pack.installed ? 'installed' : 'available'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600">{pack.description}</p>
              <p className="mt-2 text-[11px] text-slate-500">skills: {pack.skills.length}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {pack.tags.map((tag) => (
                  <span key={tag} className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleInstall(pack.id)}
                className="mt-3 rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
              >
                Install pack
              </button>
            </article>
          ))}
          {packs.length === 0 && (
            <p className="text-sm text-slate-500">{isLoading ? 'Loading packs...' : 'No packs available.'}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Export Pack</h2>
        <p className="mt-1 text-sm text-slate-500">Export your current skills to a reusable marketplace pack file.</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={exportName}
            onChange={(e) => setExportName(e.target.value)}
            placeholder="Pack name"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
          />
          <input
            value={exportDescription}
            onChange={(e) => setExportDescription(e.target.value)}
            placeholder="Description (optional)"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
          />
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isSaving}
            className="h-10 rounded-lg bg-indigo-500 px-4 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            Export
          </button>
        </div>

        <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={includeOnlyEnabled}
            onChange={(e) => setIncludeOnlyEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
          />
          Include only enabled skills
        </label>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

