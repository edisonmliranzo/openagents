'use client'

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Check, Pencil, Pin, PinOff, Search, Trash2, X } from 'lucide-react'
import type { MemoryEntry, MemoryType } from '@openagents/shared'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

export type PanelMemoryEntry = MemoryEntry & { pinned?: boolean }

const TYPE_COLORS: Record<MemoryType, string> = {
  fact: 'bg-blue-100 text-blue-700',
  preference: 'bg-purple-100 text-purple-700',
  summary: 'bg-emerald-100 text-emerald-700',
}

interface Props {
  entries: PanelMemoryEntry[]
  setEntries: Dispatch<SetStateAction<PanelMemoryEntry[]>>
  isLoading: boolean
}

export function MemoryEntriesPanel({ entries, setEntries, isLoading }: Props) {
  const addToast = useUIStore((s) => s.addToast)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | MemoryType>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftContent, setDraftContent] = useState('')
  const [draftTags, setDraftTags] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return entries.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (!q) return true
      return e.content.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q))
    })
  }, [entries, filter, typeFilter])

  const pinned = filtered.filter((e) => e.pinned)
  const others = filtered.filter((e) => !e.pinned)

  function replace(updated: PanelMemoryEntry) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)))
  }

  function startEdit(entry: PanelMemoryEntry) {
    setEditingId(entry.id)
    setDraftContent(entry.content)
    setDraftTags(entry.tags.join(', '))
  }

  async function saveEdit(id: string) {
    setBusyId(id)
    try {
      const tags = draftTags.split(',').map((t) => t.trim()).filter(Boolean)
      const updated = await sdk.memory.update(id, { content: draftContent, tags })
      replace(updated)
      setEditingId(null)
      addToast('success', 'Memory updated')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to update memory')
    } finally {
      setBusyId(null)
    }
  }

  async function togglePin(entry: PanelMemoryEntry) {
    setBusyId(entry.id)
    try {
      const updated = entry.pinned ? await sdk.memory.unpin(entry.id) : await sdk.memory.pin(entry.id)
      replace(updated)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to update pin')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete(id: string) {
    setBusyId(id)
    try {
      await sdk.memory.delete(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
      addToast('success', 'Memory deleted — you can undo it from the Audit log')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to delete entry')
    } finally {
      setBusyId(null)
      setConfirmDeleteId(null)
    }
  }

  function renderEntry(entry: PanelMemoryEntry) {
    const editing = editingId === entry.id
    const busy = busyId === entry.id
    return (
      <li key={entry.id} className="flex items-start gap-3 p-4">
        <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_COLORS[entry.type] ?? ''}`}>
          {entry.type}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          {editing ? (
            <>
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
              />
              <input
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                placeholder="tags, comma separated"
                className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-slate-500 focus:outline-none"
              />
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{entry.content}</p>
              {entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{tag}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <IconBtn title="Save" disabled={busy || !draftContent.trim()} onClick={() => void saveEdit(entry.id)}>
                <Check className="h-4 w-4 text-emerald-600" />
              </IconBtn>
              <IconBtn title="Cancel" onClick={() => setEditingId(null)}>
                <X className="h-4 w-4" />
              </IconBtn>
            </>
          ) : confirmDeleteId === entry.id ? (
            <div className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
              Delete?
              <button type="button" disabled={busy} onClick={() => void confirmDelete(entry.id)} className="font-semibold hover:underline">Yes</button>
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="hover:underline">No</button>
            </div>
          ) : (
            <>
              <IconBtn title={entry.pinned ? 'Unpin' : 'Pin'} disabled={busy} onClick={() => void togglePin(entry)}>
                {entry.pinned ? <PinOff className="h-4 w-4 text-amber-600" /> : <Pin className="h-4 w-4" />}
              </IconBtn>
              <IconBtn title="Edit" onClick={() => startEdit(entry)}>
                <Pencil className="h-4 w-4" />
              </IconBtn>
              <IconBtn title="Delete" onClick={() => setConfirmDeleteId(entry.id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </IconBtn>
            </>
          )}
        </div>
      </li>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold text-slate-900">Memory Entries</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter entries…"
            className="rounded-lg border border-slate-300 py-1 pl-7 pr-2 text-xs focus:border-slate-500 focus:outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | MemoryType)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="all">All types</option>
          <option value="fact">Fact</option>
          <option value="preference">Preference</option>
          <option value="summary">Summary</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">
          {isLoading
            ? 'Loading...'
            : entries.length === 0
              ? 'No memory entries yet. Start chatting to build context.'
              : 'No entries match your filter.'}
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <div className="border-b border-slate-100 bg-amber-50/40">
              <p className="flex items-center gap-1 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                <Pin className="h-3 w-3" /> Pinned — always included in agent context
              </p>
              <ul className="divide-y divide-amber-100">{pinned.map(renderEntry)}</ul>
            </div>
          )}
          <ul className="divide-y divide-slate-100">{others.map(renderEntry)}</ul>
        </>
      )}
    </section>
  )
}

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
