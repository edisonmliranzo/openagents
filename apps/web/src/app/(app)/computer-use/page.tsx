'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Compass,
  Eye,
  Globe,
  Loader2,
  MousePointerClick,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import type { ComputerUseSession, ComputerUseStep } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const PRESET_OBJECTIVES = [
  {
    label: 'Audit Local Runtime Health & Extract Latency Metrics',
    objective:
      'Navigate to the status dashboard, inspect active worker queues, verify API response health, and extract structured SLA metrics.',
    targetUrl: 'http://localhost:3000/status',
  },
  {
    label: 'Inspect Pricing Table & Verify Checkout Guardrails',
    objective:
      'Open the billing & pricing portal, compare tier quotas, test coupon input validation, and extract the structured tier matrix.',
    targetUrl: 'https://openagents.us/pricing',
  },
]

export default function ComputerUsePage() {
  const addToast = useUIStore((s) => s.addToast)
  const [sessions, setSessions] = useState<ComputerUseSession[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [objective, setObjective] = useState(PRESET_OBJECTIVES[0].objective)
  const [targetUrl, setTargetUrl] = useState(PRESET_OBJECTIVES[0].targetUrl)
  const [maxSteps, setMaxSteps] = useState(5)
  const [steerInstruction, setSteerInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stepping, setStepping] = useState(false)

  const activeSession = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const list = await sdk.agenticSuite.listComputerSessions()
      setSessions(list)
      if (list.length > 0) {
        setSelectedId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0].id))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load computer-use sessions')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function handleStartSession(e: React.FormEvent) {
    e.preventDefault()
    if (!objective.trim()) {
      addToast('warning', 'Objective is required')
      return
    }
    setStarting(true)
    try {
      const session = await sdk.agenticSuite.startComputerSession({
        objective: objective.trim(),
        targetUrl: targetUrl.trim() || 'https://example.com',
        maxSteps,
      })
      setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)])
      setSelectedId(session.id)
      addToast('success', 'Started closed-loop vision-action session')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to start computer-use session')
    } finally {
      setStarting(false)
    }
  }

  async function handleNextStep(customInstruction?: string) {
    if (!activeSession) return
    setStepping(true)
    try {
      const updated = await sdk.agenticSuite.stepComputerSession(
        activeSession.id,
        customInstruction?.trim() || undefined,
      )
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      if (customInstruction) setSteerInstruction('')
      addToast('success', `Completed closed-loop step #${updated.steps.length}`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to execute closed-loop step')
    } finally {
      setStepping(false)
    }
  }

  const latestStep: ComputerUseStep | undefined =
    activeSession?.steps[activeSession.steps.length - 1]

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
            <Eye className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Closed-Loop Vision-Action Computer Agent
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Observe → Plan → Act → Verify loop with coordinate grounding, post-action state assertion, and automatic self-recovery
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessions.length > 0 && (
            <select
              value={activeSession?.id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:text-slate-200"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
                  {s.objective.slice(0, 50)}... ({s.status})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => void loadSessions()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Start New Session Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Compass className="h-4 w-4 text-cyan-400" />
            Initialize Closed-Loop Session
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_OBJECTIVES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setObjective(preset.objective)
                  setTargetUrl(preset.targetUrl)
                }}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleStartSession} className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Visual Objective
            </label>
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Describe what the computer-use agent should accomplish and verify..."
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Target URL / Viewport
            </label>
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
            />
          </div>

          <div className="md:col-span-1">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Max Steps
            </label>
            <input
              type="number"
              min={2}
              max={12}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value) || 5)}
              className="w-full rounded-lg border border-slate-300 bg-transparent px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
            />
          </div>

          <div className="flex items-end md:col-span-2">
            <button
              type="submit"
              disabled={starting}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Loop
            </button>
          </div>
        </form>
      </section>

      {activeSession ? (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Simulated Visual Viewport + Live Steering + Extracted Output */}
          <div className="space-y-6 lg:col-span-5">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center gap-2 truncate">
                  <Globe className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">
                    {activeSession.targetUrl}
                  </span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    activeSession.status === 'completed'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : activeSession.status === 'needs_attention'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-cyan-500/15 text-cyan-400'
                  }`}
                >
                  {activeSession.status}
                </span>
              </div>

              {/* Grounded Viewport Overlay */}
              <div className="relative h-64 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 text-slate-200">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Active Grounded Viewport
                </div>
                <p className="mt-1 text-xs font-medium text-slate-100">
                  {activeSession.objective}
                </p>

                {latestStep && (
                  <div className="mt-4 space-y-2 rounded-lg border border-cyan-500/30 bg-slate-900/90 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-cyan-400">
                        Step #{latestStep.stepIndex} • {latestStep.plannedAction.type.toUpperCase()}
                      </span>
                      {latestStep.plannedAction.coordinates && (
                        <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                          ({latestStep.plannedAction.coordinates.x},{' '}
                          {latestStep.plannedAction.coordinates.y})
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-slate-300">
                      Target: {latestStep.plannedAction.target}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Post-state: {latestStep.verification.postStateSummary}
                    </div>
                  </div>
                )}

                {latestStep?.plannedAction.coordinates && (
                  <div
                    className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-cyan-400 bg-cyan-400/20 shadow-lg"
                    style={{
                      left: `${Math.min(88, Math.max(12, Math.round((latestStep.plannedAction.coordinates.x / 1280) * 100)))}%`,
                      top: `${Math.min(85, Math.max(20, Math.round((latestStep.plannedAction.coordinates.y / 800) * 100)))}%`,
                    }}
                  >
                    <div className="h-2 w-2 rounded-full bg-cyan-300" />
                  </div>
                )}
              </div>

              {/* Step & Live Steering Controls */}
              <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
                <div className="flex gap-2">
                  <input
                    value={steerInstruction}
                    onChange={(e) => setSteerInstruction(e.target.value)}
                    placeholder="Optional live steering instruction for next cycle..."
                    className="flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => void handleNextStep(steerInstruction)}
                    disabled={stepping}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                  >
                    {stepping ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Run Next Closed-Loop Step
                  </button>
                </div>
              </div>
            </section>

            {/* Extracted Structured Output */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="mb-2 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Extracted Structured Output
                </h3>
              </div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-emerald-300 dark:border-slate-800">
                {activeSession.extractedData ??
                  '// Run additional closed-loop steps to complete final extraction'}
              </pre>
            </section>
          </div>

          {/* Right: Interactive Observe -> Plan -> Act -> Verify Timeline */}
          <div className="lg:col-span-7">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Observe → Plan → Act → Verify Timeline ({activeSession.steps.length} steps)
                </h2>
                <span className="text-xs text-slate-400">
                  Updated {new Date(activeSession.updatedAt).toLocaleTimeString()}
                </span>
              </div>

              <div className="space-y-4">
                {activeSession.steps.map((step) => (
                  <div
                    key={step.stepIndex}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 font-mono text-xs font-bold text-cyan-400">
                          {step.stepIndex}
                        </span>
                        <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-400">
                          {step.plannedAction.type}
                        </span>
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
                          {step.plannedAction.target}
                        </span>
                        {step.plannedAction.coordinates && (
                          <span className="flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <MousePointerClick className="h-3 w-3" />
                            x:{step.plannedAction.coordinates.x}, y:
                            {step.plannedAction.coordinates.y}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {step.verification.passed ? (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                            <RotateCcw className="h-3 w-3" />
                            Recovered
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 pt-1 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <Eye className="h-3 w-3 text-cyan-400" />
                          1. Observation & Grounding
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {step.observation}
                        </p>
                        {step.plannedAction.value && (
                          <div className="mt-1.5 font-mono text-[11px] text-cyan-400">
                            Input value: &quot;{step.plannedAction.value}&quot;
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <ShieldCheck className="h-3 w-3 text-emerald-400" />
                          2. Post-Action State Verification
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {step.verification.postStateSummary}
                        </p>
                        {step.verification.recoveryApplied && (
                          <div className="mt-1.5 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-400">
                            Self-Recovery: {step.verification.recoveryApplied}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-800">
          Start a closed-loop computer session above to inspect visual grounding and verification steps.
        </div>
      )}
    </div>
  )
}
