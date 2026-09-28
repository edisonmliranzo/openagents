'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { PluginRow } from '@openagents/sdk'
import { Blocks, KeyRound } from 'lucide-react'
import clsx from 'clsx'

export default function PluginsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [plugins, setPlugins] = useState<PluginRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPlugins(await sdk.plugins.list())
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load plugins')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  async function toggle(plugin: PluginRow) {
    setBusyKey(plugin.key)
    try {
      if (plugin.enabled) {
        await sdk.plugins.disable(plugin.key)
        addToast('info', `${plugin.name} disabled.`)
      } else {
        await sdk.plugins.enable(plugin.key)
        addToast('success', `${plugin.name} installed — its tools appear in new agent runs.`)
      }
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Plugin change failed')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="oa-gradient-text text-2xl font-semibold">Plugins</h1>
        <p className="mt-1 text-sm text-slate-500">One-click MCP servers that extend your agent with new tools. Enable, and your specialists can use them immediately.</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading catalog…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {plugins.map((plugin) => (
            <div key={plugin.key} className="oa-hover-card oa-card-elevated flex items-start gap-3 rounded-2xl p-4">
              <span className={clsx('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', plugin.enabled ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'bg-slate-100 text-slate-400')}>
                <Blocks size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-800">{plugin.name}</p>
                  <button
                    type="button"
                    onClick={() => void toggle(plugin)}
                    disabled={busyKey === plugin.key}
                    className={clsx(
                      'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition disabled:opacity-50',
                      plugin.enabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-900 text-white hover:bg-slate-700',
                    )}
                  >
                    {busyKey === plugin.key ? '…' : plugin.enabled ? 'Enabled' : 'Enable'}
                  </button>
                </div>
                <p className="mt-1 text-xs leading-snug text-slate-500">{plugin.description}</p>
                <p className="mt-1.5 text-[10px] uppercase tracking-wide text-slate-400">{plugin.category}</p>
                {plugin.requiresEnv && plugin.requiresEnv.length > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    <KeyRound size={10} /> needs {plugin.requiresEnv.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
