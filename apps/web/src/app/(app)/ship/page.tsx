'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitCommit,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import type { ShipPipelineRun } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

export default function ShipPipelinePage() {
  const addToast = useUIStore((s) => s.addToast)
  const [pipelines, setPipelines] = useState<ShipPipelineRun[]>([])
  const [loading, setLoading] = useState(false)
  const [shipping, setShipping] = useState(false)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)

  const [title, setTitle] = useState('Deploy Sub-Second Streaming & 10 Next-Gen Agentic Systems')
  const [promptOrDiff, setPromptOrDiff] = useState(
    'Verify @openagents/sdk + @openagents/api + @openagents/web compile cleanly, run Secret-Zero preflight, and deploy to https://openagents.us',
  )

  const loadPipelines = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getShipPipelines()
      setPipelines(res.pipelines)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Ship Pipelines')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadPipelines()
  }, [loadPipelines])

  async function handleRunPipeline(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !promptOrDiff.trim()) {
      addToast('warning', 'Release title and prompt/diff specification are required')
      return
    }
    setShipping(true)
    try {
      const created = await sdk.agenticSuite.runShipPipeline({
        title: title.trim(),
        promptOrDiff: promptOrDiff.trim(),
      })
      setPipelines((prev) => [created, ...prev])
      addToast('success', `Shipped ${created.title} (${created.commitSha}) to production`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Ship pipeline execution failed')
    } finally {
      setShipping(false)
    }
  }

  async function handleRollback(pipelineId: string) {
    setRollingBackId(pipelineId)
    try {
      const updated = await sdk.agenticSuite.rollbackShipPipeline(pipelineId)
      setPipelines((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      addToast('warning', `Rolled back release ${updated.commitSha} to previous atomic checkpoint`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Rollback failed')
    } finally {
      setRollingBackId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              OpenAgents 1-Click Prompt-to-Production Ship Pipeline
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automated Secret-Zero preflight, TypeScript AST verification, Red-Team invariant gate, Cloudflare edge rollout &amp; instant atomic rollback
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadPipelines()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Releases
        </button>
      </header>

      {/* Launcher */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Launch New Prompt-to-Production Release Pipeline
            </h2>
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Zero-Downtime Edge Gate Active
          </span>
        </div>

        <form onSubmit={handleRunPipeline} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Release Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Prompt Specification or Diff Summary
            </label>
            <textarea
              rows={2}
              value={promptOrDiff}
              onChange={(e) => setPromptOrDiff(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={shipping || !title.trim() || !promptOrDiff.trim()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {shipping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Execute 1-Click Ship Pipeline
          </button>
        </form>
      </section>

      {/* Pipeline Runs */}
      <div className="space-y-4">
        {pipelines.map((run) => (
          <section
            key={run.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      run.status === 'deployed'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {run.status === 'deployed' ? 'Live in Production' : 'Rolled Back'}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {run.title}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {run.promptOrDiff}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-indigo-400">
                    <GitBranch className="h-3.5 w-3.5" />
                    {run.branchName}
                  </span>
                  <span className="flex items-center gap-1 text-cyan-400">
                    <GitCommit className="h-3.5 w-3.5" />
                    {run.commitSha}
                  </span>
                  <span>{new Date(run.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={run.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Preview Edge
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={run.productionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
                >
                  Production ({run.productionUrl})
                  <ExternalLink className="h-3 w-3" />
                </a>
                {run.status === 'deployed' && (
                  <button
                    type="button"
                    onClick={() => void handleRollback(run.id)}
                    disabled={rollingBackId === run.id}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    {rollingBackId === run.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Rollback Canary
                  </button>
                )}
              </div>
            </div>

            {/* Pipeline Steps Progress */}
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {run.steps.map((step) => (
                <div
                  key={step.name}
                  className={`rounded-xl border p-3 ${
                    step.status === 'passed'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : step.status === 'rolled_back'
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {step.name}
                    </span>
                    <CheckCircle2
                      className={`h-3.5 w-3.5 shrink-0 ${
                        step.status === 'passed' ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {step.detail}
                  </p>
                  <div className="mt-1.5 font-mono text-[10px] text-cyan-400">
                    {step.durationMs}ms · {step.status.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
