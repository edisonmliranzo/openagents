'use client'

import { useCallback, useEffect, useState } from 'react'
import { Circle, Loader2, Play, Save, Square, Trash2, Workflow } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

interface Step { type: string; selector?: string; value?: string; url?: string }
interface Variable { name: string; description?: string; defaultValue?: string; stepIndex?: number }
interface WorkflowRow { id: string; name: string; description?: string; steps: Step[]; variables: Variable[]; createdAt: string }

/** Record / Stop / Save controls plus the saved workflows list for the /browser page. */
export function WorkflowPanel({ sessionId, onSession }: { sessionId: string; onSession: (id: string) => void }) {
  const addToast = useUIStore((s) => s.addToast)
  const api = sdk.browser as any
  const [recording, setRecording] = useState(false)
  const [recordedSteps, setRecordedSteps] = useState<Step[] | null>(null)
  const [variables, setVariables] = useState<Variable[]>([])
  const [name, setName] = useState('')
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([])
  const [busy, setBusy] = useState(false)
  const [runInputs, setRunInputs] = useState<Record<string, Record<string, string>>>({})
  const [resume, setResume] = useState<Record<string, { sessionId: string; nextStep: number }>>({})

  const load = useCallback(async () => {
    try { setWorkflows(await api.listWorkflows()) } catch { /* ignore */ }
  }, [api])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!sessionId) { setRecording(false); return }
    api.recordingStatus(sessionId).then((s: any) => setRecording(!!s?.recording)).catch(() => setRecording(false))
  }, [sessionId, api])

  async function start() {
    if (!sessionId) return
    setBusy(true)
    try {
      await api.startRecording(sessionId)
      setRecording(true)
      setRecordedSteps(null)
      addToast('info', 'Recording - actions you perform are captured')
    } catch (e: any) { addToast('error', e?.message ?? 'Failed to start recording') } finally { setBusy(false) }
  }

  async function stop() {
    setBusy(true)
    try {
      const res = await api.stopRecording(sessionId)
      setRecording(false)
      setRecordedSteps(res.steps ?? [])
      setVariables(res.suggestedVariables ?? [])
    } catch (e: any) { addToast('error', e?.message ?? 'Failed to stop recording') } finally { setBusy(false) }
  }

  async function save() {
    if (!name.trim() || !recordedSteps?.length) return
    setBusy(true)
    try {
      await api.saveWorkflow({ name: name.trim(), sessionId, steps: recordedSteps, variables })
      setRecordedSteps(null); setVariables([]); setName('')
      addToast('success', 'Workflow saved')
      await load()
    } catch (e: any) { addToast('error', e?.message ?? 'Save failed') } finally { setBusy(false) }
  }

  async function run(wf: WorkflowRow) {
    setBusy(true)
    try {
      const r = resume[wf.id]
      const res = await api.runWorkflow(wf.id, {
        inputs: runInputs[wf.id] ?? {},
        sessionId: r?.sessionId ?? (sessionId || undefined),
        fromStep: r?.nextStep,
      })
      onSession(res.sessionId)
      if (res.status === 'paused_for_approval') {
        setResume((m) => ({ ...m, [wf.id]: { sessionId: res.sessionId, nextStep: res.nextStep } }))
        addToast('warning', 'Paused: approve the pending action, then press Resume')
      } else {
        setResume((m) => { const n = { ...m }; delete n[wf.id]; return n })
        addToast(res.status === 'completed' ? 'success' : 'error', `Workflow ${res.status} (${res.completedSteps} steps)`)
      }
    } catch (e: any) { addToast('error', e?.message ?? 'Run failed') } finally { setBusy(false) }
  }

  async function remove(id: string) {
    try { await api.deleteWorkflow(id); await load() } catch (e: any) { addToast('error', e?.message ?? 'Delete failed') }
  }

  const input = 'w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-700'

  return (
    <section className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium"><Workflow className="h-4 w-4" /> Workflows</h2>
        {recording ? (
          <button onClick={() => void stop()} disabled={busy}
            className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-40">
            <Square className="h-3 w-3" /> Stop
          </button>
        ) : (
          <button onClick={() => void start()} disabled={!sessionId || busy}
            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700">
            <Circle className="h-3 w-3 fill-red-500 text-red-500" /> Record
          </button>
        )}
      </div>
      {recording && <div className="animate-pulse text-xs text-red-500">Recording actions…</div>}

      {recordedSteps && (
        <div className="space-y-1.5 rounded bg-slate-50 p-2 dark:bg-slate-900">
          <div className="text-xs text-slate-500">{recordedSteps.length} steps recorded</div>
          {variables.map((v, i) => (
            <div key={i} className="flex items-center gap-1 text-xs">
              <input className={input} value={v.name}
                onChange={(e) => setVariables((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <span className="shrink-0 text-slate-400" title={v.description}>step {(v.stepIndex ?? 0) + 1}</span>
              <button onClick={() => setVariables((vs) => vs.filter((_, j) => j !== i))} className="text-slate-400"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          <input className={input} placeholder="Workflow name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-1">
            <button onClick={() => void save()} disabled={busy || !name.trim() || !recordedSteps.length}
              className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-40">
              <Save className="h-3 w-3" /> Save
            </button>
            <button onClick={() => setRecordedSteps(null)} className="rounded px-2 py-1 text-xs text-slate-500">Discard</button>
          </div>
        </div>
      )}

      <div className="max-h-56 space-y-1.5 overflow-auto">
        {workflows.length === 0 && <div className="text-xs text-slate-400">No saved workflows.</div>}
        {workflows.map((wf) => (
          <div key={wf.id} className="space-y-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-800">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-medium" title={wf.description}>{wf.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => void run(wf)} disabled={busy}
                  className="flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-white disabled:opacity-40">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  {resume[wf.id] ? 'Resume' : 'Run'}
                </button>
                <button onClick={() => void remove(wf.id)} className="text-slate-400"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="text-slate-400">{wf.steps.length} steps</div>
            {wf.variables.map((v) => (
              <input key={v.name} className={input} placeholder={`${v.name}${v.defaultValue ? ` (${v.defaultValue})` : ''}`}
                value={runInputs[wf.id]?.[v.name] ?? ''}
                onChange={(e) => setRunInputs((m) => ({ ...m, [wf.id]: { ...(m[wf.id] ?? {}), [v.name]: e.target.value } }))} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
