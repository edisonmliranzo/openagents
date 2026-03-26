'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { NanobotMarketplacePack, PublicSkillCatalogEntry } from '@openagents/shared'

export default function MarketplacePage() {
  const addToast = useUIStore((state) => state.addToast)
  const [packs, setPacks] = useState<NanobotMarketplacePack[]>([])
  const [publicSkills, setPublicSkills] = useState<PublicSkillCatalogEntry[]>([])
  const [exportName, setExportName] = useState('my-skill-pack')
  const [exportDescription, setExportDescription] = useState('')
  const [includeOnlyEnabled, setIncludeOnlyEnabled] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [publicQuery, setPublicQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (query = '') => {
    setIsLoading(true)
    setError('')
    try {
      const [packList, catalogList] = await Promise.all([
        sdk.nanobot.listMarketplacePacks(),
        sdk.skillRegistry.listPublic(query ? { q: query } : {}),
      ])
      setPacks(packList)
      setPublicSkills(catalogList)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load marketplace data')
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
      await load(publicQuery)
      addToast('success', `Installed ${result.installedSkills.length} skills from ${packId}`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to install pack')
      addToast('error', err?.message ?? 'Failed to install pack')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSearch() {
    const nextQuery = searchQuery.trim()
    setPublicQuery(nextQuery)
    await load(nextQuery)
  }

  async function handleInstallPublic(skill: PublicSkillCatalogEntry) {
    setIsSaving(true)
    setError('')
    try {
      const result = await sdk.skillRegistry.installPublic(skill.catalogId)
      await load(publicQuery)
      addToast('success', `Installed ${result.title} v${result.installedVersion ?? skill.latestVersion.version}`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to install public skill')
      addToast('error', err?.message ?? 'Failed to install public skill')
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
          <p className="mt-1 text-sm text-slate-500">Search public skills, install curated packs, and export your own packs for reuse.</p>
        </div>
        <button
          type="button"
          onClick={() => void load(publicQuery)}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Public Skills</h2>
            <p className="mt-1 text-sm text-slate-500">Install individual skills from the shared OpenAgents catalog.</p>
          </div>
          <form
            className="flex w-full max-w-xl flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSearch()
            }}
          >
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by title, tag, tool, or workflow"
              className="h-10 min-w-[260px] flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="h-10 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Search
            </button>
          </form>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {publicSkills.map((skill) => (
            <article key={skill.catalogId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{skill.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{skill.publisher}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {skill.featured && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      featured
                    </span>
                  )}
                  {skill.installedVersion && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      installed v{skill.installedVersion}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-600">{skill.description}</p>
              <p className="mt-2 text-[11px] text-slate-500">
                v{skill.latestVersion.version} - {skill.downloads.toLocaleString()} installs
              </p>
              <p className="mt-1 text-[11px] text-slate-500">tools: {skill.latestVersion.manifest.tools.join(', ')}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {skill.tags.map((tag) => (
                  <span key={tag} className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
              {skill.missingTools.length > 0 && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                  Missing tools: {skill.missingTools.join(', ')}
                </p>
              )}
              {!skill.installable && skill.missingTools.length === 0 && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                  This skill is not installable on the current API version.
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                {skill.sourceUrl ? (
                  <a
                    href={skill.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
                  >
                    Source
                  </a>
                ) : (
                  <span className="text-[11px] text-slate-400">{publicQuery ? `query: ${publicQuery}` : 'catalog'}</span>
                )}
                <button
                  type="button"
                  disabled={isSaving || !skill.installable}
                  onClick={() => void handleInstallPublic(skill)}
                  className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
                >
                  {skill.installedVersion ? 'Reinstall skill' : 'Install skill'}
                </button>
              </div>
            </article>
          ))}
          {publicSkills.length === 0 && (
            <p className="text-sm text-slate-500">
              {isLoading
                ? 'Loading public skills...'
                : publicQuery
                  ? 'No public skills matched that search.'
                  : 'No public skills available.'}
            </p>
          )}
        </div>
      </section>

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
            onChange={(event) => setExportName(event.target.value)}
            placeholder="Pack name"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
          />
          <input
            value={exportDescription}
            onChange={(event) => setExportDescription(event.target.value)}
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
            onChange={(event) => setIncludeOnlyEnabled(event.target.checked)}
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
