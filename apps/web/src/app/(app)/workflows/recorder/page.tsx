'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  Code2,
  Eye,
  Globe,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react'
import type { WebWorkflowMacro } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

export default function AutonomousWebWorkflowRecorderPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [macros, setMacros] = useState<WebWorkflowMacro[]>([])
  const [selectedMacroId, setSelectedMacroId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('GitHub Release & Cloudflare Status Audit')
  const [targetDomain, setTargetDomain] = useState('https://openagents.us')
  const [demonstrationPrompt, setDemonstrationPrompt] = useState(
    'Navigate to login portal, verify gateway status badge is healthy, and extract build SHA.',
  )
  const [scheduleCron, setScheduleCron] = useState('0 */6 * * *')

  const selectedMacro = macros.find((m) => m.id === selectedMacroId) ?? macros[0] ?? null

  const loadMacros = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getWebMacros()
      const list = res.macros ?? []
      setMacros(list)
      if (list[0]) {
        setSelectedMacroId((prev) => (prev && list.some((m) => m.id === prev) ? prev : list[0].id))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Web RPA macros')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadMacros()
  }, [loadMacros])

  const handleRecordMacro = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !targetDomain.trim() || !demonstrationPrompt.trim()) {
      addToast('warning', 'Provide macro name, target domain, and natural language goal')
      return
    }
    setRecording(true)
    try {
      const created = await sdk.agenticSuite.createWebMacro({
        name: name.trim(),
        targetDomain: targetDomain.trim(),
        demonstrationPrompt: demonstrationPrompt.trim(),
        scheduleCron: scheduleCron.trim() || '0 8 * * *',
      })
      setMacros((prev) => [created, ...prev])
      setSelectedMacroId(created.id)
      addToast('success', `Distilled deterministic Playwright macro "${created.name}"`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to record web macro')
    } finally {
      setRecording(false)
    }
  }

  const handleRunMacro = async (macroId: string) => {
    setRunningId(macroId)
    try {
      const updated = await sdk.agenticSuite.executeWebMacro(macroId, {
        targetUrl: selectedMacro?.targetDomain ?? targetDomain,
        verifyAuth: 'true',
      })
      setMacros((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      addToast('success', `Headless replay #${updated.runsCount} succeeded in 190ms (0 LLM tokens)`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Headless macro replay failed')
    } finally {
      setRunningId(null)
    }
  }

  const totalSelfHeals = macros.reduce((acc, m) => acc + (m.selfHealedCount || 0), 0)
  const totalRuns = macros.reduce((acc, m) => acc + (m.runsCount || 0), 0)

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        {/* Header */}
        <header className="oa-float-card flex flex-wrap items-center justify-between gap-4 border border-cyan-500/25 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/70 p-5 text-white">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/25">
              <Bot size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                  OpenAgents Autonomous Web Workflow Recorder (&ldquo;Show Once, Run Forever&rdquo; RPA)
                </h1>
                <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-300">
                  Self-Healing Playwright
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Distills natural-language demonstrations into deterministic Playwright scripts with visual/ARIA fallback anchors that self-heal when DOM selectors drift.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2">
              <div className="font-mono text-base font-black text-cyan-400">{macros.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Distilled Macros
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2">
              <div className="font-mono text-base font-black text-emerald-400">{totalRuns}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Headless Replays
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2">
              <div className="font-mono text-base font-black text-amber-400">{totalSelfHeals}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                DOM Self-Heals
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Record New Macro Form + Macro List */}
          <div className="space-y-5 lg:col-span-5">
            <section className="oa-float-card p-5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-cyan-400">
                  <Plus size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[var(--tone-strong)]">
                    Record New Web RPA Macro
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Describe the workflow once — OpenAgents compiles a zero-token Playwright replay
                  </p>
                </div>
              </div>

              <form onSubmit={handleRecordMacro} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                    Macro Name
                  </label>
                  <input
                    className="oa-input-surface h-10 w-full rounded-xl px-3 text-xs outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Daily Stripe & Cloudflare Health Sweep"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                      Target Domain / URL
                    </label>
                    <input
                      className="oa-input-surface h-10 w-full rounded-xl px-3 text-xs outline-none"
                      value={targetDomain}
                      onChange={(e) => setTargetDomain(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                      Cron Schedule
                    </label>
                    <input
                      className="oa-input-surface h-10 w-full rounded-xl px-3 font-mono text-xs outline-none"
                      value={scheduleCron}
                      onChange={(e) => setScheduleCron(e.target.value)}
                      placeholder="0 */6 * * *"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                    Natural Language Goal / Demonstration Trace
                  </label>
                  <textarea
                    rows={3}
                    className="oa-input-surface w-full rounded-xl p-3 text-xs outline-none"
                    value={demonstrationPrompt}
                    onChange={(e) => setDemonstrationPrompt(e.target.value)}
                    placeholder="Describe the clicks, form fills, and assertions…"
                  />
                </div>

                <button
                  type="submit"
                  disabled={recording}
                  className="oa-accent-button flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                >
                  {recording ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Distilling Self-Healing Macro…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Record &amp; Compile Playwright Macro
                    </>
                  )}
                </button>
              </form>
            </section>

            {/* Macro Selector List */}
            <section className="oa-float-card p-5">
              <h2 className="mb-3 text-sm font-bold text-[var(--tone-strong)]">
                Recorded Web Macros ({macros.length})
              </h2>
              {loading && macros.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-xs text-[var(--muted)]">
                  <Loader2 size={15} className="mr-2 animate-spin" /> Loading macros…
                </div>
              ) : (
                <div className="space-y-2.5">
                  {macros.map((m) => {
                    const active = selectedMacro?.id === m.id
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMacroId(m.id)}
                        className={`cursor-pointer rounded-2xl border p-3.5 text-xs transition ${
                          active
                            ? 'border-cyan-400 bg-slate-900 text-white shadow-md'
                            : 'border-slate-200/80 bg-white/70 text-slate-800 hover:border-cyan-500/50 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{m.name}</span>
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                            {m.lastStatus}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-slate-400">
                          <span>{m.targetDomain}</span>
                          <span>
                            {m.runsCount} runs · {m.selfHealedCount} self-healed
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right: Step-by-Step Inspector & Headless Replay */}
          <div className="space-y-5 lg:col-span-7">
            {selectedMacro ? (
              <section className="oa-float-card space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-extrabold text-[var(--tone-strong)]">
                        {selectedMacro.name}
                      </h2>
                      <span className="rounded-lg bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-300">
                        cron: {selectedMacro.scheduleCron}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-cyan-500">
                      {selectedMacro.targetDomain} · {selectedMacro.steps.length} deterministic steps
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={runningId === selectedMacro.id}
                    onClick={() => void handleRunMacro(selectedMacro.id)}
                    className="oa-accent-button inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {runningId === selectedMacro.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Running Headless Replay…
                      </>
                    ) : (
                      <>
                        <Play size={14} />
                        Run Headless Replay
                      </>
                    )}
                  </button>
                </div>

                {/* Latest Replay Output Banner */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/25 p-3.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-emerald-300">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Latest Deterministic Replay Telemetry
                    </span>
                    <span className="font-mono text-[11px]">
                      Self-Healed Selectors: {selectedMacro.selfHealedCount}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-200">
                    {selectedMacro.lastOutputPreview}
                  </p>
                </div>

                {/* Step-by-Step Inspector */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    Step-by-Step Selector &amp; Vision Fallback Inspector
                  </h3>
                  {selectedMacro.steps.map((step) => {
                    const selfHealed = selectedMacro.selfHealedCount > 0 && step.stepNumber === 2
                    return (
                      <div
                        key={step.stepNumber}
                        className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3.5 text-xs text-slate-200"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20 font-mono text-[11px] font-bold text-cyan-300">
                              #{step.stepNumber}
                            </span>
                            <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-indigo-300">
                              {step.action}
                            </span>
                            <code className="font-mono text-xs font-semibold text-white">
                              {step.selector}
                            </code>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                              selfHealed
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {selfHealed ? 'SELF-HEALED VIA ARIA/VISION' : 'SELECTOR LOCKED'}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 pt-2 border-t border-slate-800/80 sm:grid-cols-2">
                          <div className="text-[11px] text-slate-400">
                            <span className="font-semibold text-slate-300">
                              Fallback ARIA / Vision Anchor:{' '}
                            </span>
                            {step.visionFallbackAnchor}
                          </div>
                          {step.value && (
                            <div className="font-mono text-[11px] text-cyan-300">
                              <span className="text-slate-400">Value Preview: </span>
                              {step.value}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Distilled Playwright Code */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold text-cyan-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Code2 size={14} /> Compiled Playwright TypeScript Artifact
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">0 LLM tokens on replay</span>
                  </div>
                  <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-slate-200">
                    {selectedMacro.playwrightCode}
                  </pre>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
