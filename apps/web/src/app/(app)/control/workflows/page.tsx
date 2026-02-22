'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowDefinition,
  WorkflowRun,
} from '@openagents/shared'

function defaultDraft(): CreateWorkflowInput {
  return {
    name: 'New Workflow',
    description: 'Describe what this workflow automates.',
    enabled: true,
    trigger: { kind: 'manual' },
    steps: [
      {
        id: 'step-agent-1',
        type: 'agent_prompt',
        label: 'Plan task',
        prompt: 'Summarize objective and prepare execution plan.',
      },
      {
        id: 'step-delay-1',
        type: 'delay',
        label: 'Short wait',
        delayMs: 1000,
      },
      {
        id: 'step-tool-1',
        type: 'tool_call',
        label: 'Store note',
        toolName: 'notes_create',
        input: { title: 'Workflow note', content: 'Created from workflow run.' },
      },
    ],
  }
}

function toEditableInput(workflow: WorkflowDefinition): UpdateWorkflowInput {
  return {
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    trigger: workflow.trigger,
    steps: workflow.steps,
  }
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export default function WorkflowsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [draftJson, setDraftJson] = useState(safeJson(defaultDraft()))
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId],
  )

  const loadWorkflows = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await sdk.workflows.list()
      setWorkflows(list)
      if (list.length === 0) {
        setSelectedWorkflowId(null)
        setDraftJson(safeJson(defaultDraft()))
        setRuns([])
      } else if (!selectedWorkflowId || !list.some((workflow) => workflow.id === selectedWorkflowId)) {
        const first = list[0]
        setSelectedWorkflowId(first.id)
        setDraftJson(safeJson(toEditableInput(first)))
        const nextRuns = await sdk.workflows.listRuns(first.id, 25)
        setRuns(nextRuns)
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load workflows'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, selectedWorkflowId])

  useEffect(() => {
    void loadWorkflows()
  }, [loadWorkflows])

  async function handleSelectWorkflow(workflow: WorkflowDefinition) {
    setSelectedWorkflowId(workflow.id)
    setDraftJson(safeJson(toEditableInput(workflow)))
    setError('')
    try {
      const nextRuns = await sdk.workflows.listRuns(workflow.id, 25)
      setRuns(nextRuns)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load workflow runs'
      setError(message)
      addToast('error', message)
    }
  }

  function handleNewDraft() {
    setSelectedWorkflowId(null)
    setDraftJson(safeJson(defaultDraft()))
    setRuns([])
    setError('')
  }

  async function handleSave() {
    setIsSaving(true)
    setError('')
    try {
      const parsed = JSON.parse(draftJson) as CreateWorkflowInput
      if (selectedWorkflowId) {
        const updated = await sdk.workflows.update(selectedWorkflowId, parsed)
        setWorkflows((prev) => prev.map((workflow) => (
          workflow.id === updated.id ? updated : workflow
        )))
        setDraftJson(safeJson(toEditableInput(updated)))
        addToast('success', 'Workflow updated')
      } else {
        const created = await sdk.workflows.create(parsed)
        setWorkflows((prev) => [created, ...prev])
        setSelectedWorkflowId(created.id)
        setDraftJson(safeJson(toEditableInput(created)))
        setRuns([])
        addToast('success', 'Workflow created')
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to save workflow'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRunManual() {
    if (!selectedWorkflowId) return
    setIsRunning(true)
    setError('')
    try {
      const run = await sdk.workflows.run(selectedWorkflowId, { triggerKind: 'manual' })
      setRuns((prev) => [run, ...prev].slice(0, 50))
      const refreshed = await sdk.workflows.list()
      setWorkflows(refreshed)
      addToast('success', `Workflow run ${run.status}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to run workflow'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRunning(false)
    }
  }

  async function handleRunWebhook() {
    if (!selectedWorkflowId || !selectedWorkflow) return
    const secret = selectedWorkflow.trigger.webhookSecret?.trim() ?? ''
    if (!secret) {
      setError('Selected workflow has no webhook secret configured.')
      return
    }
    setIsRunning(true)
    setError('')
    try {
      const run = await sdk.workflows.triggerWebhook(selectedWorkflowId, secret)
      setRuns((prev) => [run, ...prev].slice(0, 50))
      addToast('success', `Webhook run ${run.status}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to trigger webhook run'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRunning(false)
    }
  }

  async function handleDelete() {
    if (!selectedWorkflowId) return
    setIsDeleting(true)
    setError('')
    try {
      await sdk.workflows.remove(selectedWorkflowId)
      const next = workflows.filter((workflow) => workflow.id !== selectedWorkflowId)
      setWorkflows(next)
      if (next.length > 0) {
        await handleSelectWorkflow(next[0])
      } else {
        handleNewDraft()
      }
      addToast('success', 'Workflow deleted')
    } catch (err: any) {
      const message = err?.message ?? 'Failed to delete workflow'
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
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Workflow Builder</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build and run multi-step automation flows with manual, schedule, and webhook triggers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadWorkflows()}
            disabled={isLoading}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={handleNewDraft}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            New Workflow
          </button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Workflows</h2>
          <p className="mt-1 text-sm text-slate-500">{workflows.length} saved workflows.</p>

          <div className="mt-3 space-y-2">
            {workflows.length === 0 && (
              <p className="text-sm text-slate-500">No workflows yet. Create one from the draft editor.</p>
            )}
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                type="button"
                onClick={() => void handleSelectWorkflow(workflow)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  workflow.id === selectedWorkflowId
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{workflow.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  trigger: {workflow.trigger.kind}
                  {workflow.trigger.kind === 'schedule' && workflow.trigger.everyMinutes
                    ? ` (${workflow.trigger.everyMinutes}m)`
                    : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {workflow.enabled ? 'enabled' : 'disabled'} - steps: {workflow.steps.length}
                </p>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Editor (JSON)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Edit workflow payload directly. Save to create/update.
          </p>

          <textarea
            value={draftJson}
            onChange={(event) => setDraftJson(event.target.value)}
            rows={22}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : (selectedWorkflowId ? 'Update Workflow' : 'Create Workflow')}
            </button>

            <button
              type="button"
              onClick={() => void handleRunManual()}
              disabled={!selectedWorkflowId || isRunning}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {isRunning ? 'Running...' : 'Run Now'}
            </button>

            <button
              type="button"
              onClick={() => void handleRunWebhook()}
              disabled={!selectedWorkflowId || isRunning || selectedWorkflow?.trigger.kind !== 'webhook'}
              className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
            >
              Trigger Webhook
            </button>

            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!selectedWorkflowId || isDeleting}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recent Runs</h2>
        <p className="mt-1 text-sm text-slate-500">
          {selectedWorkflowId
            ? `Showing run history for ${selectedWorkflow?.name ?? selectedWorkflowId}.`
            : 'Select a workflow to inspect runs.'}
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
              <p className="mt-1 text-xs text-slate-500">
                trigger: {run.triggerKind} - steps: {run.stepResults.length}
              </p>
              <p className="mt-1 text-xs text-slate-500">started: {run.startedAt}</p>
              {run.error && <p className="mt-1 text-xs text-red-600">{run.error}</p>}
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
