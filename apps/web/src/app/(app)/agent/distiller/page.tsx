'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { DistillerState, DistilledTrajectorySample } from '@openagents/sdk'
import {
  BrainCircuit,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  Database,
  Download,
  FileJson,
  Flame,
  Loader2,
  RefreshCw,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'

const FORMAT_OPTIONS: Array<{
  value: DistilledTrajectorySample['format']
  label: string
  badge: string
  description: string
}> = [
  {
    value: 'sharegpt_jsonl',
    label: 'ShareGPT Multi-Turn JSONL',
    badge: 'ShareGPT',
    description: 'Standard conversations array with system, human, and gpt turns for Axolotl / Unsloth',
  },
  {
    value: 'alpaca_jsonl',
    label: 'Alpaca Instruction JSONL',
    badge: 'Alpaca',
    description: 'Instruction / input / output triplet format for lightweight SFT & QLoRA adapters',
  },
  {
    value: 'hermes_xml_lora',
    label: 'Hermes-3 Native XML + Tool-Call LoRA',
    badge: 'Hermes XML',
    description: 'Preserves <think> reasoning traces and <tool_call> XML blocks for agentic fine-tuning',
  },
]

const DISTILL_PRESETS = [
  {
    title: 'Multi-Step SQL Schema Migration & Rollback Guard',
    userInput:
      'Inspect the Prisma PostgreSQL migration for user_sessions, detect zero-downtime lock risks, and synthesize a safe expand-and-contract SQL migration with rollback triggers.',
    format: 'hermes_xml_lora' as const,
  },
  {
    title: 'Autonomous Incident Root-Cause & Patch Synthesis',
    userInput:
      'Analyze elevated p99 latency on /api/v1/agentic/swarm-market, isolate the N+1 query bottleneck, and generate a batched DataLoader patch with unit verification.',
    format: 'sharegpt_jsonl' as const,
  },
  {
    title: 'Zero-Trust Secret Redaction & JWT Boundary Audit',
    userInput:
      'Audit outbound webhook payloads for leaked bearer tokens or PII fields and produce a deterministic Zod sanitizer middleware.',
    format: 'alpaca_jsonl' as const,
  },
]

export default function DatasetDistillerPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [state, setState] = useState<DistillerState | null>(null)
  const [loading, setLoading] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [title, setTitle] = useState(DISTILL_PRESETS[0].title)
  const [userInput, setUserInput] = useState(DISTILL_PRESETS[0].userInput)
  const [format, setFormat] = useState<DistilledTrajectorySample['format']>('hermes_xml_lora')

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sdk.agenticSuite.getDistillerState()
      setState(data)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to loadOpenAgents Dataset Distiller state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
  }, [loadState])

  const handleDistill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !userInput.trim()) return
    setDistilling(true)
    try {
      const updated = await sdk.agenticSuite.distillTrajectory({
        title: title.trim(),
        userInput: userInput.trim(),
        format,
      })
      setState(updated)
      addToast('success', 'Verified trajectory distilled into fine-tuning sample')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to distill trajectory')
    } finally {
      setDistilling(false)
    }
  }

  const copyText = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      addToast('success', `${label} copied to clipboard`)
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev))
      }, 2000)
    } catch {
      addToast('error', 'Clipboard copy failed')
    }
  }

  const handleCopyAllJsonl = () => {
    if (!state?.samples.length) return
    const fullDataset = state.samples.map((s) => s.jsonlRow).join('\n')
    void copyText('all-jsonl', fullDataset, `All ${state.samples.length} JSONL rows`)
  }

  const handleDownloadJsonl = () => {
    if (!state?.samples.length) return
    const fullDataset = state.samples.map((s) => s.jsonlRow).join('\n')
    const blob = new Blob([fullDataset], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openagents-distilled-lora-${new Date().toISOString().slice(0, 10)}.jsonl`
    a.click()
    URL.revokeObjectURL(url)
    addToast('success', 'Exported JSONL dataset file')
  }

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        {/* Futuristic Header */}
        <header className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-indigo-950/80 p-6 shadow-2xl">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                <Sparkles size={13} />
                OpenAgents Autonomous Self-Training Engine
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Autonomous Self-Training &amp; Dataset Distiller
              </h1>
              <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                Harvest verified high-reward OpenAgents reasoning traces, tool invocations, and hardened outputs into
                clean ShareGPT, Alpaca, or Hermes-3 XML JSONL datasets ready for local Unsloth / QLoRA fine-tuning.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAllJsonl}
                disabled={!state?.samples.length}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
              >
                {copiedKey === 'all-jsonl' ? <Check size={14} /> : <Copy size={14} />}
                1-Click Copy JSONL
              </button>
              <button
                type="button"
                onClick={handleDownloadJsonl}
                disabled={!state?.samples.length}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                <Download size={14} />
                Export .JSONL
              </button>
              <button
                type="button"
                onClick={() => void loadState()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Sync
              </button>
            </div>
          </div>

          {/* 4 Telemetry KPI Cards */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Total Verified Samples</span>
                <Database size={15} className="text-indigo-400" />
              </div>
              <div className="mt-1.5 text-2xl font-black text-white">
                {state?.totalSamples ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-indigo-300">
                High-reward trajectories indexed
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Avg Reward Quality</span>
                <Flame size={15} className="text-cyan-400" />
              </div>
              <div className="mt-1.5 text-2xl font-black text-cyan-300">
                {state?.avgQualityScore ?? 0}%
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Critic + deterministic verifier gated
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>LoRA Fine-Tune Readiness</span>
                <CheckCircle2 size={15} className="text-emerald-400" />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    state?.readyForLoraFineTune
                      ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {state?.readyForLoraFineTune ? 'READY FOR LORA' : 'COLLECTING SAMPLES'}
                </span>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-400">
                Unsloth / Axolotl QLoRA 4-bit pipeline
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Target Local Student Model</span>
                <Cpu size={15} className="text-violet-400" />
              </div>
              <div className="mt-1.5 truncate font-mono text-sm font-bold text-violet-300">
                {state?.targetLocalModel ?? 'Qwen-2.5-Coder-14B-Instruct-LoRA'}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Local Ollama / vLLM student weights
              </div>
            </div>
          </div>
        </header>

        {/* Distillation Synthesis Form */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                <BrainCircuit size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-white">
                  Distill New Verified Trajectory into SFT / LoRA Sample
                </h2>
                <p className="text-xs text-slate-400">
                  Synthesizes a gold-standard reasoning trace, tool call payload, verified output, and formatted JSONL row
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DISTILL_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    setTitle(preset.title)
                    setUserInput(preset.userInput)
                    setFormat(preset.format)
                  }}
                  className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  Preset: {preset.title.split(' ').slice(0, 3).join(' ')}…
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleDistill} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Trajectory Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Autonomous Prisma Schema Migration & Zero-Downtime Verification"
                  className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/90 px-3.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Fine-Tuning Dataset Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as DistilledTrajectorySample['format'])}
                  className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/90 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                >
                  {FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                User Task Prompt / Trajectory Input
              </label>
              <textarea
                rows={3}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Describe the complex engineering or autonomous task to distill into a verified training sample…"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 p-3.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs text-slate-400">
                Selected Format:{' '}
                <span className="font-semibold text-cyan-300">
                  {FORMAT_OPTIONS.find((f) => f.value === format)?.description}
                </span>
              </div>
              <button
                type="submit"
                disabled={distilling || !title.trim() || !userInput.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
              >
                {distilling ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Distilling Trajectory…
                  </>
                ) : (
                  <>
                    <Zap size={15} />
                    Distill Verified Trajectory
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Distilled Trajectory Samples List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Distilled Fine-Tuning Dataset Samples ({state?.samples.length ?? 0})
            </h2>
          </div>

          {!state?.samples.length ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-400">
              No distilled trajectory samples yet. Distill a trajectory above to populate your fine-tuning dataset.
            </div>
          ) : (
            <div className="space-y-4">
              {state.samples.map((sample) => (
                <article
                  key={sample.id}
                  className="rounded-3xl border border-slate-800/90 bg-slate-900/85 p-5 shadow-lg transition hover:border-indigo-500/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-indigo-500/20 px-2.5 py-0.5 font-mono text-[11px] font-bold text-indigo-300">
                          {sample.format}
                        </span>
                        <span className="rounded-lg bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                          Engine: {sample.sourceEngine}
                        </span>
                        <span className="rounded-lg bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                          Quality {sample.qualityScore}%
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {sample.tokenCount} tokens · {new Date(sample.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-bold text-white">{sample.title}</h3>
                      <p className="mt-1 text-xs text-slate-300">
                        <span className="font-semibold text-slate-400">Prompt:</span> {sample.userInput}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void copyText(sample.id, sample.jsonlRow, 'Sample JSONL row')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                    >
                      {copiedKey === sample.id ? <Check size={13} /> : <Copy size={13} />}
                      Copy JSONL Row
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {/* Think Trace */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                        <Terminal size={13} />
                        Chain-of-Thought Trace (thinkTrace)
                      </div>
                      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-300">
                        {sample.thinkTrace}
                      </pre>
                    </div>

                    {/* Tool Calls JSON */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                        <Code2 size={13} />
                        Tool Invocations (toolCallsJson)
                      </div>
                      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-cyan-200/90">
                        {sample.toolCallsJson}
                      </pre>
                    </div>
                  </div>

                  {/* Verified Output */}
                  <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-3.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                      <CheckCircle2 size={13} />
                      Verified Assistant Output (verifiedOutput)
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                      {sample.verifiedOutput}
                    </p>
                  </div>

                  {/* Raw JSONL Row */}
                  <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <FileJson size={13} className="text-indigo-400" />
                        Serialized Training Line (jsonlRow)
                      </span>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre font-mono text-[11px] text-indigo-200/90">
                      {sample.jsonlRow}
                    </pre>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
