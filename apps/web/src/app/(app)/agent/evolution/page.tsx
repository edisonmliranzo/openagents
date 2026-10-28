'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Dna,
  Flame,
  GitBranch,
  Loader2,
  Sparkles,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import type { PromptChromosome } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const BENCHMARK_PRESETS = [
  'Maximize sub-second tool accuracy and eliminate redundant planning preambles',
  'Enforce strict JSON schema invariants with zero hallucinated citations',
  'Optimize multi-agent @Forge code synthesis for zero TypeScript compile errors',
]

export default function PromptEvolutionArenaPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [chromosomes, setChromosomes] = useState<PromptChromosome[]>([])
  const [benchmarkGoal, setBenchmarkGoal] = useState(BENCHMARK_PRESETS[0])
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  const loadArena = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getEvolutionArena()
      const list = res.chromosomes ?? []
      setChromosomes(list)
      if (list[0]) {
        setExpandedIds((prev) => ({ ...prev, [list[0].id]: true }))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Prompt Evolution Arena')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadArena()
  }, [loadArena])

  const handleMutateGeneration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!benchmarkGoal.trim()) {
      addToast('warning', 'Enter an optimization objective for the genetic tournament')
      return
    }
    setMutating(true)
    try {
      const res = await sdk.agenticSuite.runEvolutionGeneration({
        benchmarkGoal: benchmarkGoal.trim(),
      })
      setChromosomes(res.chromosomes ?? [])
      if (res.newChampion) {
        setExpandedIds((prev) => ({ ...prev, [res.newChampion.id]: true }))
        addToast(
          'success',
          `Evolved ${res.newChampion.label} (Fitness ${res.newChampion.fitnessScore})`,
        )
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Genetic crossover mutation failed')
    } finally {
      setMutating(false)
    }
  }

  const handlePromote = async (chromosomeId: string) => {
    setPromotingId(chromosomeId)
    try {
      const res = await sdk.agenticSuite.promotePromptVariant(chromosomeId)
      setChromosomes(res.chromosomes ?? [])
      addToast('success', 'Promoted chromosome to active Production Champion')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to promote chromosome')
    } finally {
      setPromotingId(null)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const stats = useMemo(() => {
    const currentGen = chromosomes.reduce((m, c) => Math.max(m, c.generation), 1)
    const champion = chromosomes.find((c) => c.isChampion) ?? chromosomes[0]
    return { currentGen, champion }
  }, [chromosomes])

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        {/* Header */}
        <header className="oa-float-card flex flex-wrap items-center justify-between gap-4 border border-emerald-500/25 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950/70 p-5 text-white">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 text-white shadow-lg shadow-emerald-500/25">
              <Dna size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                  OpenAgents Prompt &amp; Agent Evolution Arena
                </h1>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  Generation #{stats.currentGen}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                DSPy-style genetic prompt optimizer that mutates system directives, benchmarks Pareto fitness (accuracy vs. latency vs. token burn), and promotes the winning chromosome.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2">
              <div className="font-mono text-base font-black text-emerald-400">
                Gen {stats.currentGen}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Active Lineage
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2">
              <div className="font-mono text-base font-black text-cyan-400">
                {stats.champion?.fitnessScore ?? 95.8}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Peak Pareto Fitness
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2">
              <div className="font-mono text-base font-black text-indigo-400">
                {stats.champion?.avgLatencyMs ?? 680}ms
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Champion Latency
              </div>
            </div>
          </div>
        </header>

        {/* Genetic Crossover & Mutation Runner */}
        <section className="oa-float-card p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
              <Sparkles size={15} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[var(--tone-strong)]">
                Evolve Next Generation (Tournament Selection + Crossover)
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Specify the target fitness objective to breed and benchmark Generation #{stats.currentGen + 1}
              </p>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {BENCHMARK_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setBenchmarkGoal(preset)}
                className="rounded-xl border border-slate-200/80 bg-slate-100/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-emerald-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-emerald-500/60"
              >
                {preset}
              </button>
            ))}
          </div>

          <form onSubmit={handleMutateGeneration} className="flex flex-col gap-2.5 sm:flex-row">
            <input
              className="oa-input-surface h-11 flex-1 rounded-xl px-3.5 text-sm outline-none"
              value={benchmarkGoal}
              onChange={(e) => setBenchmarkGoal(e.target.value)}
              placeholder="Enter evolutionary benchmark objective…"
            />
            <button
              type="submit"
              disabled={mutating}
              className="oa-accent-button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-xs font-bold text-white disabled:opacity-50"
            >
              {mutating ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Mutating Gen #{stats.currentGen + 1}…
                </>
              ) : (
                <>
                  <Dna size={15} />
                  Run Genetic Crossover &amp; Mutation
                </>
              )}
            </button>
          </form>
        </section>

        {/* Chromosome Population Cards */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-[var(--tone-strong)]">
              Prompt Chromosome Lineage ({chromosomes.length} Variants)
            </h2>
            <span className="text-xs text-[var(--muted)]">
              Sorted by generation &amp; Pareto fitness score
            </span>
          </div>

          {loading && chromosomes.length === 0 ? (
            <div className="oa-float-card flex items-center justify-center py-12 text-xs text-[var(--muted)]">
              <Loader2 size={16} className="mr-2 animate-spin" /> Loading chromosome arena…
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {chromosomes.map((chr) => {
                const expanded = !!expandedIds[chr.id]
                const estCostUsd = ((chr.avgTokens / 1000) * 0.0025).toFixed(4)
                return (
                  <div
                    key={chr.id}
                    className={`rounded-2xl border p-5 transition ${
                      chr.isChampion
                        ? 'border-emerald-500/60 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950/40 text-white shadow-lg shadow-emerald-500/10'
                        : 'border-slate-800 bg-slate-950/90 text-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-indigo-500/20 px-2.5 py-0.5 font-mono text-xs font-black text-indigo-300">
                            Gen-{chr.generation}
                          </span>
                          <h3 className="text-sm font-extrabold text-white">{chr.label}</h3>
                          {chr.isChampion && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-300">
                              <Trophy size={11} /> Active Champion
                            </span>
                          )}
                        </div>
                        <p className="flex items-center gap-2 text-xs text-slate-400">
                          <GitBranch size={12} className="text-cyan-400" />
                          <span>Mutation Strategy: {chr.mutationStrategy}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {!chr.isChampion && (
                          <button
                            type="button"
                            disabled={promotingId === chr.id}
                            onClick={() => void handlePromote(chr.id)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
                          >
                            {promotingId === chr.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Award size={13} />
                            )}
                            Promote to Champion
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleExpand(chr.id)}
                          className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500"
                        >
                          DNA
                          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Metrics Bar */}
                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
                        <div className="text-[10px] uppercase text-slate-400">Fitness Score</div>
                        <div className="mt-0.5 font-mono text-sm font-black text-emerald-400">
                          {chr.fitnessScore} / 100
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
                        <div className="text-[10px] uppercase text-slate-400">
                          Win Rate / Accuracy
                        </div>
                        <div className="mt-0.5 font-mono text-sm font-black text-cyan-400">
                          {chr.accuracyScore}%
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
                        <div className="text-[10px] uppercase text-slate-400">Avg Latency</div>
                        <div className="mt-0.5 font-mono text-sm font-black text-indigo-400">
                          {chr.avgLatencyMs}ms
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
                        <div className="text-[10px] uppercase text-slate-400">
                          Est. Cost / Run ({chr.avgTokens} tok)
                        </div>
                        <div className="mt-0.5 font-mono text-sm font-black text-amber-400">
                          ${estCostUsd}
                        </div>
                      </div>
                    </div>

                    {/* Expandable System Prompt DNA */}
                    {expanded && (
                      <div className="mt-3 rounded-xl border border-cyan-500/25 bg-slate-900/95 p-3.5">
                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-cyan-300">
                          <span>System Prompt DNA Directive</span>
                          <span className="font-mono text-[10px] text-slate-400">id: {chr.id}</span>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-100">
                          {chr.systemPromptSnippet}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
