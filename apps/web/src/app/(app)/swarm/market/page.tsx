'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { SpecialistBidder, SwarmMarketContractRun } from '@openagents/sdk'
import {
  Award,
  CheckCircle2,
  Coins,
  Cpu,
  Gavel,
  Loader2,
  Megaphone,
  RefreshCw,
  Sparkles,
  Timer,
  Trophy,
  Users,
} from 'lucide-react'

const PRESET_MARKET_TASKS = [
  'Architect, security-harden, and benchmark a multi-region WebSocket + SSE agent event streaming gateway with automatic token budget throttling.',
  'Design and verify a zero-downtime PostgreSQL schema migration for multi-tenant RBAC permissions with automated rollback triggers.',
  'Build an autonomous incident triage pipeline that correlates Prometheus latency spikes with recent git commits and synthesizes hotfix PRs.',
]

export default function SwarmMarketPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [bidders, setBidders] = useState<SpecialistBidder[]>([])
  const [history, setHistory] = useState<SwarmMarketContractRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [taskInput, setTaskInput] = useState(PRESET_MARKET_TASKS[0])
  const [loading, setLoading] = useState(true)
  const [broadcasting, setBroadcasting] = useState(false)

  const loadMarket = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sdk.agenticSuite.getSwarmMarket()
      setBidders(data.bidders)
      setHistory(data.history)
      if (data.history.length > 0 && !selectedRunId) {
        setSelectedRunId(data.history[0].id)
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Contract-Net Swarm Market')
    } finally {
      setLoading(false)
    }
  }, [addToast, selectedRunId])

  useEffect(() => {
    void loadMarket()
  }, [loadMarket])

  const handleBroadcastTask = async () => {
    if (!taskInput.trim()) {
      addToast('warning', 'Enter a complex task to broadcast to the specialist market')
      return
    }
    setBroadcasting(true)
    try {
      const run = await sdk.agenticSuite.broadcastMarketTask({ task: taskInput.trim() })
      // Refresh leaderboard reputation & history
      const fresh = await sdk.agenticSuite.getSwarmMarket()
      setBidders(fresh.bidders)
      setHistory(fresh.history)
      setSelectedRunId(run.id)
      addToast(
        'success',
        `Contract-Net auction cleared • ${run.subtasks.length} subtasks awarded & synthesized`,
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Market broadcast failed')
    } finally {
      setBroadcasting(false)
    }
  }

  const activeRun =
    history.find((r) => r.id === selectedRunId) ?? history[0] ?? null

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6 pb-24">
        {/* Header & Broadcast Console */}
        <header className="oa-float-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-300">
                <Gavel size={20} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold text-[var(--tone-strong)]">
                    Contract-Net Swarm Market
                  </h1>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                    Reputation-Based Agent Bidding
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Decomposes complex requests into subtasks and opens an auction where specialist agents bid with
                  confidence, token estimates, and historical reputation scores.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadMarket()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-[var(--tone-strong)] transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh Market
            </button>
          </div>

          {/* Preset Tasks */}
          <div className="mt-4">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Preset Complex Contract Broadcasts:
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESET_MARKET_TASKS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTaskInput(preset)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-[var(--tone-strong)] transition hover:border-amber-500/40 hover:bg-amber-500/10"
                >
                  <Sparkles size={12} className="shrink-0 text-amber-400" />
                  <span className="line-clamp-1 max-w-md">{preset}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Task Broadcast Box */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <textarea
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              rows={2}
              placeholder="Broadcast a multi-disciplinary engineering, security, or architecture task to the agent bidding floor..."
              className="oa-input-surface flex-1 rounded-xl p-3 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void handleBroadcastTask()}
              disabled={broadcasting || !taskInput.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
            >
              {broadcasting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Running Contract Auction...
                </>
              ) : (
                <>
                  <Megaphone size={16} />
                  Broadcast Task &amp; Clear Bids
                </>
              )}
            </button>
          </div>
        </header>

        {/* Specialist Reputation Leaderboard */}
        <section className="oa-float-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                Specialist Reputation Leaderboard ({bidders.length} Active Bidders)
              </h2>
            </div>
            <span className="text-xs text-[var(--muted)]">
              Composite score weights confidence (58%) + historical reputation (42%) + token efficiency
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {bidders.map((specialist, index) => (
              <div
                key={specialist.id}
                className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/30 p-3.5 transition hover:border-amber-500/30"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      #{index + 1} • Rep {specialist.reputationScore}
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-300">
                      {Math.round(specialist.successRate * 100)}% SR
                    </span>
                  </div>

                  <h3 className="mt-2 text-sm font-semibold text-[var(--tone-strong)]">
                    {specialist.name}
                  </h3>
                  <p className="text-[11px] text-[var(--muted)]">{specialist.role}</p>

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {specialist.specialties.map((spec) => (
                      <span
                        key={spec}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1 border-t border-white/10 pt-2.5 text-center text-[10px]">
                  <div>
                    <div className="text-[var(--muted)]">Wins</div>
                    <div className="font-bold text-[var(--tone-strong)]">{specialist.winCount}</div>
                  </div>
                  <div>
                    <div className="text-[var(--muted)]">Latency</div>
                    <div className="font-bold text-[var(--tone-strong)]">
                      {specialist.avgLatencyMs}ms
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--muted)]">Avg Tok</div>
                    <div className="font-bold text-[var(--tone-strong)]">
                      {specialist.avgTokens}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contract Run History Selector */}
        {history.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {history.map((run) => {
              const selected = activeRun?.id === run.id
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left text-xs transition ${
                    selected
                      ? 'border-amber-500/50 bg-amber-500/15 text-[var(--tone-strong)]'
                      : 'border-white/10 bg-black/20 text-[var(--muted)] hover:bg-white/5'
                  }`}
                >
                  <Users size={13} className="text-amber-400" />
                  <span className="max-w-[240px] truncate font-medium">{run.task}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">
                    {run.subtasks.length} subtasks • {run.totalTokens.toLocaleString()} tok
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Active Contract Run Detail */}
        {loading && !activeRun ? (
          <div className="oa-float-card flex items-center justify-center p-12 text-sm text-[var(--muted)]">
            <Loader2 size={18} className="mr-2 animate-spin" />
            Loading Swarm Market contract runs...
          </div>
        ) : !activeRun ? (
          <div className="oa-float-card p-10 text-center">
            <Gavel size={32} className="mx-auto text-amber-400/70" />
            <h2 className="mt-3 text-sm font-semibold text-[var(--tone-strong)]">
              No Contract Auctions Executed Yet
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Broadcast a complex task above to watch specialist agents bid on decomposed subtasks.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Decomposed AwardedSubtask Cards + Competitive Bidding Tables */}
            <div className="space-y-4">
              {activeRun.subtasks.map((subtask, idx) => (
                <div key={subtask.id} className="oa-float-card p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 font-mono text-xs font-bold text-amber-300">
                        #{idx + 1}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--tone-strong)]">
                          {subtask.subtaskTitle}
                        </h3>
                        <p className="text-[11px] text-[var(--muted)]">
                          Contract awarded to{' '}
                          <strong className="text-emerald-300">{subtask.winnerName}</strong> •
                          Winning Composite Score: <strong>{subtask.winningScore}</strong>
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                      <Award size={14} />
                      Winner: {subtask.winnerName}
                    </span>
                  </div>

                  {/* Competitive Bidding Table */}
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                          <th className="px-3.5 py-2.5">Specialist Bidder</th>
                          <th className="px-3.5 py-2.5">Confidence</th>
                          <th className="px-3.5 py-2.5">Reputation</th>
                          <th className="px-3.5 py-2.5">Composite Score</th>
                          <th className="px-3.5 py-2.5">Est. Tokens</th>
                          <th className="px-3.5 py-2.5">Bid Pitch</th>
                          <th className="px-3.5 py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {subtask.bids.map((bid) => (
                          <tr
                            key={bid.bidderId}
                            className={
                              bid.isWinner
                                ? 'bg-emerald-500/10 text-[var(--tone-strong)]'
                                : 'text-[var(--muted)] hover:bg-white/5'
                            }
                          >
                            <td className="px-3.5 py-2.5 font-semibold text-[var(--tone-strong)]">
                              {bid.bidderName}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono">
                              {Math.round(bid.confidence * 100)}%
                            </td>
                            <td className="px-3.5 py-2.5 font-mono">{bid.reputationScore}</td>
                            <td className="px-3.5 py-2.5 font-mono font-bold text-amber-300">
                              {bid.compositeScore}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono">
                              {bid.estimatedTokens.toLocaleString()}
                            </td>
                            <td className="max-w-md px-3.5 py-2.5 text-[11px]">{bid.pitch}</td>
                            <td className="px-3.5 py-2.5 text-right">
                              {bid.isWinner ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                                  <CheckCircle2 size={11} />
                                  Winner
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--muted)]">Outbid</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Winner Specialist Execution Output */}
                  <div className="rounded-xl border border-emerald-500/20 bg-black/40 p-3.5">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-emerald-300">
                      <span>Winning Specialist Execution Deliverable ({subtask.winnerName})</span>
                      <Cpu size={13} />
                    </div>
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200">
                      {subtask.executionOutput}
                    </pre>
                  </div>
                </div>
              ))}
            </div>

            {/* Final Synthesized Result Card */}
            <section className="oa-float-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-400" />
                  <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                    Final Synthesized Contract Deliverable
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Coins size={13} className="text-amber-400" />
                    Total Tokens: <strong className="text-[var(--tone-strong)]">{activeRun.totalTokens.toLocaleString()}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Timer size={13} className="text-sky-400" />
                    {new Date(activeRun.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              <pre className="mt-4 max-h-96 overflow-auto rounded-xl border border-amber-500/25 bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
                {activeRun.synthesizedResult}
              </pre>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
