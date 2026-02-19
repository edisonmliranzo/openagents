'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { MemoryEntry, MemoryType } from '@openagents/shared'
import { useUIStore } from '@/stores/ui'

const TYPE_COLORS: Record<MemoryType, string> = {
  fact: 'bg-blue-100 text-blue-700',
  preference: 'bg-purple-100 text-purple-700',
  summary: 'bg-emerald-100 text-emerald-700',
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const addToast = useUIStore((s) => s.addToast)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await sdk.memory.list()
      setEntries(data)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load memory'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDelete(id: string) {
    try {
      await sdk.memory.delete(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
      addToast('success', 'Memory entry deleted')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to delete entry'
      setError(message)
      addToast('error', message)
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Memory</h1>
          <p className="mt-1 text-sm text-slate-500">Facts, preferences, and summaries the agent has learned about you.</p>
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

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {isLoading ? 'Loading...' : 'No memory entries yet. Start chatting to build context.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-4 p-4">
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_COLORS[entry.type]}`}>
                  {entry.type}
                </span>
                <p className="flex-1 text-sm text-slate-700">{entry.content}</p>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(entry.id)}
                  className="shrink-0 text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
