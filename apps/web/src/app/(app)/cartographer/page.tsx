'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { CartographerMapState, CartographerNode } from '@openagents/sdk'
import {
  Activity,
  Compass,
  FileCode2,
  FolderGit2,
  GitBranch,
  Layers,
  Loader2,
  Network,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

const LAYER_ORDER: Array<{
  layer: CartographerNode['layer']
  title: string
  badgeColor: string
  cardBorder: string
}> = [
  {
    layer: 'client_ui',
    title: 'Client UI Surface (Next.js App Router)',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    cardBorder: 'border-cyan-500/30',
  },
  {
    layer: 'sdk_contract',
    title: 'Typed SDK & Transport Contract (@openagents/sdk)',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    cardBorder: 'border-indigo-500/30',
  },
  {
    layer: 'api_controller',
    title: 'API Gateway & NestJS Controllers',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    cardBorder: 'border-violet-500/30',
  },
  {
    layer: 'domain_service',
    title: 'Autonomous Domain & Orchestration Services',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    cardBorder: 'border-emerald-500/30',
  },
  {
    layer: 'persistence',
    title: 'Persistence, Prisma ORM & Episodic Memory Store',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    cardBorder: 'border-amber-500/30',
  },
]

const SCOPE_PRESETS = [
  'OpenAgents Full Monorepo (apps/web + apps/api + packages/sdk)',
  'Frontier Agentic Suite & Autonomous Engines (agentic-suite.*)',
  'Zero-Trust Security, Secret-Zero Firewall & Cryptographic Ledger',
  'Swarm Market Contract-Net & Multiplayer War Room Mesh',
]

export default function RepoCartographerPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [mapState, setMapState] = useState<CartographerMapState | null>(null)
  const [targetScope, setTargetScope] = useState(SCOPE_PRESETS[0])
  const [selectedLayer, setSelectedLayer] = useState<CartographerNode['layer'] | 'all'>('all')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)

  const loadMap = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sdk.agenticSuite.getCartographerState()
      setMapState(data)
      if (data.nodes.length > 0) {
        setSelectedNodeId((prev) => (prev && data.nodes.some((n) => n.id === prev) ? prev : data.nodes[0].id))
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load OpenAgents Cartographer state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadMap()
  }, [loadMap])

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetScope.trim()) return
    setScanning(true)
    try {
      const updated = await sdk.agenticSuite.scanCartographerMap({
        targetScope: targetScope.trim(),
      })
      setMapState(updated)
      if (updated.nodes.length > 0) {
        setSelectedNodeId(updated.nodes[0].id)
      }
      addToast('success', `Scanned ${updated.totalFilesScanned} files across ${updated.nodes.length} architecture nodes`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Cartographer scan failed')
    } finally {
      setScanning(false)
    }
  }

  const visibleLayers = useMemo(() => {
    if (selectedLayer === 'all') return LAYER_ORDER
    return LAYER_ORDER.filter((l) => l.layer === selectedLayer)
  }, [selectedLayer])

  const selectedNode = useMemo(() => {
    if (!mapState?.nodes.length) return null
    return mapState.nodes.find((n) => n.id === selectedNodeId) ?? mapState.nodes[0]
  }, [mapState, selectedNodeId])

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        {/* Header */}
        <header className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-indigo-950/80 p-6 shadow-2xl">
          <div className="pointer-events-none absolute -right-14 -top-14 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                <Compass size={13} />
                OpenAgents Multimodal Repo &amp; Architecture Topology
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Multimodal Deep Document &amp; Repo Cartographer
              </h1>
              <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                Interactive 5-layer architecture map and blast-radius inspector across Client UI, SDK Contracts, NestJS
                Controllers, Domain Services, and Persistence layers.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadMap()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Sync Topology
            </button>
          </div>

          {/* Summary KPI Strip */}
          {mapState && (
            <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Active Target Scope</span>
                  <FolderGit2 size={15} className="text-cyan-400" />
                </div>
                <div className="mt-1.5 truncate font-mono text-xs font-bold text-cyan-300">
                  {mapState.targetScope}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Updated {new Date(mapState.updatedAt).toLocaleTimeString()}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Total Files Scanned</span>
                  <FileCode2 size={15} className="text-indigo-400" />
                </div>
                <div className="mt-1.5 text-2xl font-black text-white">
                  {mapState.totalFilesScanned}
                </div>
                <div className="mt-1 text-[11px] text-indigo-300">
                  {mapState.nodes.length} critical architecture nodes mapped
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Critical Path Summary</span>
                  <Activity size={15} className="text-emerald-400" />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                  {mapState.criticalPathSummary}
                </p>
              </div>
            </div>
          )}
        </header>

        {/* Scan Target Scope Form */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
                <Radar size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-white">
                  Scan Repository Subsystem or Architecture Spec
                </h2>
                <p className="text-xs text-slate-400">
                  Re-computes cross-package dependency graphs and blast-radius scores
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SCOPE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetScope(preset)}
                  className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  {preset.split('(')[0].trim()}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleScan} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={targetScope}
              onChange={(e) => setTargetScope(e.target.value)}
              placeholder="Enter repository path, package scope, or architecture domain…"
              className="h-11 flex-1 rounded-xl border border-slate-700/80 bg-slate-950/90 px-4 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={scanning || !targetScope.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 px-6 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              {scanning ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Mapping Repo…
                </>
              ) : (
                <>
                  <Search size={15} />
                  Scan Cartographer Map
                </>
              )}
            </button>
          </form>

          {/* Layer Filter Pills */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedLayer('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                selectedLayer === 'all'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              All 5 Layers ({mapState?.nodes.length ?? 0})
            </button>
            {LAYER_ORDER.map((l) => {
              const count = mapState?.nodes.filter((n) => n.layer === l.layer).length ?? 0
              return (
                <button
                  key={l.layer}
                  type="button"
                  onClick={() => setSelectedLayer(l.layer)}
                  className={`rounded-xl border px-3 py-1.5 font-mono text-xs font-semibold transition ${
                    selectedLayer === l.layer
                      ? l.badgeColor
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {l.layer} ({count})
                </button>
              )
            })}
          </div>
        </section>

        {/* Interactive Blast-Radius Spotlight Inspector */}
        {selectedNode && (
          <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 p-5 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-cyan-500/20 px-2.5 py-0.5 font-mono text-[11px] font-bold text-cyan-300">
                    {selectedNode.layer}
                  </span>
                  <span className="font-mono text-xs text-slate-400">{selectedNode.filePath}</span>
                </div>
                <h3 className="text-lg font-extrabold text-white">{selectedNode.label}</h3>
                <p className="max-w-3xl text-xs leading-relaxed text-slate-300">
                  {selectedNode.summary}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Blast Radius Score
                </div>
                <div
                  className={`text-2xl font-black ${
                    selectedNode.blastRadiusScore >= 85
                      ? 'text-rose-400'
                      : selectedNode.blastRadiusScore >= 70
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                  }`}
                >
                  {selectedNode.blastRadiusScore}/100
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Downstream Dependencies ({selectedNode.dependencies.length}):
              </span>
              {selectedNode.dependencies.map((dep) => (
                <span
                  key={dep}
                  className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 font-mono text-[11px] text-indigo-200"
                >
                  {dep}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Layer-Grouped Architecture Map */}
        <div className="space-y-5">
          {visibleLayers.map((layerMeta) => {
            const layerNodes =
              mapState?.nodes.filter((n) => n.layer === layerMeta.layer) ?? []
            if (layerNodes.length === 0) return null

            return (
              <section
                key={layerMeta.layer}
                className="rounded-3xl border border-slate-800 bg-slate-900/75 p-5 shadow-lg"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Layers size={16} className="text-cyan-400" />
                    <h2 className="text-sm font-bold text-white">{layerMeta.title}</h2>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold ${layerMeta.badgeColor}`}
                  >
                    {layerMeta.layer}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  {layerNodes.map((node) => {
                    const isSelected = selectedNode?.id === node.id
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? 'border-cyan-400 bg-slate-950/95 shadow-md shadow-cyan-500/10'
                            : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-bold text-white">{node.label}</div>
                              <div className="mt-0.5 font-mono text-[11px] text-cyan-300">
                                {node.filePath}
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded-lg px-2 py-0.5 font-mono text-[11px] font-bold ${
                                node.blastRadiusScore >= 85
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : node.blastRadiusScore >= 70
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              Blast {node.blastRadiusScore}
                            </span>
                          </div>

                          <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                            {node.summary}
                          </p>
                        </div>

                        <div className="mt-3 border-t border-slate-800/80 pt-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Dependencies ({node.dependencies.length})
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {node.dependencies.map((dep) => (
                              <span
                                key={dep}
                                className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300"
                              >
                                {dep}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
