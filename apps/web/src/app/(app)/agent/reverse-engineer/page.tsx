'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Braces,
  Check,
  Code2,
  Copy,
  Cpu,
  FileCode2,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { ReverseEngineeredSdk } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

type CodeTab = 'zod' | 'ts_client' | 'mcp_tool' | 'split_all'

const REVERSE_PRESETS = [
  {
    apiName: 'StripeBillingWebhookV2',
    rawCurlOrJson: `curl -X POST https://api.stripe.com/v1/billing/meter_events \\
  -H "Authorization: Bearer sk_live_openagents_redacted" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_name": "openagents_compute_tokens",
    "payload": {
      "stripe_customer_id": "cus_Qr92Lm81Xz",
      "value": "48500",
      "model_tier": "dots_moe_router"
    },
    "timestamp": 1761840000
  }'`,
  },
  {
    apiName: 'GitHubActionsWorkflowDispatch',
    rawCurlOrJson: `curl -L -X POST \\
  -H "Accept: application/vnd.github+json" \\
  -H "Authorization: Bearer ghp_openagents_token" \\
  https://api.github.com/repos/openagents/core/actions/workflows/canary.yml/dispatches \\
  -d '{"ref":"main","inputs":{"environment":"production","run_adversarial_verifier":true}}'`,
  },
  {
    apiName: 'LinearIssueTriageWebhook',
    rawCurlOrJson: `{
  "action": "create",
  "type": "Issue",
  "data": {
    "id": "lin_99481a",
    "title": "Sub-second failover for local Ollama provider",
    "priority": 1,
    "team": { "key": "OA", "name": "OpenAgents Runtime" },
    "labels": ["autonomy", "high-priority"]
  }
}`,
  },
]

export default function ReverseEngineerSdkPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [sdks, setSdks] = useState<ReverseEngineeredSdk[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [activeTab, setActiveTab] = useState<CodeTab>('split_all')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [apiName, setApiName] = useState(REVERSE_PRESETS[0].apiName)
  const [rawCurlOrJson, setRawCurlOrJson] = useState(REVERSE_PRESETS[0].rawCurlOrJson)

  const selectedSdk = sdks.find((item) => item.id === selectedId) ?? sdks[0] ?? null

  const loadSdks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getReverseEngineeredSdks()
      const list = res.sdks ?? []
      setSdks(list)
      if (list.length > 0) {
        setSelectedId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0].id))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load reverse-engineered SDKs')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadSdks()
  }, [loadSdks])

  async function handleSynthesize(e: React.FormEvent) {
    e.preventDefault()
    if (!apiName.trim() || !rawCurlOrJson.trim()) {
      addToast('warning', 'API name and raw cURL or JSON payload are required')
      return
    }
    setSynthesizing(true)
    try {
      const created = await sdk.agenticSuite.synthesizeReverseEngineeredSdk({
        apiName: apiName.trim(),
        rawCurlOrJson: rawCurlOrJson.trim(),
      })
      setSdks((prev) => [created, ...prev.filter((item) => item.id !== created.id)])
      setSelectedId(created.id)
      addToast(
        'success',
        `Synthesized Zod schema, TypeScript SDK & MCP Tool for "${created.apiName}"`,
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to reverse-engineer API payload')
    } finally {
      setSynthesizing(false)
    }
  }

  function handleCopyCode(key: string, label: string, code: string) {
    navigator.clipboard.writeText(code).catch(() => undefined)
    setCopiedKey(key)
    addToast('success', `Copied ${label} to clipboard`)
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 1800)
  }

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1440px] space-y-6 pb-20">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-indigo-500/20 bg-slate-900/80 p-5 shadow-lg shadow-indigo-950/20 backdrop-blur">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                  OpenAgents Protocol Compiler
                </span>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                  Zod + Fetch SDK + MCP JSON
                </span>
              </div>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white">
                Autonomous API &amp; Webhook Reverse-Engineer
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Paste any raw <code className="text-cyan-300">curl</code> command or webhook JSON payload to auto-synthesize strict Zod validation schemas, typed TypeScript clients, and OpenAgents MCP tool definitions.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadSdks()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Catalog
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Input Synthesizer + Synthesized SDK History */}
          <div className="space-y-5 lg:col-span-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                  <Wrench className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Raw cURL / Webhook Payload Inspector
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Infers auth headers, nested types, and MCP tool JSON schema
                  </p>
                </div>
              </div>

              <div className="mb-4 space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Sample Traces
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {REVERSE_PRESETS.map((preset) => (
                    <button
                      key={preset.apiName}
                      type="button"
                      onClick={() => {
                        setApiName(preset.apiName)
                        setRawCurlOrJson(preset.rawCurlOrJson)
                      }}
                      className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 font-mono text-[11px] text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
                    >
                      {preset.apiName}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSynthesize} className="space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Target API / Webhook Identifier
                  </label>
                  <input
                    type="text"
                    value={apiName}
                    onChange={(e) => setApiName(e.target.value)}
                    placeholder="e.g. StripeBillingWebhookV2"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 font-mono text-xs text-cyan-300 outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Raw <code className="text-indigo-300">curl</code> Command or JSON Payload
                  </label>
                  <textarea
                    rows={8}
                    value={rawCurlOrJson}
                    onChange={(e) => setRawCurlOrJson(e.target.value)}
                    placeholder="Paste curl -X POST ... or raw JSON body..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 p-3 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={synthesizing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-950/40 transition hover:brightness-110 disabled:opacity-50"
                >
                  {synthesizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Auto-Synthesize Zod + TypeScript SDK + MCP Tool
                </button>
              </form>
            </section>

            {/* Synthesized SDK Catalog */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <h3 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                <span>Synthesized SDK Artifacts ({sdks.length})</span>
              </h3>
              <div className="space-y-2">
                {sdks.map((item) => {
                  const active = selectedSdk?.id === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-cyan-500 bg-cyan-950/25'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-white">
                          {item.apiName}
                        </span>
                        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                          {item.detectedAuthType}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{item.endpointsCount} endpoint(s) synthesized</span>
                        <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          {/* Right Column: Tabbed / Split Code Viewers */}
          <div className="space-y-4 lg:col-span-7">
            {selectedSdk ? (
              <div className="space-y-4">
                {/* Metadata & View Switcher Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-base font-bold text-white">
                        {selectedSdk.apiName}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-300">
                        <KeyRound className="h-3 w-3" />
                        Auth: {selectedSdk.detectedAuthType}
                      </span>
                      <span className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-300">
                        {selectedSdk.endpointsCount} Endpoint(s)
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                      Source: {selectedSdk.sourceInput.slice(0, 95)}
                      {selectedSdk.sourceInput.length > 95 ? '…' : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
                    {(
                      [
                        { id: 'split_all', label: 'Split All (3-Pane)' },
                        { id: 'zod', label: 'Zod Schema' },
                        { id: 'ts_client', label: 'TS Client' },
                        { id: 'mcp_tool', label: 'MCP Tool JSON' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                          activeTab === tab.id
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1. Zod Schema Code Panel */}
                {(activeTab === 'split_all' || activeTab === 'zod') && (
                  <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/85 p-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Braces className="h-4 w-4 text-indigo-400" />
                        <span className="font-mono text-xs font-bold text-indigo-300">
                          zodSchemaCode · Runtime Validation Contract
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyCode(
                            'zod',
                            'Zod Schema Code',
                            selectedSdk.zodSchemaCode,
                          )
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
                      >
                        {copiedKey === 'zod' ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            1-Click Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-indigo-100">
                      {selectedSdk.zodSchemaCode}
                    </pre>
                  </div>
                )}

                {/* 2. TypeScript Client Code Panel */}
                {(activeTab === 'split_all' || activeTab === 'ts_client') && (
                  <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/85 p-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="h-4 w-4 text-cyan-400" />
                        <span className="font-mono text-xs font-bold text-cyan-300">
                          typescriptClientCode · Zero-Dependency Typed Fetch Client
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyCode(
                            'ts_client',
                            'TypeScript Client Code',
                            selectedSdk.typescriptClientCode,
                          )
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
                      >
                        {copiedKey === 'ts_client' ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            1-Click Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-cyan-100">
                      {selectedSdk.typescriptClientCode}
                    </pre>
                  </div>
                )}

                {/* 3. MCP Tool Definition JSON Panel */}
                {(activeTab === 'split_all' || activeTab === 'mcp_tool') && (
                  <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/85 p-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-emerald-400" />
                        <span className="font-mono text-xs font-bold text-emerald-300">
                          mcpToolDefinitionJson · OpenAgents MCP Server Descriptor
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyCode(
                            'mcp_tool',
                            'MCP Tool Definition JSON',
                            selectedSdk.mcpToolDefinitionJson,
                          )
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                      >
                        {copiedKey === 'mcp_tool' ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            1-Click Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-emerald-100">
                      {selectedSdk.mcpToolDefinitionJson}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-xs text-slate-400">
                Paste a cURL command or JSON payload on the left to synthesize an OpenAgents SDK bundle.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
