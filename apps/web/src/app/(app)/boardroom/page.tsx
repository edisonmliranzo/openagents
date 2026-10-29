'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { BoardroomSimulationRun } from '@openagents/sdk'
import {
  AlertTriangle,
  Award,
  Briefcase,
  CheckCircle2,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react'

const SYNTHETIC_PERSONA_PROFILES = [
  {
    name: 'Marcus Vance',
    role: 'Enterprise CTO',
    focus: 'SOC2 compliance, self-hosted VPC deployment, RBAC governance, and predictable SLA guarantees',
    accent: 'from-indigo-500/20 to-blue-500/10 border-indigo-500/30 text-indigo-300',
  },
  {
    name: 'Elena Rostova',
    role: 'YC Founder',
    focus: '10x shipping velocity, zero-config onboarding, immediate ROI in <5 minutes, and developer delight',
    accent: 'from-cyan-500/20 to-teal-500/10 border-cyan-500/30 text-cyan-300',
  },
  {
    name: 'Devon K.',
    role: 'Security Architect',
    focus: 'Secret-Zero outbound redaction, sandbox isolation, cryptographic audit ledgers, and prompt-injection defense',
    accent: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300',
  },
  {
    name: 'Aria Lin',
    role: 'Growth VP',
    focus: 'Viral team expansion loops, transparent usage-based pricing, shareable artifacts, and conversion friction',
    accent: 'from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-300',
  },
]

const PROPOSAL_PRESETS = [
  {
    label: 'OpenAgents Pro Team Tier ($49/seat)',
    proposal:
      'Launch OpenAgents Pro Team Tier at $49/seat/month including unlimited Overnight Missions, Multiplayer War Rooms, Secret-Zero Outbound Firewall, and 1-Click Prompt-to-Production Ship Pipelines with SOC2 audit receipts.',
  },
  {
    label: 'Autonomous PR & CI Healer Launch Copy',
    proposal:
      'Headline: "Never wake up to a broken build again." OpenAgents Ambient Sentinel watches your git diffs and CI pipelines 24/7, synthesizes verified patches in an isolated VM sandbox, and opens a signed PR before your morning coffee.',
  },
  {
    label: 'Enterprise BYOK + Local Ollama Hybrid Mode',
    proposal:
      'Introduce OpenAgents Hybrid Routing: sensitive PII and proprietary code stay 100% on local Qwen-2.5-Coder LoRA weights while public research tasks dynamically arbitrage across frontier APIs.',
  },
]

function verdictBadgeConfig(verdict: BoardroomSimulationRun['consensusVerdict']) {
  switch (verdict) {
    case 'ship_now':
      return {
        label: 'CONSENSUS: SHIP NOW',
        cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
      }
    case 'iterate_copy_and_ux':
      return {
        label: 'CONSENSUS: ITERATE COPY & UX',
        cls: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
      }
    case 'high_risk_rework':
      return {
        label: 'CONSENSUS: HIGH-RISK REWORK NEEDED',
        cls: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
      }
  }
}

export default function BoardroomSimulatorPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [runs, setRuns] = useState<BoardroomSimulationRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string>('')
  const [proposal, setProposal] = useState(PROPOSAL_PRESETS[0].proposal)
  const [loading, setLoading] = useState(false)
  const [simulating, setSimulating] = useState(false)

  const activeRun = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null

  const loadRuns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getBoardroomState()
      setRuns(res.runs)
      if (res.runs.length > 0) {
        setSelectedRunId((prev) => (prev && res.runs.some((r) => r.id === prev) ? prev : res.runs[0].id))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load OpenAgents Boardroom simulations')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proposal.trim()) return
    setSimulating(true)
    try {
      const run = await sdk.agenticSuite.runBoardroomSimulation({
        proposal: proposal.trim(),
      })
      setRuns((prev) => [run, ...prev])
      setSelectedRunId(run.id)
      addToast('success', `Boardroom simulation completed (${run.overallScore}/100 consensus)`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Boardroom simulation failed')
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        {/* Header */}
        <header className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-indigo-950/80 p-6 shadow-2xl">
          <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                <Users size={13} />
                OpenAgents Synthetic Executive Panel
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Multi-Persona Boardroom &amp; Synthetic User Simulator
              </h1>
              <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                Stress-test any OpenAgents product feature, pricing tier, or launch copy against 4 calibrated buyer
                personas before writing a single line of production code.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRuns()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh Panel
            </button>
          </div>

          {/* 4 Calibrated PersonaRoster Pills */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SYNTHETIC_PERSONA_PROFILES.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border bg-gradient-to-br p-3.5 ${p.accent}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{p.name}</span>
                  <span className="rounded-md bg-slate-950/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {p.role}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{p.focus}</p>
              </div>
            ))}
          </div>
        </header>

        {/* Proposal Input Form */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
                <Briefcase size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-white">
                  Submit Product Feature, Pricing Tier, or Launch Copy
                </h2>
                <p className="text-xs text-slate-400">
                  Marcus Vance, Elena Rostova, Devon K., and Aria Lin will independently score conversion likelihood and
                  propose concrete fixes
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PROPOSAL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setProposal(preset.proposal)}
                  className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSimulate} className="space-y-3">
            <textarea
              rows={3}
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              placeholder="Paste your feature spec, pricing structure, or landing page value proposition…"
              className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/90 p-3.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {runs.length > 1 && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>History:</span>
                    {runs.slice(0, 4).map((r, idx) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRunId(r.id)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          activeRun?.id === r.id
                            ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/50'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Run #{runs.length - idx} ({r.overallScore}%)
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={simulating || !proposal.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
              >
                {simulating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Convening Boardroom…
                  </>
                ) : (
                  <>
                    <Rocket size={15} />
                    Run Boardroom Simulation
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Active Simulation Output */}
        {activeRun && (
          <div className="space-y-5">
            {/* Executive Synthesis Banner */}
            <section className="rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${
                        verdictBadgeConfig(activeRun.consensusVerdict).cls
                      }`}
                    >
                      <Award size={14} />
                      {verdictBadgeConfig(activeRun.consensusVerdict).label}
                    </span>
                    <span className="text-xs text-slate-400">
                      Simulated {new Date(activeRun.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-300">
                    <span className="font-semibold text-slate-400">Evaluated Proposal:</span> {activeRun.proposal}
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-slate-950/80 px-4 py-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Overall Board Score
                    </div>
                    <div className="text-2xl font-black text-cyan-300">
                      {activeRun.overallScore}
                      <span className="text-sm font-normal text-slate-500">/100</span>
                    </div>
                  </div>
                  <TrendingUp size={24} className="text-emerald-400" />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-300">
                  <Sparkles size={14} />
                  Executive Synthesis (executiveSynthesis)
                </div>
                <p className="text-xs leading-relaxed text-slate-200 sm:text-sm">
                  {activeRun.executiveSynthesis}
                </p>
              </div>
            </section>

            {/* 4 Persona Critique Cards */}
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {activeRun.critiques.map((critique) => (
                <article
                  key={critique.personaId}
                  className="flex flex-col justify-between rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-lg transition hover:border-cyan-500/40"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                      <div>
                        <h3 className="text-base font-extrabold text-white">
                          {critique.personaName}
                        </h3>
                        <p className="text-xs font-medium text-cyan-300">{critique.role}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Conversion Likelihood
                        </span>
                        <div className="mt-0.5 flex items-center justify-end gap-1.5">
                          <span
                            className={`text-lg font-black ${
                              critique.conversionLikelihoodPct >= 80
                                ? 'text-emerald-300'
                                : critique.conversionLikelihoodPct >= 65
                                  ? 'text-cyan-300'
                                  : 'text-amber-300'
                            }`}
                          >
                            {critique.conversionLikelihoodPct}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Conversion Progress Bar */}
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400"
                        style={{ width: `${Math.min(100, Math.max(5, critique.conversionLikelihoodPct))}%` }}
                      />
                    </div>

                    <div className="mt-4 space-y-3 text-xs">
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-3">
                        <div className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wider text-emerald-300">
                          <CheckCircle2 size={13} />
                          Top Praise (topPraise)
                        </div>
                        <p className="leading-relaxed text-slate-200">{critique.topPraise}</p>
                      </div>

                      <div className="rounded-2xl border border-amber-500/25 bg-amber-950/20 p-3">
                        <div className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-300">
                          <MessageSquareWarning size={13} />
                          Primary Objection (topObjection)
                        </div>
                        <p className="leading-relaxed text-slate-200">{critique.topObjection}</p>
                      </div>

                      <div className="rounded-2xl border border-cyan-500/25 bg-cyan-950/20 p-3">
                        <div className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wider text-cyan-300">
                          <Wrench size={13} />
                          Concrete Fix (concreteFix)
                        </div>
                        <p className="leading-relaxed text-slate-200">{critique.concreteFix}</p>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
