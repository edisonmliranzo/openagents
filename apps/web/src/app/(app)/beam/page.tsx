'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Bookmark,
  Check,
  Code2,
  Copy,
  Globe,
  Laptop,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  Smartphone,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'
import type { BeamDropItem } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const SOURCE_DEVICES: BeamDropItem['sourceDevice'][] = [
  'Desktop Studio',
  'iPhone Companion',
  'Browser Claw',
  'CLI Terminal',
]

const DROP_KINDS: Array<{
  value: BeamDropItem['kind']
  label: string
}> = [
  { value: 'code_snippet', label: 'Code Snippet' },
  { value: 'url_bookmark', label: 'URL Bookmark' },
  { value: 'prompt_brief', label: 'Prompt Brief' },
  { value: 'terminal_command', label: 'Terminal Command' },
]

const BEAM_PRESETS: Array<{
  title: string
  kind: BeamDropItem['kind']
  sourceDevice: BeamDropItem['sourceDevice']
  content: string
}> = [
  {
    title: 'Zero-Downtime Prisma Migration Command',
    kind: 'terminal_command',
    sourceDevice: 'CLI Terminal',
    content: 'pnpm --filter @openagents/api prisma migrate deploy && pnpm --filter @openagents/api build',
  },
  {
    title: 'Streaming SSE Retry Hook Snippet',
    kind: 'code_snippet',
    sourceDevice: 'Desktop Studio',
    content: `export async function withExponentialBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn() } catch (err) {
      if (attempt === maxRetries - 1) throw err
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt))
    }
  }
  throw new Error('Unreachable')
}`,
  },
  {
    title: 'Mobile Field Prompt — Security Audit',
    kind: 'prompt_brief',
    sourceDevice: 'iPhone Companion',
    content:
      'Audit all Fastify routes under apps/api/src/agentic-suite for missing JWT guard decorators and generate a verification table.',
  },
]

export default function CrossDeviceBeamPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [drops, setDrops] = useState<BeamDropItem[]>([])
  const [loading, setLoading] = useState(false)
  const [beaming, setBeaming] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deviceFilter, setDeviceFilter] = useState<string>('ALL')

  const [title, setTitle] = useState(BEAM_PRESETS[0].title)
  const [kind, setKind] = useState<BeamDropItem['kind']>(BEAM_PRESETS[0].kind)
  const [sourceDevice, setSourceDevice] = useState<BeamDropItem['sourceDevice']>(
    BEAM_PRESETS[0].sourceDevice,
  )
  const [content, setContent] = useState(BEAM_PRESETS[0].content)

  const loadDrops = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getBeamDrops()
      setDrops(res.drops ?? [])
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to fetch OpenAgents Beam drops')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadDrops()
  }, [loadDrops])

  async function handleCreateDrop(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      addToast('warning', 'Title and payload content are required to beam')
      return
    }
    setBeaming(true)
    try {
      const created = await sdk.agenticSuite.createBeamDrop({
        title: title.trim(),
        kind,
        sourceDevice,
        content: content.trim(),
      })
      setDrops((prev) => [created, ...prev])
      addToast('success', `Beamed "${created.title}" from ${created.sourceDevice}`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to beam payload')
    } finally {
      setBeaming(false)
    }
  }

  function handleCopy(drop: BeamDropItem) {
    navigator.clipboard.writeText(drop.content).catch(() => undefined)
    setCopiedId(drop.id)
    addToast('success', `Copied "${drop.title}" to clipboard`)
    setTimeout(() => {
      setCopiedId((prev) => (prev === drop.id ? null : prev))
    }, 1800)
  }

  function getDeviceIcon(device: BeamDropItem['sourceDevice']) {
    switch (device) {
      case 'Desktop Studio':
        return <Laptop className="h-3.5 w-3.5 text-indigo-400" />
      case 'iPhone Companion':
        return <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
      case 'Browser Claw':
        return <Globe className="h-3.5 w-3.5 text-emerald-400" />
      case 'CLI Terminal':
        return <Terminal className="h-3.5 w-3.5 text-amber-400" />
    }
  }

  function getKindBadge(k: BeamDropItem['kind']) {
    switch (k) {
      case 'code_snippet':
        return {
          label: 'Code Snippet',
          cls: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300',
          icon: <Code2 className="h-3 w-3" />,
        }
      case 'url_bookmark':
        return {
          label: 'URL Bookmark',
          cls: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300',
          icon: <Bookmark className="h-3 w-3" />,
        }
      case 'prompt_brief':
        return {
          label: 'Prompt Brief',
          cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
          icon: <Sparkles className="h-3 w-3" />,
        }
      case 'terminal_command':
        return {
          label: 'Terminal Command',
          cls: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
          icon: <Terminal className="h-3 w-3" />,
        }
    }
  }

  const filteredDrops =
    deviceFilter === 'ALL' ? drops : drops.filter((d) => d.sourceDevice === deviceFilter)

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1440px] space-y-6 pb-20">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-5 shadow-lg shadow-cyan-950/20 backdrop-blur">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <Radio className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  OpenAgents Neural Continuum
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  4 Mesh Nodes Online
                </span>
              </div>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white">
                Cross-Device Clipboard, Dropzone &amp; Instant Handoff Beam
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Instantly beam code snippets, URLs, prompts, and shell commands across Desktop Studio, iPhone Companion, Browser Claw, and CLI Terminal with autonomous staging.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadDrops()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Beam Mesh
          </button>
        </header>

        {/* Connected Device Mesh Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SOURCE_DEVICES.map((dev) => {
            const count = drops.filter((d) => d.sourceDevice === dev).length
            const active = deviceFilter === dev
            return (
              <button
                key={dev}
                type="button"
                onClick={() => setDeviceFilter(active ? 'ALL' : dev)}
                className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition ${
                  active
                    ? 'border-cyan-500 bg-cyan-950/30 shadow-md shadow-cyan-950/40'
                    : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800">
                    {getDeviceIcon(dev)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{dev}</div>
                    <div className="text-[11px] text-slate-400">{count} drop(s)</div>
                  </div>
                </div>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </button>
            )
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Neural Dropzone Form */}
          <div className="space-y-5 lg:col-span-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
                  <Zap className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white">Neural Dropzone Transmitter</h2>
                  <p className="text-[11px] text-slate-400">
                    OpenAgents automatically classifies and stages actions for each beamed payload
                  </p>
                </div>
              </div>

              <div className="mb-4 space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Sample Payloads
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {BEAM_PRESETS.map((p) => (
                    <button
                      key={p.title}
                      type="button"
                      onClick={() => {
                        setTitle(p.title)
                        setKind(p.kind)
                        setSourceDevice(p.sourceDevice)
                        setContent(p.content)
                      }}
                      className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleCreateDrop} className="space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Drop Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Production Hotfix Snippet"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Payload Kind
                    </label>
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as BeamDropItem['kind'])}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                    >
                      {DROP_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Source Device
                    </label>
                    <select
                      value={sourceDevice}
                      onChange={(e) =>
                        setSourceDevice(e.target.value as BeamDropItem['sourceDevice'])
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                    >
                      {SOURCE_DEVICES.map((dev) => (
                        <option key={dev} value={dev}>
                          {dev}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Clipboard / Dropzone Content
                  </label>
                  <textarea
                    rows={6}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste code snippet, URL, prompt brief, or CLI command to beam across OpenAgents devices..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 p-3 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={beaming}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-950/40 transition hover:brightness-110 disabled:opacity-50"
                >
                  {beaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Beam to OpenAgents Continuum
                </button>
              </form>
            </section>
          </div>

          {/* Right Column: Live Beamed Drops Stream */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                Instant Handoff Stream ({filteredDrops.length})
              </h2>
              {deviceFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setDeviceFilter('ALL')}
                  className="text-xs font-medium text-cyan-400 hover:underline"
                >
                  Clear filter ({deviceFilter})
                </button>
              )}
            </div>

            {filteredDrops.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
                No Beam drops match the selected device filter.
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredDrops.map((drop) => {
                  const badge = getKindBadge(drop.kind)
                  const isCopied = copiedId === drop.id
                  return (
                    <div
                      key={drop.id}
                      className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 transition hover:border-cyan-500/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                            >
                              {badge.icon}
                              {badge.label}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-200">
                              {getDeviceIcon(drop.sourceDevice)}
                              {drop.sourceDevice}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {new Date(drop.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-white">{drop.title}</h3>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopy(drop)}
                          className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                        >
                          {isCopied ? (
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

                      <pre className="mt-3 max-h-56 overflow-x-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/90 p-3 font-mono text-xs text-slate-200">
                        {drop.content}
                      </pre>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 text-emerald-300">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span>
                            <strong className="font-bold">Auto-Staged Action:</strong>{' '}
                            {drop.autoStagedAction}
                          </span>
                        </div>
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-200">
                          READY FOR HANDOFF
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
