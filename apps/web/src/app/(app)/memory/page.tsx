'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type {
  MemoryConflict,
  MemoryEntry,
  MemoryEvent,
  MemoryFact,
  MemoryFileSummary,
  MemoryReviewItem,
  MemoryType,
  QueryMemoryResult,
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<QueryMemoryResult | null>(null)
  const [includeFactResults, setIncludeFactResults] = useState(true)
  const [includeConflictResults, setIncludeConflictResults] = useState(false)
  const [diversifyResults, setDiversifyResults] = useState(true)
  const [temporalDecayDays, setTemporalDecayDays] = useState(30)
  const [selectedFile, setSelectedFile] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [fileReadonly, setFileReadonly] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
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

  async function handleSearchMemory() {
    const query = searchQuery.trim()
    if (!query) {
      const message = 'Enter a memory query first'
      setError(message)
      addToast('error', message)
      return
    }

    setIsSearching(true)
    setError('')
    try {
      const result = await sdk.memory.query({
        query,
        includeFacts: includeFactResults,
        includeConflicts: includeConflictResults,
        diversify: diversifyResults,
        temporalDecayDays,
      })
      setSearchResults(result)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to search memory'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSearching(false)
    }
  }

  function renderMemoryEventHit(hit: MemoryEvent) {
    const confidence = hit.effectiveConfidence ?? hit.confidence
    return (
      <div key={`event-${hit.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
            event
          </span>
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
            confidence {confidence.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-400">
            {new Date(hit.updatedAt).toLocaleString()}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-700">{hit.summary}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {[hit.kind, ...hit.tags].filter(Boolean).join(' • ')}
        </p>
      </div>
    )
  }

  function renderMemoryFactHit(hit: MemoryFact) {
    const confidence = hit.effectiveConfidence ?? hit.confidence
    const secondary = [
      hit.sourceRef ?? '',
      hit.freshUntil ? `fresh until ${new Date(hit.freshUntil).toLocaleDateString()}` : '',
    ]
      .filter(Boolean)
      .join(' • ')

    return (
      <div key={`fact-${hit.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
            fact
          </span>
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
            confidence {confidence.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-400">
            {new Date(hit.updatedAt).toLocaleString()}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-700">{hit.entity}.{hit.key}: {hit.value}</p>
        {secondary && (
          <p className="mt-1 text-[11px] text-slate-500">{secondary}</p>
        )}
      </div>
    )
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
              <h2 className="text-sm font-semibold text-slate-900">Search Memory</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Query recent memory with diversified recall and recency weighting.
              </p>
            </div>
            {searchResults && (
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {searchResults.strategy.eventMatches} event match{searchResults.strategy.eventMatches === 1 ? '' : 'es'}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  {searchResults.strategy.factMatches} fact match{searchResults.strategy.factMatches === 1 ? '' : 'es'}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
            <label className="text-xs font-medium text-slate-500">
              Search query
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSearchMemory()
                  }
                }}
                placeholder="e.g. pricing preferences, recent workflow failures, onboarding notes"
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-500">
                Temporal decay
                <input
                  type="number"
                  min={3}
                  max={180}
                  value={temporalDecayDays}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value || '30', 10)
                    setTemporalDecayDays(Number.isFinite(parsed) ? Math.max(3, Math.min(parsed, 180)) : 30)
                  }}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void handleSearchMemory()}
                  disabled={isSearching}
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSearching ? 'Searching...' : 'Search memory'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeFactResults}
                onChange={(event) => setIncludeFactResults(event.target.checked)}
              />
              Include facts
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeConflictResults}
                onChange={(event) => setIncludeConflictResults(event.target.checked)}
              />
              Include conflicts
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={diversifyResults}
                onChange={(event) => setDiversifyResults(event.target.checked)}
              />
              Diversify results
            </label>
          </div>

          {!searchResults ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              Run a search to inspect memory events and facts without digging through raw files.
            </p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Events</h3>
                  <span className="text-[11px] text-slate-500">
                    {searchResults.events.length} returned
                  </span>
                </div>
                {searchResults.events.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                    No event matches for this query.
                  </p>
                ) : (
                  searchResults.events.map((event) => renderMemoryEventHit(event))
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Facts</h3>
                  <span className="text-[11px] text-slate-500">
                    {searchResults.facts.length} returned
                  </span>
                </div>
                {searchResults.facts.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                    No fact matches for this query.
                  </p>
                ) : (
                  searchResults.facts.map((fact) => renderMemoryFactHit(fact))
                )}
              </div>

              {searchResults.conflicts && (
                <div className="space-y-2 xl:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Conflict context</h3>
                    <span className="text-[11px] text-slate-500">
                      {searchResults.conflicts.length} open conflict{searchResults.conflicts.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {searchResults.conflicts.map((conflict) => (
                      <div key={conflict.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            {conflict.severity}
                          </span>
                          <span className="text-[11px] text-slate-500">{conflict.entity}.{conflict.key}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">Existing: {conflict.existingValue}</p>
                        <p className="mt-1 text-xs text-slate-600">Incoming: {conflict.incomingValue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

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
