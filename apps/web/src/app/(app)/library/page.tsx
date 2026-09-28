'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { LibraryDocumentRow, LibraryHit } from '@openagents/sdk'
import { BookOpen, FileText, Search, Trash2 } from 'lucide-react'

export default function LibraryPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [docs, setDocs] = useState<LibraryDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<LibraryHit[] | null>(null)
  const [searching, setSearching] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDocs(await sdk.library.list())
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load library')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  async function handleAdd() {
    if (!title.trim() || !content.trim()) { addToast('warning', 'Title and content are required.'); return }
    setSaving(true)
    try {
      await sdk.library.add({ title: title.trim(), content })
      setTitle(''); setContent('')
      addToast('success', 'Document indexed.')
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to add document')
    } finally {
      setSaving(false)
    }
  }

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      setHits(await sdk.library.search(query.trim()))
    } catch (err: any) {
      addToast('error', err?.message ?? 'Search failed')
      setHits([])
    } finally {
      setSearching(false)
    }
  }

  async function remove(doc: LibraryDocumentRow) {
    if (!confirm(`Remove "${doc.title}" from the library?`)) return
    await sdk.library.remove(doc.id).then(load).catch((err: any) => addToast('error', err?.message))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="oa-gradient-text text-2xl font-semibold">Library</h1>
        <p className="mt-1 text-sm text-slate-500">Your agent&apos;s private knowledge base. Paste documents here and it can cite them in any conversation.</p>
      </div>

      <div className="oa-card-elevated rounded-2xl p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title (e.g. Lease Agreement 2026)" className="oa-input-surface h-10 w-full rounded-lg px-3 text-sm outline-none" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Paste markdown, text, CSV, or JSON content…" className="oa-input-surface mt-3 w-full resize-y rounded-lg px-3 py-2 font-mono text-xs outline-none" />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">{content.length ? `${content.length.toLocaleString()} characters · auto-chunked & embedded` : 'Max ~200k characters per document'}</p>
          <button type="button" onClick={() => void handleAdd()} disabled={saving} className="oa-send-button h-9 rounded-lg px-4 text-sm font-semibold">
            {saving ? 'Indexing…' : 'Add to library'}
          </button>
        </div>
      </div>

      <div className="oa-card-elevated rounded-2xl p-4">
        <div className="flex gap-2">
          <div className="oa-search flex min-w-0 flex-1 items-center gap-2 px-3.5 py-2">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }} placeholder="Search your library semantically…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <button type="button" onClick={() => void handleSearch()} disabled={searching} className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {hits !== null && (
          <div className="mt-3 space-y-2">
            {hits.length === 0 ? (
              <p className="text-xs text-slate-400">No matching passages.</p>
            ) : hits.map((hit, i) => (
              <div key={`${hit.documentId}-${hit.ordinal}-${i}`} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <p className="text-xs font-semibold text-slate-700">{hit.title} <span className="font-normal text-slate-400">· {(hit.score * 100).toFixed(0)}% match</span></p>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500">{hit.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading library…</p>
      ) : docs.length === 0 ? (
        <div className="oa-card-elevated rounded-2xl p-10 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Your library is empty. Add documents above, or set LIBRARY_WATCH_DIR to auto-index a folder.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="oa-hover-card flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <FileText size={16} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{doc.title}</p>
                <p className="text-[11px] text-slate-400">{doc.chunkCount} chunks · {doc.source} · {new Date(doc.updatedAt).toLocaleDateString()}</p>
              </div>
              <span className={doc.status === 'indexed' ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600' : 'rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600'}>{doc.status}</span>
              <button type="button" onClick={() => void remove(doc)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
