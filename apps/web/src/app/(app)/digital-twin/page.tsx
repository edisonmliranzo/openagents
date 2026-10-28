'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { DigitalTwinState, ShadowActionCard, WorldStateNode } from '@openagents/sdk'
import {
  Activity,
  BrainCircuit,
  Check,
  CheckCircle2,
  Compass,
  Cpu,
  FileDiff,
  FolderGit2,
  GitBranch,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sliders,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react'

const NODE_CATEGORY_META: Record<
  WorldStateNode['category'],
  { label: string; badgeClass: string; icon: typeof GitBranch }
> = {
  repository: {
    label: 'Repository',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    icon: FolderGit2,
  },
  goal: {
    label: 'Active Goal',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: Target,
  },
  preference: {
    label: 'User Preference',
    badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    icon: Sliders,
  },
  recent_focus: {
    label: 'Recent Focus',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    icon: Compass,
  },
  environment: {
    label: 'Environment',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    icon: Cpu,
  },
}

const SHADOW_CATEGORY_BADGE: Record<ShadowActionCard['category'], string> = {
  code_patch: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  triage_reply: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  research_brief: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  workflow_automation: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
}

export default function DigitalTwinPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [twin, setTwin] = useState<DigitalTwinState | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [generatingShadow, setGeneratingShadow] = useState(false)
  const [actingCardId, setActingCardId] = useState<string | null>(null)
  const [contextPrompt, setContextPrompt] = useState('')
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<
    WorldStateNode['category'] | 'all'
  >('all')

  const loadDigitalTwin = useCallback(async () => {
    setLoading(true)
    try {
      const state = await sdk.agenticSuite.getDigitalTwin()
      setTwin(state)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Digital Twin state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadDigitalTwin()
  }, [loadDigitalTwin])

  const handleSyncTwin = async () => {
    setSyncing(true)
    try {
      const updated = await sdk.agenticSuite.syncDigitalTwin()
      setTwin(updated)
      addToast('success', 'Live World-Model synced with git & workspace state')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to sync Digital Twin')
    } finally {
      setSyncing(false)
    }
  }

  const handleGenerateShadow = async () => {
    setGeneratingShadow(true)
    try {
      const updated = await sdk.agenticSuite.generateShadowActions(
        contextPrompt.trim() || undefined,
      )
      setTwin(updated)
      setContextPrompt('')
      addToast('success', 'Shadow Mode pre-staged new anticipatory action cards')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to generate shadow action cards')
    } finally {
      setGeneratingShadow(false)
    }
  }

  const handleActOnCard = async (cardId: string, decision: 'approved' | 'dismissed') => {
    setActingCardId(cardId)
    try {
      const updated = await sdk.agenticSuite.actOnShadowCard(cardId, decision)
      setTwin(updated)
      addToast(
        decision === 'approved' ? 'success' : 'info',
        decision === 'approved'
          ? 'Shadow card approved & applied'
          : 'Shadow card dismissed',
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to update shadow card')
    } finally {
      setActingCardId(null)
    }
  }

  const filteredNodes =
    twin?.nodes.filter(
      (n) => activeCategoryFilter === 'all' || n.category === activeCategoryFilter,
    ) ?? []

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6 pb-24">
        {/* Header & Live Workspace Metrics */}
        <header className="oa-float-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/15 text-cyan-300">
                <BrainCircuit size={20} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold text-[var(--tone-strong)]">
                    Episodic World-Model &amp; Shadow Digital Twin
                  </h1>
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-300">
                    Live Context Graph • Shadow Pre-Staging
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Maintains a live episodic graph of your repository, goals, preferences, and recent focus—and
                  runs in Shadow Mode to pre-stage high-confidence patches and briefs for one-click approval.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSyncTwin()}
              disabled={syncing || loading}
              className="inline-flex items-center gap-2 self-start rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-cyan-500 disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing Live World State...' : 'Sync Live World State'}
            </button>
          </div>

          {/* Live Workspace Metrics Strip */}
          {twin && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <GitBranch size={13} className="text-sky-400" />
                  Git Branch
                </div>
                <div className="mt-1 truncate font-mono text-sm font-bold text-[var(--tone-strong)]">
                  {twin.gitBranch}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <FileDiff size={13} className="text-amber-400" />
                  Modified Files
                </div>
                <div className="mt-1 text-sm font-bold text-[var(--tone-strong)]">
                  {twin.modifiedFilesCount} dirty files
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <Target size={13} className="text-emerald-400" />
                  Active Goals
                </div>
                <div className="mt-1 text-sm font-bold text-[var(--tone-strong)]">
                  {twin.activeGoalsCount} tracked
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <MessageSquare size={13} className="text-violet-400" />
                  Recent Conversations
                </div>
                <div className="mt-1 text-sm font-bold text-[var(--tone-strong)]">
                  {twin.recentConversationsCount} sessions
                </div>
              </div>

              <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 p-3.5 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <Activity size={13} className="text-cyan-400" />
                  Last Synced At
                </div>
                <div className="mt-1 truncate text-xs font-medium text-[var(--tone-strong)]">
                  {new Date(twin.lastSyncedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>
            </div>
          )}
        </header>

        {loading && !twin ? (
          <div className="oa-float-card flex items-center justify-center p-12 text-sm text-[var(--muted)]">
            <Loader2 size={18} className="mr-2 animate-spin" />
            Loading Episodic World-Model &amp; Shadow Digital Twin...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 6 Cols: Categorized WorldStateNode Cards */}
            <div className="space-y-4 lg:col-span-6">
              <div className="oa-float-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3.5">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-cyan-400" />
                    <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                      Episodic World-State Nodes ({filteredNodes.length})
                    </h2>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(
                      ['all', 'repository', 'goal', 'preference', 'recent_focus', 'environment'] as const
                    ).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategoryFilter(cat)}
                        className={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase transition ${
                          activeCategoryFilter === cat
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-white/5 text-[var(--muted)] hover:bg-white/10'
                        }`}
                      >
                        {cat.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {filteredNodes.map((node) => {
                    const meta = NODE_CATEGORY_META[node.category]
                    const Icon = meta.icon
                    const confidencePct = Math.round(node.confidence * 100)
                    return (
                      <div
                        key={node.id}
                        className="rounded-xl border border-white/10 bg-black/30 p-3.5 transition hover:border-white/20"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.badgeClass}`}
                          >
                            <Icon size={11} />
                            {meta.label}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--muted)]">
                            Confidence: <strong className="text-cyan-300">{confidencePct}%</strong>
                          </span>
                        </div>

                        <h3 className="mt-2 text-sm font-semibold text-[var(--tone-strong)]">
                          {node.label}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                          {node.detail}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right 6 Cols: Shadow Mode Pre-Staged Action Cards */}
            <div className="space-y-4 lg:col-span-6">
              <div className="oa-float-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3.5">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-amber-400" />
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                        Shadow Mode Pre-Staged Action Cards
                      </h2>
                      <p className="text-[11px] text-[var(--muted)]">
                        Anticipatory drafts prepared in the background—one-click Approve &amp; Apply or Dismiss
                      </p>
                    </div>
                  </div>
                </div>

                {/* Generate New Shadow Actions Bar */}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={contextPrompt}
                    onChange={(e) => setContextPrompt(e.target.value)}
                    placeholder="Optional focus hint (e.g. Pre-stage unit tests for modified files)..."
                    className="oa-input-surface h-10 flex-1 rounded-xl px-3 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleGenerateShadow()}
                    disabled={generatingShadow}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 px-3.5 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:opacity-50"
                  >
                    {generatingShadow ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    Pre-Stage Shadow Actions
                  </button>
                </div>

                {/* Shadow Cards List */}
                <div className="mt-4 space-y-3.5">
                  {(twin?.shadowActions ?? []).map((card) => {
                    const confidencePct = Math.round(card.confidence * 100)
                    const isBusy = actingCardId === card.id
                    return (
                      <div
                        key={card.id}
                        className="rounded-xl border border-white/10 bg-black/35 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                SHADOW_CATEGORY_BADGE[card.category]
                              }`}
                            >
                              {card.category.replace('_', ' ')}
                            </span>
                            <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
                              {confidencePct}% match
                            </span>
                          </div>

                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                              card.status === 'approved'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : card.status === 'dismissed'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {card.status}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-sm font-semibold text-[var(--tone-strong)]">
                            {card.title}
                          </h3>
                          <p className="mt-1 text-xs text-[var(--muted)]">{card.rationale}</p>
                        </div>

                        <pre className="max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                          {card.preparedContent}
                        </pre>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          {card.status === 'staged' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleActOnCard(card.id, 'dismissed')}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                              >
                                <X size={13} />
                                Dismiss
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleActOnCard(card.id, 'approved')}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
                              >
                                {isBusy ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Check size={13} />
                                )}
                                Approve &amp; Apply
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                              <CheckCircle2 size={13} className="text-emerald-400" />
                              Action {card.status}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
