'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertOctagon,
  CheckCircle2,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Power,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import type {
  FirewallPacketInspection,
  FirewallRuleItem,
} from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const SAMPLE_PAYLOADS = [
  {
    label: 'Leaked OpenAI + GitHub Token + Postgres URI',
    destination: 'https://api.external-llm.com/v1/chat/completions',
    payload:
      'Authorization: Bearer sk-proj-98a7bcdef1234567890abcdef and GitHub token ghp_1234567890abcdefghijklmnop connecting to postgresql://admin:supersecret@db.internal:5432/openagents',
  },
  {
    label: 'Session JWT + xAI Key in Prompt Context',
    destination: 'https://mcp.thirdparty-plugin.io/invoke',
    payload:
      'Debugging user session token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsInJvbGUiOiJhZG1pbiJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c with xai-live99887766554433221100',
  },
  {
    label: 'PEM Private Key Exfiltration Attempt (Hard Block)',
    destination: 'https://webhook.untrusted-sink.net/collect',
    payload:
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7M\n-----END RSA PRIVATE KEY-----',
  },
]

export default function SecurityFirewallPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [rules, setRules] = useState<FirewallRuleItem[]>([])
  const [inspections, setInspections] = useState<FirewallPacketInspection[]>([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [destination, setDestination] = useState(SAMPLE_PAYLOADS[0].destination)
  const [payload, setPayload] = useState(SAMPLE_PAYLOADS[0].payload)
  const [latestInspection, setLatestInspection] = useState<FirewallPacketInspection | null>(null)

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getFirewallState()
      setRules(res.rules)
      setInspections(res.inspections)
      if (res.inspections[0] && !latestInspection) {
        setLatestInspection(res.inspections[0])
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Firewall state')
    } finally {
      setLoading(false)
    }
  }, [addToast, latestInspection])

  useEffect(() => {
    void loadState()
  }, [loadState])

  async function handleToggleRule(ruleId: string) {
    setTogglingId(ruleId)
    try {
      const res = await sdk.agenticSuite.toggleFirewallRule(ruleId)
      setRules(res.rules)
      addToast('success', 'Updated Secret-Zero firewall rule')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to toggle firewall rule')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    if (!payload.trim()) {
      addToast('warning', 'Provide an outbound payload to inspect')
      return
    }
    setScanning(true)
    try {
      const inspection = await sdk.agenticSuite.scanOutboundPayload({
        destination: destination.trim(),
        payload,
      })
      setLatestInspection(inspection)
      await loadState()
      addToast(
        inspection.verdict === 'blocked' ? 'warning' : 'success',
        `Verdict: ${inspection.verdict.toUpperCase()} (${inspection.redactedSecretsCount} secret(s) intercepted)`,
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Outbound payload scan failed')
    } finally {
      setScanning(false)
    }
  }

  const totalHits = rules.reduce((acc, r) => acc + r.hitsCount, 0)
  const enabledRulesCount = rules.filter((r) => r.enabled).length

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              OpenAgents Firewall &amp; Secret-Zero Outbound Interceptor
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Zero-trust DLP proxy that strips API keys, JWTs, database URIs, and private keys before any prompt or tool call leaves your machine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            {enabledRulesCount}/{rules.length} Active Shields
          </span>
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400">
            {totalHits} Secrets Intercepted
          </span>
          <button
            type="button"
            onClick={() => void loadState()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Interactive Outbound Packet Scanner */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Live Outbound DLP &amp; Secret-Zero Sanitizer Simulator
                </h2>
              </div>
              <span className="font-mono text-[11px] text-emerald-400">Inline Wire-Speed Redaction</span>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {SAMPLE_PAYLOADS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setDestination(preset.destination)
                    setPayload(preset.payload)
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-cyan-500/50 hover:text-cyan-400 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300"
                >
                  Load Sample: {preset.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleScan} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Outbound Destination Endpoint (LLM Provider / MCP Server / Webhook)
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 font-mono text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Raw Outbound Payload (Test with sample keys, JWTs, DB URIs, or PEM blocks)
                </label>
                <textarea
                  rows={4}
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={scanning || !payload.trim()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50"
              >
                {scanning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Inspect &amp; Sanitize Outbound Packet
              </button>
            </form>

            {latestInspection && (
              <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/90">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {latestInspection.verdict === 'blocked' ? (
                      <AlertOctagon className="h-4 w-4 text-rose-400" />
                    ) : latestInspection.verdict === 'sanitized_allowed' ? (
                      <ShieldAlert className="h-4 w-4 text-amber-400" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    )}
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Verdict: {latestInspection.verdict.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-cyan-400">
                    {latestInspection.redactedSecretsCount} secret(s) scrubbed · {latestInspection.originalLength} bytes
                  </span>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Sanitized Wire Output Sent to {latestInspection.destination}:
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-emerald-500/30 bg-slate-900 p-3 font-mono text-xs text-emerald-300">
                    {latestInspection.sanitizedPayload}
                  </pre>
                </div>

                {latestInspection.matchedRules.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {latestInspection.matchedRules.map((ruleName) => (
                      <span
                        key={ruleName}
                        className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300"
                      >
                        Triggered: {ruleName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Audit Log */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Lock className="h-4 w-4 text-indigo-400" />
              Recent Outbound Interception Audit Log ({inspections.length})
            </h2>

            {inspections.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No packets inspected in this session yet. Run the simulator above to test Secret-Zero redaction.
              </p>
            ) : (
              <div className="space-y-2.5">
                {inspections.map((pkt) => (
                  <div
                    key={pkt.id}
                    className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/60"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {pkt.destination}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            pkt.verdict === 'blocked'
                              ? 'bg-rose-500/20 text-rose-400'
                              : pkt.verdict === 'sanitized_allowed'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {pkt.verdict}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {new Date(pkt.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <pre className="mt-2 truncate rounded bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
                      {pkt.sanitizedPayload}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Active Firewall Rules */}
        <div className="space-y-4 lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              Secret-Zero &amp; Guardrail Rules ({rules.length})
            </h2>

            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800 dark:bg-slate-950/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {rule.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {rule.patternType}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                            rule.action === 'block'
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-cyan-500/20 text-cyan-400'
                          }`}
                        >
                          Action: {rule.action}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {rule.hitsCount} hits
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggleRule(rule.id)}
                      disabled={togglingId === rule.id}
                      className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        rule.enabled
                          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                          : 'bg-slate-500/15 text-slate-400 hover:bg-slate-500/25'
                      }`}
                    >
                      {togglingId === rule.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Power className="h-3 w-3" />
                      )}
                      {rule.enabled ? 'Active' : 'Bypassed'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
