'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Play, RefreshCw, Wrench } from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { ToolDryRunResult } from '@openagents/shared'

interface ToolDefinition {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
  source?: 'builtin' | 'mcp'
  serverId?: string | null
  originalName?: string | null
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0.00'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

function parseJsonObject(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool input must be a JSON object.')
  }
  return parsed as Record<string, unknown>
}

function inferExampleValue(schema: Record<string, unknown>) {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0]
  }

  if ('default' in schema) {
    return schema.default
  }

  const type = typeof schema.type === 'string' ? schema.type : ''
  if (type === 'number' || type === 'integer') return 1
  if (type === 'boolean') return false
  if (type === 'array') return []
  if (type === 'object') return {}
  return ''
}

function inferExampleInput(schema: Record<string, unknown>) {
  const properties = schema.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {}
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties as Record<string, Record<string, unknown>>)) {
    result[key] = inferExampleValue(value)
  }
  return result
}

function badgeClass(value: string) {
  const normalized = value.toLowerCase()
  if (normalized.includes('high') || normalized.includes('down')) return 'bg-rose-100 text-rose-700'
  if (normalized.includes('medium') || normalized.includes('degraded')) return 'bg-amber-100 text-amber-700'
  if (normalized.includes('connected') || normalized.includes('ready') || normalized.includes('low')) {
    return 'bg-emerald-100 text-emerald-700'
  }
  return 'bg-slate-100 text-slate-700'
}

function PreviewCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  )
}

export default function DryRunPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [tools, setTools] = useState<ToolDefinition[]>([])
  const [selectedToolName, setSelectedToolName] = useState('')
  const [inputJson, setInputJson] = useState('{}')
  const [result, setResult] = useState<ToolDryRunResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === selectedToolName) ?? null,
    [selectedToolName, tools],
  )

  const sortedTools = useMemo(
    () =>
      [...tools].sort((left, right) => {
        if (left.requiresApproval !== right.requiresApproval) {
          return left.requiresApproval ? -1 : 1
        }
        return left.displayName.localeCompare(right.displayName)
      }),
    [tools],
  )

  const loadTools = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await sdk.tools.list()
      setTools(list)
      if (!selectedToolName && list.length > 0) {
        const first = [...list].sort((left, right) => left.displayName.localeCompare(right.displayName))[0]
        setSelectedToolName(first.name)
        setInputJson(safeJson(inferExampleInput(first.inputSchema)))
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load tools'
      setError(message)
      addToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }, [addToast, selectedToolName])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  useEffect(() => {
    if (!selectedTool) return
    setResult(null)
  }, [selectedTool])

  function handleSelectTool(tool: ToolDefinition) {
    setSelectedToolName(tool.name)
    setInputJson(safeJson(inferExampleInput(tool.inputSchema)))
    setResult(null)
    setError('')
  }

  async function handleDryRun() {
    if (!selectedTool) return
    setIsRunning(true)
    setError('')
    try {
      const input = parseJsonObject(inputJson)
      const preview = await sdk.tools.dryRun({
        toolName: selectedTool.name,
        input,
      })
      setResult(preview)
      addToast('success', `Dry-run preview ready for ${selectedTool.displayName}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to run tool preview'
      setError(message)
      addToast('error', message)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1550px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Dry-Run Preview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Simulate tool execution before a live run writes to external systems or triggers approvals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/approvals"
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Open approvals
          </Link>
          <button
            type="button"
            onClick={() => void loadTools()}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh tools
          </button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tool Catalog</h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose a tool and generate a preflight plan from its JSON input.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {sortedTools.length} tools
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {sortedTools.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {isLoading ? 'Loading tools...' : 'No tools available.'}
              </p>
            )}

            {sortedTools.map((tool) => (
              <button
                key={tool.name}
                type="button"
                onClick={() => handleSelectTool(tool)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedToolName === tool.name
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{tool.displayName}</p>
                    <p className="mt-1 text-xs text-slate-500">{tool.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tool.requiresApproval ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {tool.requiresApproval ? 'approval likely' : 'direct run'}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {tool.source ?? 'builtin'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedTool?.displayName ?? 'Tool preview'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedTool?.description ?? 'Select a tool to inspect readiness, risk, cost, and side effects.'}
              </p>
            </div>
            {selectedTool && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInputJson(safeJson(inferExampleInput(selectedTool.inputSchema)))}
                  className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Fill from schema
                </button>
                <button
                  type="button"
                  onClick={() => void handleDryRun()}
                  disabled={isRunning || !selectedTool}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
                >
                  <Play size={14} />
                  {isRunning ? 'Running...' : 'Run preview'}
                </button>
              </div>
            )}
          </div>

          {!selectedTool && (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Pick a tool from the catalog to generate a preview.
            </div>
          )}

          {selectedTool && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_0.88fr]">
                <label className="block text-xs font-medium text-slate-500">
                  Tool input JSON
                  <textarea
                    value={inputJson}
                    onChange={(event) => setInputJson(event.target.value)}
                    rows={14}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-[12px] text-slate-700 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Schema snapshot</p>
                  <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg bg-white p-3 text-[11px] text-slate-600">
                    {safeJson(selectedTool.inputSchema)}
                  </pre>
                </div>
              </div>

              {result && (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <PreviewCard
                      label="Ready"
                      value={result.ready ? 'Ready to run' : 'Blocked'}
                      detail={`Connector status: ${result.connectorStatus}`}
                    />
                    <PreviewCard
                      label="Approval"
                      value={result.requiresApproval ? 'Approval expected' : 'No approval expected'}
                      detail={`Policy scope: ${result.predictedScope}`}
                    />
                    <PreviewCard
                      label="Reversible"
                      value={result.reversible ? 'Reversible' : 'Potentially destructive'}
                      detail="Based on tool classification and connector behavior"
                    />
                    <PreviewCard
                      label="Estimated Cost"
                      value={formatCurrency(result.estimatedCostUsd)}
                      detail={`Generated ${new Date(result.previewGeneratedAt).toLocaleTimeString()}`}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600">
                          <Wrench size={15} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Risk + readiness</p>
                          <p className="text-xs text-slate-500">What the system predicts before execution</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3 text-sm text-slate-700">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(result.connectorStatus)}`}>
                            connector: {result.connectorStatus}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(result.risk.decision)}`}>
                            decision: {result.risk.decision} ({result.risk.riskScore})
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(result.predictedScope)}`}>
                            scope: {result.predictedScope}
                          </span>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Risk rationale</p>
                          <p className="mt-2 text-sm text-slate-700">{result.risk.reason || 'No specific risk rationale returned.'}</p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Side effects and warnings</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Predicted side effects</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {result.sideEffects.length > 0 ? (
                              result.sideEffects.map((effect) => (
                                <span key={effect} className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                                  {effect}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">No side effects classified.</span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Warnings</p>
                          <div className="mt-2 space-y-2">
                            {result.warnings.length > 0 ? (
                              result.warnings.map((warning) => (
                                <p key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                                  {warning}
                                </p>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500">No warnings returned.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
          )}
        </article>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
