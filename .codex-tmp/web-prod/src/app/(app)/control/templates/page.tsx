'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { PlatformTemplate } from '@openagents/shared'

export default function TemplatesPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [templates, setTemplates] = useState<PlatformTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isInstallingId, setIsInstallingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await sdk.platform.listTemplates()
      setTemplates(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load templates')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleInstall(templateId: string) {
    setIsInstallingId(templateId)
    setError('')
    try {
      const result = await sdk.platform.installTemplate(templateId)
      await load()
      addToast('success', `Template installed (${result.installedPacks.length} packs, ${result.createdGoals.length} goals)`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to install template'
      setError(message)
      addToast('error', message)
    } finally {
      setIsInstallingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Agent Template Marketplace</h1>
          <p className="mt-1 text-sm text-slate-500">Install prebuilt agent templates with packs, goals, and channel setup.</p>
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

      <section className="grid gap-4 lg:grid-cols-2">
        {templates.map((template) => (
          <article key={template.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">{template.title}</p>
                <p className="mt-1 text-xs text-slate-500">{template.category} | requires {template.requiredPlan.toUpperCase()}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  template.installed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {template.installed ? 'installed' : 'available'}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-600">{template.description}</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Channels</p>
                <p className="mt-1 text-xs text-slate-600">{template.channels.join(', ')}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Marketplace Packs</p>
                <p className="mt-1 text-xs text-slate-600">
                  {template.includes.marketplacePacks.length > 0 ? template.includes.marketplacePacks.join(', ') : '(none)'}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Starter Goals</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
                {template.includes.starterGoals.map((goal) => (
                  <li key={goal}>{goal}</li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => void handleInstall(template.id)}
              disabled={isInstallingId === template.id}
              className="mt-4 rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
            >
              {isInstallingId === template.id ? 'Installing...' : 'Install template'}
            </button>
          </article>
        ))}
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

