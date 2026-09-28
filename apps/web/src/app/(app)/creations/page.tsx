'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { Artifact } from '@openagents/shared'
import { Code2, FileText, ImageIcon, Film, Music4, X, LayoutGrid } from 'lucide-react'
import clsx from 'clsx'

const TYPE_ICON: Record<string, typeof FileText> = {
  document: FileText,
  report: FileText,
  website: Code2,
  code: Code2,
  image: ImageIcon,
  video: Film,
  audio: Music4,
}

const FILTERS = ['all', 'document', 'website', 'image', 'video', 'audio', 'code'] as const

export default function CreationsPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [selected, setSelected] = useState<{ artifact: Artifact; content: string; format: string } | null>(null)
  const [opening, setOpening] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setArtifacts(await sdk.artifacts.list())
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load creations')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return artifacts
    return artifacts.filter((a) => a.type.toLowerCase().includes(filter))
  }, [artifacts, filter])

  async function open(artifact: Artifact) {
    setOpening(true)
    try {
      const detail = await sdk.artifacts.get(artifact.id)
      const versions = (detail as unknown as { versions?: Array<{ content: string; format: string }> }).versions
      const latest = Array.isArray(versions) && versions.length > 0 ? versions[versions.length - 1] : null
      setSelected({ artifact, content: latest?.content ?? '(no content yet)', format: latest?.format ?? 'markdown' })
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to open creation')
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="oa-gradient-text text-2xl font-semibold">Creations</h1>
          <p className="mt-1 text-sm text-slate-500">Everything your agent has built — slides, sites, reports, media.</p>
        </div>
        <div className="oa-segment flex gap-1 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={clsx('oa-segment-item px-3 py-1 text-xs font-medium capitalize', filter === f ? 'oa-segment-item--active' : 'text-slate-400 hover:text-slate-600')}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading creations…</p>
      ) : filtered.length === 0 ? (
        <div className="oa-card-elevated rounded-2xl p-12 text-center">
          <LayoutGrid className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Nothing here yet. Ask your agent to &quot;build me a landing page&quot; or &quot;create a pitch deck&quot;.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((artifact) => {
            const Icon = TYPE_ICON[artifact.type.toLowerCase()] ?? FileText
            return (
              <button key={artifact.id} type="button" onClick={() => void open(artifact)} disabled={opening} className="oa-hover-card oa-card-elevated flex flex-col rounded-2xl p-4 text-left">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                    <Icon size={16} />
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{artifact.type}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm font-semibold text-slate-800">{artifact.title}</p>
                {artifact.summary && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{artifact.summary}</p>}
                <p className="mt-auto pt-3 text-[11px] text-slate-400">{new Date(artifact.updatedAt ?? artifact.createdAt).toLocaleDateString()}</p>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setSelected(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="oa-card-elevated relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <p className="truncate text-sm font-semibold text-slate-800">{selected.artifact.title}</p>
              <button type="button" onClick={() => setSelected(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-50/50 p-4">
              {selected.format === 'html' || selected.artifact.type.toLowerCase() === 'website' ? (
                <iframe title={selected.artifact.title} srcDoc={selected.content} sandbox="" className="h-[60vh] w-full rounded-lg border border-slate-200 bg-white" />
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">{selected.content.slice(0, 20000)}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
