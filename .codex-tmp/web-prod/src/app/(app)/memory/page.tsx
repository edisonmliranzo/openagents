'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type {
  MemoryConflict,
  MemoryEntry,
  MemoryFileSummary,
  MemoryReviewItem,
  MemoryType,
} from '@openagents/shared'
import { useUIStore } from '@/stores/ui'

const TYPE_COLORS: Record<MemoryType, string> = {
  fact: 'bg-blue-100 text-blue-700',
  preference: 'bg-purple-100 text-purple-700',
  summary: 'bg-emerald-100 text-emerald-700',
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [files, setFiles] = useState<MemoryFileSummary[]>([])
  const [conflicts, setConflicts] = useState<MemoryConflict[]>([])
  const [reviewQueue, setReviewQueue] = useState<MemoryReviewItem[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [fileReadonly, setFileReadonly] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isFileLoading, setIsFileLoading] = useState(false)
  const [isFileSaving, setIsFileSaving] = useState(false)
  const [isSyncingFiles, setIsSyncingFiles] = useState(false)
  const [isCurating, setIsCurating] = useState(false)
  const [busyConflictId, setBusyConflictId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const addToast = useUIStore((s) => s.addToast)

  const openFile = useCallback(async (name: string) => {
    setSelectedFile(name)
    setIsFileLoading(true)
    try {
      const file = await sdk.memory.readFile(name)
      setFileContent(file.content)
      setFileReadonly(file.readonly)
    } catch (err: any) {
      const message = err?.message ?? `Failed to load ${name}`
      setError(message)
      addToast('error', message)
    } finally {
      setIsFileLoading(false)
    }
  }, [addToast])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [memoryRows, fileRows, conflictRows, reviewRows] = await Promise.all([
        sdk.memory.list(),
        sdk.memory.listFiles(),
        sdk.memory.listConflicts('open', 12),
        sdk.memory.reviewQueue(12),
      ])
      setEntries(memoryRows)
      setFiles(fileRows)
      setConflicts(conflictRows)
      setReviewQueue(reviewRows)
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

  useEffect(() => {
    if (files.length === 0) {
      setSelectedFile('')
      setFileContent('')
      setFileReadonly(true)
      return
    }

    if (!selectedFile || !files.some((file) => file.name === selectedFile)) {
      void openFile(files[0].name)
    }
  }, [files, selectedFile, openFile])

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

  async function handleSyncFiles() {
    setIsSyncingFiles(true)
    setError('')
    try {
      await sdk.memory.syncFiles()
      await load()
      addToast('success', 'Memory files synced')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to sync files'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSyncingFiles(false)
    }
  }

  async function handleSaveFile() {
    if (!selectedFile) return
    setIsFileSaving(true)
    setError('')
    try {
      const updated = await sdk.memory.writeFile(selectedFile, { content: fileContent })
      setFileReadonly(updated.readonly)
      addToast('success', `${selectedFile} saved`)
      await load()
    } catch (err: any) {
      const message = err?.message ?? `Failed to save ${selectedFile}`
      setError(message)
      addToast('error', message)
    } finally {
      setIsFileSaving(false)
    }
  }

  async function handleCurate() {
    setIsCurating(true)
    setError('')
    try {
      await sdk.memory.curate()
      await load()
      addToast('success', 'Memory curation completed')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to curate memory'
      setError(message)
      addToast('error', message)
    } finally {
      setIsCurating(false)
    }
  }

  async function handleResolveConflict(id: string, status: 'resolved' | 'ignored') {
    setBusyConflictId(id)
    setError('')
    try {
      await sdk.memory.resolveConflict(id, status)
      setConflicts((prev) => prev.filter((conflict) => conflict.id !== id))
      setReviewQueue((prev) => prev.filter((item) => item.id !== id))
      addToast('success', status === 'resolved' ? 'Conflict resolved' : 'Conflict ignored')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to update conflict'
      setError(message)
      addToast('error', message)
    } finally {
      setBusyConflictId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Memory</h1>
          <p className="mt-1 text-sm text-slate-500">Structured memory plus editable file-based memory documents.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCurate()}
            disabled={isCurating}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isCurating ? 'Curating...' : 'Curate'}
          </button>
          <button
            type="button"
            onClick={() => void handleSyncFiles()}
            disabled={isSyncingFiles}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isSyncingFiles ? 'Syncing...' : 'Sync Files'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Memory Governance</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Review stale items, low-confidence memory, and open conflicts before they shape future runs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                {reviewQueue.length} review item{reviewQueue.length === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">
                {conflicts.length} open conflict{conflicts.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Review Queue</h3>
            {reviewQueue.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                No low-confidence or stale memory items need review.
              </p>
            ) : (
              reviewQueue.map((item) => (
                <div key={`${item.type}-${item.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {item.type}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      {item.reason.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      confidence {item.confidence.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{item.summary}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(item.updatedAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Open Conflicts</h3>
            {conflicts.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                No unresolved memory conflicts.
              </p>
            ) : (
              conflicts.map((conflict) => (
                <div key={conflict.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        {conflict.severity} severity
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {conflict.entity}.{conflict.key}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      delta {conflict.confidenceDelta.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div className="rounded-md bg-white px-3 py-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">Existing</p>
                      <p className="mt-1 break-words">{conflict.existingValue}</p>
                    </div>
                    <div className="rounded-md bg-white px-3 py-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">Incoming</p>
                      <p className="mt-1 break-words">{conflict.incomingValue}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleResolveConflict(conflict.id, 'resolved')}
                      disabled={busyConflictId === conflict.id}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Keep latest
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResolveConflict(conflict.id, 'ignored')}
                      disabled={busyConflictId === conflict.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

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

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Filesystem Memory</h2>
          <p className="mt-0.5 text-xs text-slate-500">`SOUL.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`, `cron.json`, daily notes, and chat logs.</p>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-[260px_1fr]">
          <div className="max-h-[460px] space-y-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
            {files.length === 0 ? (
              <p className="p-2 text-xs text-slate-500">No files yet.</p>
            ) : (
              files.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => void openFile(file.name)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition ${
                    selectedFile === file.name
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="shrink-0 text-[10px] opacity-70">{file.readonly ? 'RO' : 'RW'}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">
                {selectedFile || 'Select a file'}
              </p>
              <button
                type="button"
                onClick={() => void handleSaveFile()}
                disabled={!selectedFile || fileReadonly || isFileSaving || isFileLoading}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {isFileSaving ? 'Saving...' : 'Save'}
              </button>
            </div>

            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              readOnly={fileReadonly || !selectedFile}
              placeholder={isFileLoading ? 'Loading...' : 'Select a file to view'}
              className="h-[420px] w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100 read-only:bg-slate-50"
            />

            <p className="text-xs text-slate-500">
              {selectedFile
                ? (fileReadonly ? 'Read-only generated file.' : 'Editable file.')
                : 'Choose a file from the left list.'}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
