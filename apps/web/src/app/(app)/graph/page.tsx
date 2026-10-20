'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { Loader2, Network, RefreshCw, Search, X } from 'lucide-react'

type GraphEntityType = 'person' | 'project' | 'company' | 'topic' | 'place'

interface GraphNode {
  id: string
  name: string
  type: GraphEntityType
  summary: string
  mentionCount: number
  createdAt: string
  updatedAt: string
}

interface GraphEdge {
  id: string
  fromId: string
  toId: string
  relation: string
  weight: number
}

interface GraphSnapshot {
  nodes: GraphNode[]
  edges: GraphEdge[]
  lastRunAt: string | null
  running: boolean
}

interface GraphEntityDetail {
  entity: GraphNode & {
    mentions: Array<{ source: string; sourceId: string; snippet: string; at: string }>
  }
  relations: Array<
    GraphEdge & { direction: 'in' | 'out'; other: { id: string; name: string; type: GraphEntityType } | null }
  >
}

const TYPE_COLOR: Record<GraphEntityType, string> = {
  person: '#2563eb',
  project: '#10b981',
  company: '#f59e0b',
  topic: '#8b5cf6',
  place: '#ec4899',
}

export default function GraphPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GraphEntityDetail | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const loadGraph = useCallback(
    async (q?: string) => {
      try {
        const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
        const res = await sdk.client.get<GraphSnapshot>(`/api/v1/graph${qs}`)
        setSnapshot(res)
      } catch (e: any) {
        addToast('error', e?.message ?? 'Failed to load knowledge graph')
      }
    },
    [addToast],
  )

  useEffect(() => {
    void loadGraph()
  }, [loadGraph])

  const openEntity = async (id: string) => {
    setSelectedId(id)
    try {
      const d = await sdk.client.get<GraphEntityDetail>(`/api/v1/graph/entity/${encodeURIComponent(id)}`)
      setDetail(d)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load entity details')
    }
  }

  const rebuild = async (full = false) => {
    setBusy('rebuild')
    try {
      const res = await sdk.client.post<{ ok: boolean; entities?: number; relations?: number; reason?: string }>(
        `/api/v1/graph/rebuild${full ? '?full=true' : ''}`,
      )
      if (res.ok) {
        addToast('success', `Graph rebuilt: ${res.entities ?? 0} entities, ${res.relations ?? 0} relations`)
      } else {
        addToast('info', res.reason ?? 'Rebuild skipped')
      }
      await loadGraph(query)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Rebuild failed')
    } finally {
      setBusy(null)
    }
  }

  const layout = useMemo(() => {
    const nodes = snapshot?.nodes ?? []
    const cx = 400
    const cy = 260
    const r = Math.min(200, Math.max(90, nodes.length * 12))
    const pos = new Map<string, { x: number; y: number; node: GraphNode }>()
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, nodes.length) - Math.PI / 2
      const ring = i % 2 === 0 ? r : r * 0.65
      pos.set(n.id, {
        x: cx + Math.cos(angle) * ring,
        y: cy + Math.sin(angle) * ring,
        node: n,
      })
    })
    return pos
  }, [snapshot])

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4 pb-24">
        <header className="oa-float-card flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Network size={18} />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Personal Knowledge Graph</h1>
              <p className="text-xs text-[var(--muted)]">
                Entities & relationships extracted from your memories, conversations, and briefings.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className=" absolute left-3 top-3 text-[var(--muted)]" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  void loadGraph(e.target.value)
                }}
                placeholder="Filter entities..."
                className="oa-input-surface h-9 rounded-xl pl-8 pr-3 text-xs outline-none"
              />
            </div>
            <button
              onClick={() => rebuild(false)}
              disabled={busy === 'rebuild'}
              className="oa-accent-button flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'rebuild' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Rebuild Graph
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="oa-float-card flex flex-col p-4 lg:col-span-8">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {(Object.keys(TYPE_COLOR) as GraphEntityType[]).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5 capitalize text-[var(--muted)]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLOR[t] }} />
                    {t}
                  </span>
                ))}
              </div>
              <span className="text-[var(--muted)]">
                {snapshot?.nodes.length ?? 0} nodes · {snapshot?.edges.length ?? 0} edges
              </span>
            </div>

            {(snapshot?.nodes.length ?? 0) === 0 ? (
              <div className="flex h-[480px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
                No entities extracted yet. Click <b>Rebuild Graph</b> to scan your memories and chats.
              </div>
            ) : (
              <svg viewBox="0 0 800 520" className="h-[480px] w-full rounded-xl bg-slate-950/95">
                {(snapshot?.edges ?? []).map((e) => {
                  const a = layout.get(e.fromId)
                  const b = layout.get(e.toId)
                  if (!a || !b) return null
                  return (
                    <g key={e.id}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="rgba(148,163,184,0.35)"
                        strokeWidth={Math.min(4, Math.max(1, e.weight))}
                      />
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2 - 4}
                        textAnchor="middle"
                        fill="rgba(148,163,184,0.7)"
                        fontSize="9"
                      >
                        {e.relation}
                      </text>
                    </g>
                  )
                })}
                {Array.from(layout.values()).map(({ x, y, node }) => {
                  const isSel = selectedId === node.id
                  const radius = Math.min(24, 11 + Math.sqrt(node.mentionCount || 1) * 3)
                  return (
                    <g
                      key={node.id}
                      onClick={() => void openEntity(node.id)}
                      className="cursor-pointer transition-transform"
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={radius}
                        fill={TYPE_COLOR[node.type] ?? '#64748b'}
                        stroke={isSel ? '#ffffff' : 'rgba(255,255,255,0.25)'}
                        strokeWidth={isSel ? 3 : 1.5}
                      />
                      <text
                        x={x}
                        y={y + radius + 13}
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="11"
                        fontWeight={isSel ? 'bold' : 'normal'}
                      >
                        {node.name.slice(0, 22)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}
          </section>

          <aside className="oa-float-card p-5 lg:col-span-4">
            {!detail ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[var(--tone-strong)]">Entity Inspector</h2>
                <p className="text-xs text-[var(--muted)]">
                  Click any node in the graph (or select from the list below) to inspect its summary, relations, and source mentions.
                </p>
                <ul className="max-h-96 space-y-1.5 overflow-y-auto pt-2">
                  {(snapshot?.nodes ?? []).map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => void openEntity(n.id)}
                        className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2 text-left text-xs hover:bg-white"
                      >
                        <span className="font-medium text-[var(--tone-strong)]">{n.name}</span>
                        <span className="capitalize text-[var(--muted)]">
                          {n.type} · {n.mentionCount}×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                      style={{ backgroundColor: TYPE_COLOR[detail.entity.type] ?? '#475569' }}
                    >
                      {detail.entity.type}
                    </span>
                    <h2 className="mt-1 text-base font-bold text-[var(--tone-strong)]">{detail.entity.name}</h2>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedId(null)
                      setDetail(null)
                    }}
                    className="rounded-lg p-1 text-[var(--muted)] hover:bg-slate-100"
                  >
                    <X size={16} />
                  </button>
                </div>

                {detail.entity.summary && (
                  <p className="rounded-xl bg-white/70 p-3 text-xs text-[var(--tone-strong)]">{detail.entity.summary}</p>
                )}

                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Connections ({detail.relations.length})
                  </h3>
                  <ul className="space-y-1.5 text-xs">
                    {detail.relations.map((r) => (
                      <li
                        key={r.id}
                        onClick={() => r.other && void openEntity(r.other.id)}
                        className="cursor-pointer rounded-lg border border-[var(--border)] bg-white/70 px-2.5 py-1.5 hover:bg-white"
                      >
                        <span className="text-[var(--muted)]">{r.direction === 'out' ? '→' : '←'}</span>{' '}
                        <b>{r.relation}</b> · {r.other?.name ?? 'Unknown'}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Source Mentions ({detail.entity.mentions?.length ?? 0})
                  </h3>
                  <ul className="max-h-56 space-y-2 overflow-y-auto text-xs">
                    {(detail.entity.mentions ?? []).map((m, idx) => (
                      <li key={idx} className="rounded-xl border border-[var(--border)] bg-white/70 p-2.5">
                        <div className="text-[10px] uppercase text-[var(--muted)]">
                          {m.source} · {new Date(m.at).toLocaleDateString()}
                        </div>
                        <p className="mt-1 text-[var(--tone-strong)]">{m.snippet}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
