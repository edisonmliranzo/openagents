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

interface WorkflowPreset {
  id: string
  title: string
  description: string
  highlights: string[]
  draft: CreateWorkflowInput
  sampleInput: Record<string, unknown>
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'research-chain',
    title: 'Research Chain',
    description: 'Sequential pipeline that gathers sources, synthesizes them, and stores a note.',
    highlights: ['LangChain-style pipeline', 'templated tool input', 'captured outputs'],
    draft: {
      name: 'Research Chain',
      description: 'Gather web research, summarize it, and persist a reusable note.',
      enabled: true,
      trigger: { kind: 'manual' },
      steps: [
        {
          id: 'seed-topic',
          type: 'set_state',
          label: 'Seed workflow state',
          statePatch: {
            topic: '{{input.topic}}',
            request: '{{input.request}}',
          },
        },
        {
          id: 'search-web',
          type: 'tool_call',
          label: 'Search the web',
          toolName: 'web_search',
          input: {
            query: '{{state.topic}}',
            count: 5,
          },
          outputKey: 'research.search',
        },
        {
          id: 'summarize',
          type: 'agent_prompt',
          label: 'Summarize findings',
          prompt: [
            'You are summarizing research results for a workflow.',
            'Request: {{state.request}}',
            'Search results JSON:',
            '{{state.research.search}}',
            'Produce a concise summary with the strongest sources first.',
          ].join('\n\n'),
          outputKey: 'research.summary',
        },
        {
          id: 'store-note',
          type: 'tool_call',
          label: 'Store summary as note',
          toolName: 'notes_create',
          input: {
            content: 'Research summary for {{state.topic}}:\n\n{{state.research.summary}}',
          },
          outputKey: 'research.note',
        },
      ],
    },
    sampleInput: {
      topic: 'LangChain LangGraph agentic workflows',
      request:
        'Compare LangChain and LangGraph for a developer evaluating stateful agent orchestration.',
    },
  },
  {
    id: 'stateful-graph',
    title: 'Stateful Graph',
    description:
      'Branching workflow that loops decision-making through shared state instead of hardcoded steps.',
    highlights: ['graph branch', 'shared state', 'conditional routing'],
    draft: {
      name: 'Stateful Graph Workflow',
      description:
        'Branch based on live search output and route into synthesis or fallback handling.',
      enabled: true,
      trigger: { kind: 'manual' },
      steps: [
        {
          id: 'capture-request',
          type: 'set_state',
          label: 'Capture request',
          statePatch: {
            topic: '{{input.topic}}',
            ask: '{{input.request}}',
          },
        },
        {
          id: 'run-search',
          type: 'tool_call',
          label: 'Collect search results',
          toolName: 'web_search',
          input: {
            query: '{{state.topic}}',
            count: 4,
          },
          outputKey: 'graph.search',
        },
        {
          id: 'branch-on-results',
          type: 'branch_condition',
          label: 'Did search return URLs?',
          conditionSource: 'state',
          conditionPath: 'graph.search.results',
          conditionOperator: 'contains',
          conditionValue: 'http',
          ifTrueStepId: 'write-answer',
          ifFalseStepId: 'save-follow-up',
          outputKey: 'graph.has_results',
        },
        {
          id: 'write-answer',
          type: 'agent_prompt',
          label: 'Write answer from state',
          prompt: [
            'Use the workflow state below to answer the request.',
            'Request: {{state.ask}}',
            'State JSON:',
            '{{state.graph}}',
            'Respond with a concise action-oriented answer.',
          ].join('\n\n'),
          outputKey: 'graph.answer',
        },
        {
          id: 'save-follow-up',
          type: 'tool_call',
          label: 'Create follow-up note',
          toolName: 'notes_create',
          input: {
            content:
              'Follow up research needed for {{state.topic}}. Original request: {{state.ask}}',
          },
          outputKey: 'graph.follow_up_note',
        },
      ],
    },
    sampleInput: {
      topic: 'Open-source AI agent frameworks',
      request: 'Find whether there are enough current sources to brief the team today.',
    },
  },
  {
    id: 'approval-gate',
    title: 'Approval Gate',
    description:
      'Human-in-the-loop flow that pauses until an approval key is supplied and then continues with templated state.',
    highlights: ['approval checkpoint', 'manual resume', 'state propagation'],
    draft: {
      name: 'Approval Gate Workflow',
      description:
        'Require an explicit approval checkpoint before the workflow commits its final action.',
      enabled: true,
      trigger: { kind: 'manual' },
      steps: [
        {
          id: 'plan-state',
          type: 'set_state',
          label: 'Store proposed action',
          statePatch: {
            task: '{{input.task}}',
            owner: '{{input.owner}}',
          },
        },
        {
          id: 'confirm-human',
          type: 'wait_approval',
          label: 'Wait for approval',
          approvalKey: 'ops-confirm',
        },
        {
          id: 'persist-task',
          type: 'tool_call',
          label: 'Persist approved task',
          toolName: 'notes_create',
          input: {
            content: 'Approved task for {{state.owner}}: {{state.task}}',
          },
          outputKey: 'ops.note',
        },
        {
          id: 'report-back',
          type: 'agent_prompt',
          label: 'Generate completion message',
          prompt: [
            'Report that the approved workflow action completed.',
            'Task: {{state.task}}',
            'Owner: {{state.owner}}',
            'Saved note: {{state.ops.note}}',
          ].join('\n\n'),
          outputKey: 'ops.summary',
        },
      ],
    },
    sampleInput: {
      task: 'Schedule vendor contract review follow-up',
      owner: 'operations',
    },
  },
  {
    id: 'inbox-auto-triage',
    title: 'Inbox Auto-Triage',
    description:
      'Event-driven inbox workflow that classifies a new message and writes a follow-up note for operations.',
    highlights: ['inbox trigger', 'event payloads', 'routing-ready automation'],
    draft: {
      name: 'Inbox Auto-Triage',
      description: 'Trigger from an inbox event and summarize the inbound message into workflow state.',
      enabled: true,
      trigger: { kind: 'inbox_event', eventName: 'channel.message.received' },
      steps: [
        {
          id: 'capture-inbox-event',
          type: 'set_state',
          label: 'Capture inbound event',
          statePatch: {
            channel: '{{input.channel}}',
            sender: '{{input.sender}}',
            body: '{{input.body}}',
          },
        },
        {
          id: 'classify-inbox',
          type: 'agent_prompt',
          label: 'Classify the inbound request',
          prompt: [
            'Classify the inbound message into urgency and next action.',
            'Channel: {{state.channel}}',
            'Sender: {{state.sender}}',
            'Body: {{state.body}}',
            'Respond with a concise triage note.',
          ].join('\n\n'),
          outputKey: 'triage.summary',
        },
        {
          id: 'persist-triage-note',
          type: 'tool_call',
          label: 'Persist triage summary',
          toolName: 'notes_create',
          input: {
            content:
              'Inbox automation summary\nChannel: {{state.channel}}\nSender: {{state.sender}}\n\n{{state.triage.summary}}',
          },
          outputKey: 'triage.note',
        },
      ],
    },
    sampleInput: {
      channel: 'slack',
      sender: 'ops-lead',
      body: 'Customer says the checkout webhook is timing out for enterprise accounts.',
    },
  },
]

const DEFAULT_PRESET = WORKFLOW_PRESETS[0]

function defaultDraft(): CreateWorkflowInput {
  return cloneJson(DEFAULT_PRESET.draft)
}

function defaultRunInput() {
  return cloneJson(DEFAULT_PRESET.sampleInput)
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
  return JSON.stringify(value ?? {}, null, 2)
}

function previewJson(value: unknown, maxLength = 1400) {
  const serialized = safeJson(value)
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized
}

function parseJsonObject(raw: string, label: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

export default function WorkflowsPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [draftJson, setDraftJson] = useState(safeJson(defaultDraft()))
  const [runInputJson, setRunInputJson] = useState(safeJson(defaultRunInput()))
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [rerunningRunId, setRerunningRunId] = useState<string | null>(null)
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
        setRunInputJson(safeJson(defaultRunInput()))
        setRuns([])
      } else if (
        !selectedWorkflowId ||
        !list.some((workflow) => workflow.id === selectedWorkflowId)
      ) {
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
    setRunInputJson(safeJson(defaultRunInput()))
    setRuns([])
    setError('')
  }

  function handleApplyPreset(preset: WorkflowPreset) {
    setSelectedWorkflowId(null)
    setDraftJson(safeJson(cloneJson(preset.draft)))
    setRunInputJson(safeJson(cloneJson(preset.sampleInput)))
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
        setWorkflows((prev) =>
          prev.map((workflow) => (workflow.id === updated.id ? updated : workflow)),
        )
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

  async function handleRun(input: { mode: 'manual' | 'webhook' }) {
    if (!selectedWorkflowId) return
    setIsRunning(true)
    setError('')
    try {
      const workflowInput = parseJsonObject(runInputJson, 'Run input')
      const payload =
        input.mode === 'webhook'
          ? {
              triggerKind: 'webhook' as const,
              webhookSecret: selectedWorkflow?.trigger.webhookSecret?.trim() ?? '',
              input: workflowInput,
            }
          : {
              triggerKind: 'manual' as const,
              input: workflowInput,
            }

      if (input.mode === 'webhook' && !payload.webhookSecret) {
        throw new Error('Selected workflow has no webhook secret configured.')
      }

      const run = await sdk.workflows.run(selectedWorkflowId, payload)
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

  async function handleRerun(runId: string) {
    if (!selectedWorkflowId) return
    setRerunningRunId(runId)
    setError('')
    try {
      const rerun = await sdk.workflows.rerun(selectedWorkflowId, runId)
      const nextRuns = await sdk.workflows.listRuns(selectedWorkflowId, 25)
      setRuns(nextRuns)
      addToast('success', `Workflow rerun queued as ${rerun.status}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to rerun workflow'
      setError(message)
      addToast('error', message)
    } finally {
      setRerunningRunId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Workflow Builder</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Build chain-style pipelines and graph-style workflows with templated prompts, shared
            state, manual inputs, approval gates, and reusable outputs.
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

      <section className="grid gap-4 xl:grid-cols-3">
        {WORKFLOW_PRESETS.map((preset) => (
          <article
            key={preset.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{preset.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{preset.description}</p>
              </div>
              <button
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                Load preset
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {preset.highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {highlight}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Workflows</h2>
          <p className="mt-1 text-sm text-slate-500">{workflows.length} saved workflows.</p>

          <div className="mt-3 space-y-2">
            {workflows.length === 0 && (
              <p className="text-sm text-slate-500">
                No workflows yet. Load a preset or create one from the editor.
              </p>
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Editor (JSON)</h2>
              <p className="mt-1 text-sm text-slate-500">
                Use <code>{'{{input.topic}}'}</code>, <code>{'{{state.research.summary}}'}</code>,{' '}
                <code>outputKey</code>, and <code>set_state</code> to build stateful workflows
                without custom code.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Branch steps can now read from `run_input` or `state`, and each step can capture its
              output into shared state for later reuse.
            </div>
          </div>

          <textarea
            value={draftJson}
            onChange={(event) => setDraftJson(event.target.value)}
            rows={20}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
          />

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Run Input (JSON)</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Manual and webhook runs can inject input that templates reference as{' '}
                  <code>{'{{input.*}}'}</code>.
                </p>
              </div>
            </div>
            <textarea
              value={runInputJson}
              onChange={(event) => setRunInputJson(event.target.value)}
              rows={8}
              className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : selectedWorkflowId ? 'Update Workflow' : 'Create Workflow'}
            </button>

            <button
              type="button"
              onClick={() => void handleRun({ mode: 'manual' })}
              disabled={!selectedWorkflowId || isRunning}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {isRunning ? 'Running...' : 'Run Now'}
            </button>

            <button
              type="button"
              onClick={() => void handleRun({ mode: 'webhook' })}
              disabled={
                !selectedWorkflowId || isRunning || selectedWorkflow?.trigger.kind !== 'webhook'
              }
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
          {runs.length === 0 && <p className="text-sm text-slate-500">No runs yet.</p>}
          {runs.map((run) => {
            const stateWrites = [
              ...new Set(run.stepResults.flatMap((step) => step.stateWrites ?? [])),
            ].slice(0, 8)
            return (
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
                {run.rerunOfRunId && (
                  <p className="mt-1 text-xs text-slate-500">rerun of: {run.rerunOfRunId}</p>
                )}
                {run.resumeStepId && (
                  <p className="mt-1 text-xs text-slate-500">resume cursor: {run.resumeStepId}</p>
                )}
                {stateWrites.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    state writes: {stateWrites.join(', ')}
                  </p>
                )}
                {run.error && <p className="mt-1 text-xs text-red-600">{run.error}</p>}
                {run.status === 'error' && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void handleRerun(run.id)}
                      disabled={rerunningRunId === run.id}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {rerunningRunId === run.id ? 'Rerunning...' : 'Rerun with saved input'}
                    </button>
                  </div>
                )}

                {(run.input || run.state) && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {run.input && (
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Input
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">
                          {previewJson(run.input)}
                        </pre>
                      </div>
                    )}
                    {run.state && (
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          State
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">
                          {previewJson(run.state)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
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
