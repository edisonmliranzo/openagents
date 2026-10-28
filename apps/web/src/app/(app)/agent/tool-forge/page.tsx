'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Code2,
  Flame,
  Hammer,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import type { ForgedToolItem } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

interface ToolPreset {
  label: string
  name: string
  description: string
  capabilityPrompt: string
  sampleInput: Record<string, unknown>
}

const TOOL_PRESETS: ToolPreset[] = [
  {
    label: 'JSON Schema Diff & Validator',
    name: 'json_schema_diff_validator',
    description: 'Compares two JSON payload snapshots, flags breaking structural changes, and validates required fields.',
    capabilityPrompt:
      'Accept beforePayload and afterPayload objects plus requiredKeys array. Return addedKeys, removedKeys, typeChanges, breakingChangeDetected boolean, and validationErrors.',
    sampleInput: {
      beforePayload: { id: 'usr_1', role: 'admin', quota: 500 },
      afterPayload: { id: 'usr_1', role: 'admin', quota: '500', tier: 'pro' },
      requiredKeys: ['id', 'role', 'quota'],
    },
  },
  {
    label: 'Log Latency Percentile Calculator',
    name: 'log_latency_percentiles',
    description: 'Computes p50, p95, p99, mean, and SLA breach ratio from a list of API latency samples in milliseconds.',
    capabilityPrompt:
      'Given latenciesMs (number[]) and slaThresholdMs (number), compute min, max, mean, p50, p95, p99, and breachRate.',
    sampleInput: {
      latenciesMs: [42, 58, 63, 71, 89, 110, 145, 210, 380, 640],
      slaThresholdMs: 250,
    },
  },
  {
    label: 'Git Commit Conventional Parser',
    name: 'git_conventional_commit_parser',
    description: 'Parses raw git commit messages into Conventional Commit type, scope, breaking flag, and release bump level.',
    capabilityPrompt:
      'Parse commits (string[]) into structured objects with type, scope, subject, breaking, and recommended semver bump (major/minor/patch).',
    sampleInput: {
      commits: [
        'feat(runtime): add speculative parallel rollout engine',
        'fix(sentinel): debounce file watcher triggers',
        'feat(sdk)!: enforce strict schema validation on tool register',
      ],
    },
  },
]

export default function DynamicToolForgePage() {
  const addToast = useUIStore((s) => s.addToast)
  const [tools, setTools] = useState<ForgedToolItem[]>([])
  const [selectedToolId, setSelectedToolId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Synthesis form state
  const [name, setName] = useState(TOOL_PRESETS[0].name)
  const [description, setDescription] = useState(TOOL_PRESETS[0].description)
  const [capabilityPrompt, setCapabilityPrompt] = useState(TOOL_PRESETS[0].capabilityPrompt)
  const [sampleInputText, setSampleInputText] = useState(
    JSON.stringify(TOOL_PRESETS[0].sampleInput, null, 2),
  )

  // Sandbox & Playground input/output state
  const [testInputText, setTestInputText] = useState('')
  const [playgroundInputText, setPlaygroundInputText] = useState('')
  const [executionResult, setExecutionResult] = useState<{
    output: unknown
    durationMs: number
  } | null>(null)

  const selectedTool = tools.find((t) => t.id === selectedToolId) ?? tools[0] ?? null

  const loadTools = useCallback(async () => {
    setLoading(true)
    try {
      const list = await sdk.agenticSuite.listForgedTools()
      setTools(list)
      if (list.length > 0) {
        setSelectedToolId((prev) => (prev && list.some((i) => i.id === prev) ? prev : list[0].id))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load forged tools')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  useEffect(() => {
    if (!selectedTool) return
    const formattedSample = JSON.stringify(selectedTool.testSampleInput ?? {}, null, 2)
    setTestInputText(formattedSample)
    setPlaygroundInputText(formattedSample)
    setExecutionResult(null)
  }, [selectedTool?.id])

  function applyPreset(preset: ToolPreset) {
    setName(preset.name)
    setDescription(preset.description)
    setCapabilityPrompt(preset.capabilityPrompt)
    setSampleInputText(JSON.stringify(preset.sampleInput, null, 2))
  }

  async function handleSynthesize(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !capabilityPrompt.trim()) {
      addToast('warning', 'Tool name and capability specification are required')
      return
    }
    let parsedSample: Record<string, unknown> | undefined
    if (sampleInputText.trim()) {
      try {
        parsedSample = JSON.parse(sampleInputText)
      } catch {
        addToast('error', 'Sample input must be valid JSON')
        return
      }
    }

    setSynthesizing(true)
    try {
      const created = await sdk.agenticSuite.synthesizeTool({
        name: name.trim(),
        description: description.trim(),
        capabilityPrompt: capabilityPrompt.trim(),
        sampleInput: parsedSample,
      })
      setTools((prev) => [created, ...prev.filter((t) => t.id !== created.id)])
      setSelectedToolId(created.id)
      addToast('success', `Synthesized tool "${created.name}"`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to synthesize tool')
    } finally {
      setSynthesizing(false)
    }
  }

  async function handleVerify(tool: ForgedToolItem) {
    let parsedTest: Record<string, unknown> | undefined
    if (testInputText.trim()) {
      try {
        parsedTest = JSON.parse(testInputText)
      } catch {
        addToast('error', 'Sandbox test input must be valid JSON')
        return
      }
    }
    setVerifyingId(tool.id)
    try {
      const updated = await sdk.agenticSuite.verifyTool(tool.id, parsedTest)
      setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      if (updated.lastTestResult?.passed) {
        addToast('success', `Sandbox verification passed (${updated.lastTestResult.durationMs}ms)`)
      } else {
        addToast('warning', updated.lastTestResult?.error ?? 'Verification failed')
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Sandbox verification error')
    } finally {
      setVerifyingId(null)
    }
  }

  async function handleHotRegister(tool: ForgedToolItem) {
    setRegisteringId(tool.id)
    try {
      const updated = await sdk.agenticSuite.hotRegisterTool(tool.id)
      setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      addToast('success', `Tool "${updated.name}" hot-registered into active agent runtime`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to hot-register tool')
    } finally {
      setRegisteringId(null)
    }
  }

  async function handleExecute(tool: ForgedToolItem) {
    let parsedInput: Record<string, unknown> = {}
    if (playgroundInputText.trim()) {
      try {
        parsedInput = JSON.parse(playgroundInputText)
      } catch {
        addToast('error', 'Playground input must be valid JSON')
        return
      }
    }
    setExecuting(true)
    try {
      const res = await sdk.agenticSuite.executeForgedTool(tool.id, parsedInput)
      setExecutionResult(res)
      await loadTools()
      addToast('success', `Executed in ${res.durationMs}ms`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Tool execution failed')
    } finally {
      setExecuting(false)
    }
  }

  async function handleDelete(toolId: string) {
    setDeletingId(toolId)
    try {
      await sdk.agenticSuite.deleteForgedTool(toolId)
      setTools((prev) => {
        const next = prev.filter((t) => t.id !== toolId)
        if (selectedToolId === toolId) {
          setSelectedToolId(next[0]?.id ?? '')
        }
        return next
      })
      addToast('success', 'Forged tool removed')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to delete tool')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Hammer className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Dynamic Tool Forge
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Self-coding tool synthesis, isolated sandbox verification, and zero-downtime hot-registration
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
            {tools.filter((t) => t.hotRegistered).length} Hot-Registered
          </span>
          <button
            onClick={() => void loadTools()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column: Synthesizer + Tool Inventory */}
        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Synthesize New Capability
              </h2>
              <span className="text-[11px] text-slate-400">Quick-fill presets</span>
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5">
              {TOOL_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 transition hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSynthesize} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Tool Identifier (snake_case)
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. json_schema_diff_validator"
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Summary Description
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of what the tool accomplishes"
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Capability Specification & Edge-Case Contract
                </label>
                <textarea
                  rows={3}
                  value={capabilityPrompt}
                  onChange={(e) => setCapabilityPrompt(e.target.value)}
                  placeholder="Describe inputs, deterministic transformations, and expected output fields..."
                  className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Sample Verification Input (JSON)
                </label>
                <textarea
                  rows={4}
                  value={sampleInputText}
                  onChange={(e) => setSampleInputText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={synthesizing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {synthesizing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Synthesizing & Compiling Tool...
                  </>
                ) : (
                  <>
                    <Hammer className="h-4 w-4" />
                    Forge & Compile Tool
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Forged Tool Catalog */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Forged Tool Registry ({tools.length})
            </h2>
            <div className="space-y-2.5">
              {tools.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">
                  No tools forged yet. Select a preset above and click Forge & Compile Tool.
                </p>
              )}
              {tools.map((tool) => {
                const active = selectedTool?.id === tool.id
                return (
                  <div
                    key={tool.id}
                    onClick={() => setSelectedToolId(tool.id)}
                    className={`cursor-pointer rounded-lg border p-3 transition ${
                      active
                        ? 'border-amber-500/70 bg-amber-500/5 dark:bg-amber-500/10'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {tool.name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              tool.hotRegistered
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-slate-500/15 text-slate-400'
                            }`}
                          >
                            {tool.hotRegistered ? 'Hot-Registered' : 'Draft'}
                          </span>
                          {tool.verified && (
                            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                              Verified
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                          {tool.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDelete(tool.id)
                        }}
                        disabled={deletingId === tool.id}
                        className="rounded p-1 text-slate-400 hover:bg-red-500/10 hover:text-red-500"
                        title="Delete forged tool"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                      <span>Invocations: {tool.invocations}</span>
                      {tool.lastTestResult && (
                        <span>
                          Last test: {tool.lastTestResult.passed ? 'PASS' : 'FAIL'} (
                          {tool.lastTestResult.durationMs}ms)
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* Right column: Code/Schema Viewer, Sandbox Runner, Live Execution Playground */}
        <div className="space-y-6 lg:col-span-7">
          {selectedTool ? (
            <>
              {/* Tool status & Hot-Register Banner */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-amber-500" />
                      <h2 className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
                        {selectedTool.name}
                      </h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          selectedTool.hotRegistered
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {selectedTool.hotRegistered ? '● Hot-Registered' : '○ Draft'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {selectedTool.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleVerify(selectedTool)}
                      disabled={verifyingId === selectedTool.id}
                      className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 disabled:opacity-50"
                    >
                      {verifyingId === selectedTool.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      Verify in Sandbox
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleHotRegister(selectedTool)}
                      disabled={registeringId === selectedTool.id}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {registeringId === selectedTool.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Flame className="h-3.5 w-3.5" />
                      )}
                      {selectedTool.hotRegistered ? 'Re-Sync Hot Registration' : 'Hot-Register Tool'}
                    </button>
                  </div>
                </div>

                {/* Code + JSON Schema Viewer */}
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                      <span>Synthesized Implementation</span>
                      <span className="font-mono text-[10px]">TypeScript / Isolated VM</span>
                    </div>
                    <pre className="max-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-emerald-300 dark:border-slate-800">
                      {selectedTool.code}
                    </pre>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Input JSON Schema
                      </div>
                      <pre className="max-h-28 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-2.5 font-mono text-[11px] text-sky-300 dark:border-slate-800">
                        {JSON.stringify(selectedTool.inputSchema, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Output JSON Schema
                      </div>
                      <pre className="max-h-28 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-2.5 font-mono text-[11px] text-amber-300 dark:border-slate-800">
                        {JSON.stringify(selectedTool.outputSchema, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </section>

              {/* Sandbox Test Runner Card */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <ShieldCheck className="h-4 w-4 text-sky-400" />
                    Sandbox Self-Test Runner
                  </h3>
                  {selectedTool.lastTestResult && (
                    <div className="flex items-center gap-2 text-xs">
                      {selectedTool.lastTestResult.passed ? (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-semibold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          PASS
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 font-semibold text-red-400">
                          <XCircle className="h-3.5 w-3.5" />
                          FAIL
                        </span>
                      )}
                      <span className="font-mono text-slate-400">
                        {selectedTool.lastTestResult.durationMs}ms
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Sandbox Test Input Payload
                    </label>
                    <textarea
                      rows={5}
                      value={testInputText}
                      onChange={(e) => setTestInputText(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Last Verification Output
                    </label>
                    <pre className="h-[118px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-2.5 font-mono text-xs text-slate-200 dark:border-slate-800">
                      {selectedTool.lastTestResult
                        ? JSON.stringify(
                            selectedTool.lastTestResult.error
                              ? { error: selectedTool.lastTestResult.error }
                              : selectedTool.lastTestResult.output,
                            null,
                            2,
                          )
                        : '// Click "Verify in Sandbox" to run unit assertion'}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Live Execution Playground */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Live Execution Playground
                  </h3>
                  <button
                    type="button"
                    onClick={() => void handleExecute(selectedTool)}
                    disabled={executing}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {executing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Execute Tool Now
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Runtime Arguments (JSON)
                    </label>
                    <textarea
                      rows={5}
                      value={playgroundInputText}
                      onChange={(e) => setPlaygroundInputText(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                      <span>Execution Response</span>
                      {executionResult && (
                        <span className="font-mono text-emerald-400">
                          {executionResult.durationMs}ms
                        </span>
                      )}
                    </div>
                    <pre className="h-[118px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-2.5 font-mono text-xs text-emerald-300 dark:border-slate-800">
                      {executionResult
                        ? JSON.stringify(executionResult.output, null, 2)
                        : '// Execute the tool with custom arguments to inspect live output'}
                    </pre>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-800">
              Select or synthesize a tool to inspect its schema, sandbox tests, and playground.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
