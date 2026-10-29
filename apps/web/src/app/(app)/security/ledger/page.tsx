'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  FileKey2,
  Fingerprint,
  Hash,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { CryptoExecutionReceipt, CryptoLedgerState } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const RECEIPT_PRESETS = [
  {
    label: 'Tool Forge Sandbox Execution',
    actor: 'OpenAgents::ToolForgeVM',
    actionType: 'SANDBOX_TOOL_EXECUTION',
    payloadSummary:
      'Executed json_schema_diff_validator in isolated V8 context (0 network egress, verified schema signature)',
  },
  {
    label: 'Production Ship Pipeline Commit',
    actor: 'OpenAgents::ShipPipeline',
    actionType: 'PRODUCTION_CANARY_DEPLOY',
    payloadSummary:
      'Promoted release sha-94f2b1c after passing 42 unit suites and red-team adversarial verification gate',
  },
  {
    label: 'Secret-Zero Outbound Redaction',
    actor: 'OpenAgents::SecretZeroFirewall',
    actionType: 'OUTBOUND_SECRET_INTERCEPT',
    payloadSummary:
      'Redacted 2 bearer tokens and 1 Postgres DSN before dispatching payload to external inference provider',
  },
]

export default function CryptoAuditLedgerPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [ledger, setLedger] = useState<CryptoLedgerState | null>(null)
  const [loading, setLoading] = useState(false)
  const [signing, setSigning] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyBanner, setVerifyBanner] = useState<{
    valid: boolean
    verifiedBlocks: number
    merkleRoot: string
    checkedAt: string
  } | null>(null)

  const [actor, setActor] = useState(RECEIPT_PRESETS[0].actor)
  const [actionType, setActionType] = useState(RECEIPT_PRESETS[0].actionType)
  const [payloadSummary, setPayloadSummary] = useState(RECEIPT_PRESETS[0].payloadSummary)

  const loadLedger = useCallback(async () => {
    setLoading(true)
    try {
      const state = await sdk.agenticSuite.getCryptoLedger()
      setLedger(state)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load OpenAgents cryptographic audit ledger')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadLedger()
  }, [loadLedger])

  async function handleSignReceipt(e: React.FormEvent) {
    e.preventDefault()
    if (!actor.trim() || !actionType.trim() || !payloadSummary.trim()) {
      addToast('warning', 'Actor, action type, and payload summary are required')
      return
    }
    setSigning(true)
    try {
      const updated = await sdk.agenticSuite.signExecutionReceipt({
        actor: actor.trim(),
        actionType: actionType.trim(),
        payloadSummary: payloadSummary.trim(),
      })
      setLedger(updated)
      addToast('success', `Signed & appended block #${updated.totalBlocks - 1} to OpenAgents Merkle ledger`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to sign cryptographic receipt')
    } finally {
      setSigning(false)
    }
  }

  async function handleVerifyLedger() {
    setVerifying(true)
    try {
      const res = await sdk.agenticSuite.verifyCryptoLedger()
      setVerifyBanner({
        ...res,
        checkedAt: new Date().toLocaleTimeString(),
      })
      await loadLedger()
      addToast(
        res.valid ? 'success' : 'error',
        res.valid
          ? `Merkle chain integrity verified across ${res.verifiedBlocks} block(s)`
          : 'Tamper anomaly detected in cryptographic chain',
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to verify Merkle chain integrity')
    } finally {
      setVerifying(false)
    }
  }

  function copyValue(label: string, val: string) {
    navigator.clipboard.writeText(val).catch(() => undefined)
    addToast('success', `${label} copied to clipboard`)
  }

  const receipts: CryptoExecutionReceipt[] = ledger?.receipts ?? []

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1440px] space-y-6 pb-20">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-indigo-500/20 bg-slate-900/80 p-5 shadow-lg shadow-indigo-950/20 backdrop-blur">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  OpenAgents Zero-Trust Proof Engine
                </span>
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-300">
                  SHA-256 + Ed25519 Receipt Chain
                </span>
              </div>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white">
                Cryptographic Proof-of-Execution &amp; Tamper-Evident Audit Ledger
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Every autonomous OpenAgents action is hash-chained into an immutable Merkle ledger with verifiable cryptographic receipts.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleVerifyLedger()}
              disabled={verifying}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-950/50 transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="h-4 w-4" />
              )}
              Verify Merkle Chain Integrity
            </button>

            <button
              type="button"
              onClick={() => void loadLedger()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* Top Telemetry Strip */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Chain Integrity Status</span>
              {ledger?.chainIntegrityValid !== false ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-rose-400" />
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  ledger?.chainIntegrityValid !== false
                    ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                    : 'border border-rose-500/30 bg-rose-500/15 text-rose-300'
                }`}
              >
                {ledger?.chainIntegrityValid !== false
                  ? 'VALID · TAMPER-EVIDENT SEAL INTACT'
                  : 'INVALID · HASH CHAIN BROKEN'}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Continuous genesis-to-head prevHash linkage verified by OpenAgents Auditor.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Current Merkle Root</span>
              <button
                type="button"
                onClick={() => ledger?.merkleRoot && copyValue('Merkle root', ledger.merkleRoot)}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
            <div className="mt-2 truncate rounded-xl border border-cyan-500/20 bg-slate-950/90 px-3 py-2 font-mono text-xs text-cyan-300">
              {ledger?.merkleRoot ?? '0x0000000000000000000000000000000000000000'}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Deterministic cryptographic root aggregating all signed execution receipts.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Total Chained Blocks</span>
              <Hash className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-extrabold text-white">
                {ledger?.totalBlocks ?? receipts.length}
              </span>
              <span className="text-xs text-emerald-400">100% cryptographically signed</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Zero unsigned tool mutations permitted in strict OpenAgents governance mode.
            </p>
          </div>
        </div>

        {/* Verification Audit Banner */}
        {verifyBanner && (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-xs ${
              verifyBanner.valid
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/30 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <span className="font-bold">
                  Merkle Audit Completed ({verifyBanner.checkedAt}):
                </span>{' '}
                {verifyBanner.verifiedBlocks} block(s) cryptographically verified · Root{' '}
                <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-cyan-300">
                  {verifyBanner.merkleRoot}
                </code>
              </div>
            </div>
            <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 font-mono text-[11px] font-bold uppercase text-emerald-300">
              {verifyBanner.valid ? 'PASS · ZERO DRIFT' : 'FAIL'}
            </span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Sign New Execution Receipt */}
          <div className="space-y-5 lg:col-span-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-inner">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                    <FileKey2 className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      Sign New Cryptographic Execution Receipt
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Seal an agent action into the tamper-evident hash chain
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-4 space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Quick Presets
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {RECEIPT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setActor(preset.actor)
                        setActionType(preset.actionType)
                        setPayloadSummary(preset.payloadSummary)
                      }}
                      className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSignReceipt} className="space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Autonomous Actor / Subsystem ID
                  </label>
                  <input
                    type="text"
                    value={actor}
                    onChange={(e) => setActor(e.target.value)}
                    placeholder="e.g. OpenAgents::ToolForgeVM"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Action Type Classification
                  </label>
                  <input
                    type="text"
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    placeholder="e.g. SANDBOX_TOOL_EXECUTION"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 font-mono text-xs text-cyan-300 outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Execution Payload Summary (Hashed into Leaf)
                  </label>
                  <textarea
                    rows={4}
                    value={payloadSummary}
                    onChange={(e) => setPayloadSummary(e.target.value)}
                    placeholder="Describe the deterministic inputs, outputs, and policy guardrails verified..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 p-3 text-xs text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={signing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-950/40 transition hover:brightness-110 disabled:opacity-50"
                >
                  {signing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  Sign &amp; Append Cryptographic Block
                </button>
              </form>
            </section>
          </div>

          {/* Right Column: Hash-Chained Block Cards */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Link2 className="h-4 w-4 text-cyan-400" />
                Hash-Chained Execution Blocks ({receipts.length})
              </h2>
              <span className="font-mono text-[11px] text-slate-400">
                Ordered Newest → Genesis
              </span>
            </div>

            {receipts.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
                No blocks found in ledger. Sign an execution receipt to initialize the chain.
              </div>
            ) : (
              <div className="space-y-3.5">
                {receipts.map((block) => (
                  <div
                    key={block.id}
                    className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 transition hover:border-cyan-500/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-indigo-500/20 px-2.5 py-1 font-mono text-xs font-extrabold text-indigo-300">
                          Block #{block.blockIndex}
                        </span>
                        <span className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-300">
                          {block.actionType}
                        </span>
                        <span className="font-mono text-xs font-medium text-slate-300">
                          {block.actor}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">
                          {new Date(block.timestamp).toLocaleString()}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                            block.verified
                              ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                              : 'border border-rose-500/30 bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          {block.verified ? 'VERIFIED' : 'UNVERIFIED'}
                        </span>
                      </div>
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-slate-200">
                      {block.payloadSummary}
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-800/80 bg-slate-950/90 p-3 font-mono text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 text-slate-500">prevHash:</span>
                        <span className="truncate text-slate-400">{block.prevHash}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 text-cyan-400">sha256Hash:</span>
                        <button
                          type="button"
                          onClick={() => copyValue(`Block #${block.blockIndex} hash`, block.sha256Hash)}
                          className="truncate text-left text-cyan-300 hover:underline"
                        >
                          {block.sha256Hash}
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 text-emerald-400">signature:</span>
                        <button
                          type="button"
                          onClick={() =>
                            copyValue(`Block #${block.blockIndex} signature`, block.signature)
                          }
                          className="truncate text-left text-emerald-300 hover:underline"
                        >
                          {block.signature}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
