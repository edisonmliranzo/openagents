'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  CreatePlaybookInput,
  PlaybookDefinition,
  PlaybookRun,
  UpdatePlaybookInput,
} from '@openagents/shared'

function defaultDraft(): CreatePlaybookInput {
  return {
    name: 'Research Brief',
    description: 'Generate a concise brief using reusable playbook parameters.',
    targetKind: 'agent_prompt',
    parameterSchema: [
      {
        key: 'topic',
        label: 'Topic',
        type: 'text',
        required: true,
        description: 'Topic to analyze',
      },
      {
        key: 'audience',
        label: 'Audience',
        type: 'text',
        required: false,
        defaultValue: 'product team',
      },
    ],
    promptTemplate: [
      'Create a concise research brief on {{topic}} for {{audience}}.',
      'Output: summary, key insights, risks, and next actions.',
    ].join('\n'),
    workflowTemplate: null,
  }
}

function toEditableInput(playbook: PlaybookDefinition): UpdatePlaybookInput {
  return {
    name: playbook.name,
    description: playbook.description,
    targetKind: playbook.targetKind,
    parameterSchema: playbook.parameterSchema,
    promptTemplate: playbook.promptTemplate,
    workflowTemplate: playbook.workflowTemplate,
  }
}

function asJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export default function PlaybooksPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [playbooks, setPlaybooks] = useState<PlaybookDefinition[]>([])
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null)
  const [runs, setRuns] = useState<PlaybookRun[]>([])
  const [draftJson, setDraftJson] = useState(asJson(defaultDraft()))
  const [paramsJson, setParamsJson] = useState('{}')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const selectedPlaybook = useMemo(
    () => playbooks.find((playbook) => playbook.id === selectedPlaybookId) ?? null,
    [playbooks, selectedPlaybookId],
  )

  const loadPlaybooks = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await sdk.playbooks.list()
      setPlaybooks(list)
      if (list.length === 0) {
        setSelectedPlaybookId(null)
        setDraftJson(asJson(defaultDraft()))
        setRuns([])
        return
      }

      const selected = selectedPlaybookId
        ? list.find((playbook) => playbook.id === selectedPlaybookId) ?? list[0]
        : list[0]
      setSelectedPlaybookId(selected.id)
      setDraftJson(asJson(toEditableInput(selected)))
      const nextRuns = await sdk.playbooks.listRuns(selected.id, 25)
      setRuns(nextRuns)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load playbooks'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, selectedPlaybookId])

  useEffect(() => {
    void loadPlaybooks()
  }, [loadPlaybooks])

  async function handleSelectPlaybook(playbook: PlaybookDefinition) {
    setSelectedPlaybookId(playbook.id)
    setDraftJson(asJson(toEditableInput(playbook)))
    setError('')
    try {
      const nextRuns = await sdk.playbooks.listRuns(playbook.id, 25)
      setRuns(nextRuns)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load playbook runs'
      setError(message)
      addToast('error', message)
    }
  }

  function handleNewDraft() {
    setSelectedPlaybookId(null)
    setDraftJson(asJson(defaultDraft()))
    setParamsJson('{}')
    setRuns([])
    setError('')
  }

  async function handleSave() {
    setIsSaving(true)
    setError('')
    try {
      const parsed = JSON.parse(draftJson) as CreatePlaybookInput
      if (selectedPlaybookId) {
        const updated = await sdk.playbooks.update(selectedPlaybookId, parsed)
        setPlaybooks((prev) => prev.map((playbook) => (
          playbook.id === updated.id ? updated : playbook
        )))
        setDraftJson(asJson(toEditableInput(updated)))
        addToast('success', 'Playbook updated')
      } else {
        const created = await sdk.playbooks.create(parsed)
        setPlaybooks((prev) => [created, ...prev])
        setSelectedPlaybookId(created.id)
        setDraftJson(asJson(toEditableInput(created)))
        addToast('success', 'Playbook created')
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to save playbook'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRun() {
    if (!selectedPlaybookId) return
    setIsRunning(true)
    setError('')
    try {
      const params = JSON.parse(paramsJson) as Record<string, unknown>
      const run = await sdk.playbooks.run(selectedPlaybookId, { params })
      setRuns((prev) => [run, ...prev].slice(0, 50))
      addToast('success', `Playbook run ${run.status}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to run playbook'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRunning(false)
    }
  }

  async function handleDelete() {
    if (!selectedPlaybookId) return
    setIsDeleting(true)
    setError('')
    try {
      await sdk.playbooks.remove(selectedPlaybookId)
      const next = playbooks.filter((playbook) => playbook.id !== selectedPlaybookId)
      setPlaybooks(next)
      if (next.length > 0) {
        await handleSelectPlaybook(next[0])
      } else {
        handleNewDraft()
      }
      addToast('success', 'Playbook deleted')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to delete playbook'
      setError(message)
      addToast('error', message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Playbook Runs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build reusable templates and launch parameterized runs in one click.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadPlaybooks()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={handleNewDraft}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600"
          >
            New Playbook
          </button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Playbooks</h2>
          <p className="mt-1 text-sm text-slate-500">{playbooks.length} saved playbooks.</p>

          <div className="mt-3 space-y-2">
            {playbooks.length === 0 && (
              <p className="text-sm text-slate-500">No playbooks yet. Create one from the editor.</p>
            )}
            {playbooks.map((playbook) => (
              <button
                key={playbook.id}
                type="button"
                onClick={() => void handleSelectPlaybook(playbook)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  playbook.id === selectedPlaybookId
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{playbook.name}</p>
                <p className="mt-1 text-xs text-slate-500">target: {playbook.targetKind}</p>
                <p className="mt-1 text-xs text-slate-500">params: {playbook.parameterSchema.length}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Editor (JSON)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Edit playbook payload directly. Save to create or update.
          </p>

          <textarea
            value={draftJson}
            onChange={(event) => setDraftJson(event.target.value)}
            rows={18}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
          />

          <label className="mt-3 block text-xs font-medium text-slate-500">
            Run parameters JSON
            <textarea
              value={paramsJson}
              onChange={(event) => setParamsJson(event.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : (selectedPlaybookId ? 'Update Playbook' : 'Create Playbook')}
            </button>
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={!selectedPlaybookId || isRunning}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              {isRunning ? 'Running...' : 'Run Playbook'}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!selectedPlaybookId || isDeleting}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recent Runs</h2>
        <p className="mt-1 text-sm text-slate-500">
          {selectedPlaybook
            ? `Run history for ${selectedPlaybook.name}.`
            : 'Select a playbook to inspect runs.'}
        </p>

        <div className="mt-3 space-y-2">
          {runs.length === 0 && (
            <p className="text-sm text-slate-500">No runs yet.</p>
          )}
          {runs.map((run) => (
            <article key={run.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs text-slate-700">{run.id}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    run.status === 'done'
                      ? 'bg-emerald-100 text-emerald-700'
                      : run.status === 'error'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {run.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">started: {run.startedAt}</p>
              {run.outputSummary && (
                <p className="mt-1 text-xs text-slate-600">{run.outputSummary}</p>
              )}
              {run.error && (
                <p className="mt-1 text-xs text-red-600">{run.error}</p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">input</summary>
                <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                  {JSON.stringify(run.input, null, 2)}
                </pre>
              </details>
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
