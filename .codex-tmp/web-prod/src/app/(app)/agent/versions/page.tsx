'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { AgentVersionDiffEntry, AgentVersionSnapshot } from '@openagents/shared'

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return iso
  return date.toLocaleString()
}

export default function AgentVersionsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [snapshots, setSnapshots] = useState<AgentVersionSnapshot[]>([])
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [diffFromId, setDiffFromId] = useState('')
  const [diffToId, setDiffToId] = useState('')
  const [diffChanges, setDiffChanges] = useState<AgentVersionDiffEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isComparing, setIsComparing] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)
  const [error, setError] = useState('')

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [selectedSnapshotId, snapshots],
  )

  const loadSnapshots = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await sdk.agentVersions.list()
      setSnapshots(list)
      if (list.length === 0) {
        setSelectedSnapshotId(null)
        setDiffFromId('')
        setDiffToId('')
        setDiffChanges([])
        return
      }

      const selected = selectedSnapshotId
        ? list.find((entry) => entry.id === selectedSnapshotId) ?? list[0]
        : list[0]
      setSelectedSnapshotId(selected.id)

      if (!diffFromId || !list.some((entry) => entry.id === diffFromId)) {
        setDiffFromId(list[0].id)
      }
      if (!diffToId || !list.some((entry) => entry.id === diffToId)) {
        setDiffToId(list.length > 1 ? list[1].id : list[0].id)
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load snapshots'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, diffFromId, diffToId, selectedSnapshotId])

  useEffect(() => {
    void loadSnapshots()
  }, [loadSnapshots])

  async function handleCreateSnapshot() {
    setIsCreating(true)
    setError('')
    try {
      const created = await sdk.agentVersions.create({
        note: noteDraft.trim() || undefined,
      })
      setNoteDraft('')
      await loadSnapshots()
      setSelectedSnapshotId(created.id)
      addToast('success', `Snapshot created: v${created.version}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create snapshot'
      setError(message)
      addToast('error', message)
    } finally {
      setIsCreating(false)
    }
  }

  async function handleCompare() {
    if (!diffFromId || !diffToId) return
    setIsComparing(true)
    setError('')
    try {
      const result = await sdk.agentVersions.diff(diffFromId, diffToId)
      setDiffChanges(result.changes)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to compare snapshots'
      setError(message)
      addToast('error', message)
    } finally {
      setIsComparing(false)
    }
  }

  async function handleRollback() {
    if (!selectedSnapshotId || !selectedSnapshot) return
    const confirmed = window.confirm(`Rollback to version v${selectedSnapshot.version}?`)
    if (!confirmed) return

    setIsRollingBack(true)
    setError('')
    try {
      const result = await sdk.agentVersions.rollback(selectedSnapshotId)
      await loadSnapshots()
      setSelectedSnapshotId(result.currentSnapshot.id)
      addToast('success', `Rollback complete. Current version is v${result.currentSnapshot.version}.`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to rollback snapshot'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRollingBack(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Agent Version Studio</h1>
          <p className="mt-1 text-sm text-slate-500">
            Snapshot agent settings/skills, compare versions, and rollback instantly.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Snapshot note (optional)"
            className="h-10 min-w-[220px] rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="button"
            onClick={() => void handleCreateSnapshot()}
            disabled={isCreating}
            className="h-10 rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Snapshot'}
          </button>
          <button
            type="button"
            onClick={() => void loadSnapshots()}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Snapshots</h2>
          <p className="mt-1 text-sm text-slate-500">{snapshots.length} versions available.</p>

          <div className="mt-3 space-y-2">
            {snapshots.length === 0 && (
              <p className="text-sm text-slate-500">No snapshots yet.</p>
            )}
            {snapshots.map((snapshot) => (
              <button
                key={snapshot.id}
                type="button"
                onClick={() => setSelectedSnapshotId(snapshot.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  snapshot.id === selectedSnapshotId
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">v{snapshot.version}</p>
                  <p className="text-[11px] text-slate-500">{formatWhen(snapshot.createdAt)}</p>
                </div>
                <p className="mt-1 font-mono text-[11px] text-slate-500">{snapshot.id}</p>
                <p className="mt-1 text-xs text-slate-600">{snapshot.note ?? 'No note'}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Selected Snapshot</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedSnapshot ? `Version v${selectedSnapshot.version}` : 'Select a snapshot'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRollback()}
              disabled={!selectedSnapshot || isRollingBack}
              className="h-10 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              {isRollingBack ? 'Rolling back...' : 'Rollback to This Version'}
            </button>
          </div>

          {selectedSnapshot && (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settings</p>
                <p className="mt-1 text-xs text-slate-700">
                  provider: {selectedSnapshot.settings.preferredProvider}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  model: {selectedSnapshot.settings.preferredModel}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  custom prompt: {selectedSnapshot.settings.customSystemPrompt ? 'set' : 'not set'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Runtime Config</p>
                <p className="mt-1 text-xs text-slate-700">enabled: {String(selectedSnapshot.runtimeConfig.enabled)}</p>
                <p className="mt-1 text-xs text-slate-700">shadowMode: {String(selectedSnapshot.runtimeConfig.shadowMode)}</p>
                <p className="mt-1 text-xs text-slate-700">maxLoopSteps: {selectedSnapshot.runtimeConfig.maxLoopSteps}</p>
                <p className="mt-1 text-xs text-slate-700">runtimeLabel: {selectedSnapshot.runtimeConfig.runtimeLabel}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</p>
                <p className="mt-1 text-xs text-slate-600">
                  total: {selectedSnapshot.skills.length}, enabled: {selectedSnapshot.skills.filter((skill) => skill.enabled).length}
                </p>
                <div className="mt-2 max-h-[180px] space-y-1 overflow-y-auto pr-1">
                  {selectedSnapshot.skills.map((skill) => (
                    <div key={skill.id} className="rounded border border-slate-200 bg-white px-2 py-1">
                      <p className="text-xs font-semibold text-slate-700">
                        {skill.title}
                        <span className="ml-2 font-normal text-slate-500">({skill.id})</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {skill.enabled ? 'enabled' : 'disabled'} - tools: {skill.tools.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Diff Snapshots</h2>
        <p className="mt-1 text-sm text-slate-500">
          Compare two versions to inspect changed settings, runtime config, and skills.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-medium text-slate-500">
            From
            <select
              value={diffFromId}
              onChange={(event) => setDiffFromId(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
            >
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  v{snapshot.version} - {snapshot.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-500">
            To
            <select
              value={diffToId}
              onChange={(event) => setDiffToId(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
            >
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  v{snapshot.version} - {snapshot.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void handleCompare()}
            disabled={!diffFromId || !diffToId || isComparing}
            className="mt-[18px] h-10 rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
          >
            {isComparing ? 'Comparing...' : 'Compare'}
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {diffChanges.length === 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
              No diff loaded or snapshots are identical.
            </p>
          )}

          {diffChanges.map((change, index) => (
            <article key={`${change.path}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="font-mono text-xs text-slate-700">{change.path}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Before</p>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-slate-600">{change.before ?? 'null'}</pre>
                </div>
                <div className="rounded border border-slate-200 bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">After</p>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-slate-600">{change.after ?? 'null'}</pre>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
