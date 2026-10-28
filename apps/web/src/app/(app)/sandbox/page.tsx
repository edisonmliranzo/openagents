'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Layout,
  Loader2,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
  Zap,
} from 'lucide-react'
import type { LiveMicroApp } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const FRAMEWORK_OPTIONS: Array<{
  id: LiveMicroApp['framework']
  label: string
}> = [
  { id: 'html_tailwind', label: 'HTML + Tailwind + Vanilla JS' },
  { id: 'data_dashboard', label: 'Interactive Telemetry Dashboard' },
  { id: 'svg_interactive', label: 'Interactive SVG Vector App' },
]

export default function LiveCodeSandboxPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [apps, setApps] = useState<LiveMicroApp[]>([])
  const [selectedAppId, setSelectedAppId] = useState<string>('')
  const [editableCode, setEditableCode] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [copiedSlug, setCopiedSlug] = useState(false)

  // Generator form state
  const [title, setTitle] = useState('FinOps Token Cost & ROI Simulator')
  const [prompt, setPrompt] = useState(
    'Interactive dark-mode calculator with sliders for daily requests, model tier arbitrage, and monthly USD savings chart.',
  )
  const [framework, setFramework] = useState<LiveMicroApp['framework']>('html_tailwind')

  const selectedApp = apps.find((a) => a.id === selectedAppId) ?? apps[0] ?? null

  const loadApps = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getMicroApps()
      const list = res.apps ?? []
      setApps(list)
      if (list[0]) {
        setSelectedAppId(list[0].id)
        setEditableCode(list[0].sourceCode)
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Sandbox micro-apps')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadApps()
  }, [loadApps])

  useEffect(() => {
    if (selectedApp) {
      setEditableCode(selectedApp.sourceCode)
    }
  }, [selectedApp?.id])

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !prompt.trim()) {
      addToast('warning', 'Enter both a title and a prompt specification')
      return
    }
    setCreating(true)
    try {
      const created = await sdk.agenticSuite.createMicroApp({
        title: title.trim(),
        prompt: prompt.trim(),
        framework,
      })
      setApps((prev) => [created, ...prev])
      setSelectedAppId(created.id)
      setEditableCode(created.sourceCode)
      addToast('success', `Synthesized live micro-app "${created.title}"`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to synthesize micro-app')
    } finally {
      setCreating(false)
    }
  }

  const handlePublish = async (appId: string) => {
    setPublishingId(appId)
    try {
      const updated = await sdk.agenticSuite.publishMicroApp(appId)
      setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      const shareUrl = `https://openagents.us/sandbox/s/${updated.publishedSlug}`
      navigator.clipboard?.writeText(shareUrl).catch(() => undefined)
      setCopiedSlug(true)
      addToast('success', `Published Share URL copied: ${shareUrl}`)
      setTimeout(() => setCopiedSlug(false), 2500)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to publish micro-app')
    } finally {
      setPublishingId(null)
    }
  }

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6 pb-24">
        {/* Header */}
        <header className="oa-float-card flex flex-wrap items-center justify-between gap-4 border border-indigo-500/25 bg-gradient-to-r from-slate-950 via-indigo-950/85 to-slate-900 p-5 text-white">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-white shadow-lg shadow-indigo-500/25">
              <Layout size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                  OpenAgents Inline Live Code Sandbox &amp; Micro-App Renderer (Artifacts 2.0)
                </h1>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  Sandboxed DOM
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Synthesize interactive HTML/Tailwind/JS micro-apps from natural language, edit source code with instant hot-reload preview, and publish 1-click shareable URLs.
              </p>
            </div>
          </div>

          {selectedApp && (
            <div className="flex flex-wrap items-center gap-2">
              {selectedApp.publishedSlug && (
                <span className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 font-mono text-xs text-emerald-300">
                  https://openagents.us/sandbox/s/{selectedApp.publishedSlug}
                </span>
              )}
              <button
                type="button"
                disabled={publishingId === selectedApp.id}
                onClick={() => void handlePublish(selectedApp.id)}
                className="oa-accent-button inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50"
              >
                {publishingId === selectedApp.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : copiedSlug ? (
                  <Check size={14} />
                ) : (
                  <Share2 size={14} />
                )}
                {copiedSlug ? 'Share URL Copied!' : 'Publish Share URL'}
              </button>
            </div>
          )}
        </header>

        {/* Prompt Generator Bar */}
        <section className="oa-float-card p-5">
          <form onSubmit={handleCreateApp} className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                Micro-App Title
              </label>
              <input
                className="oa-input-surface h-10 w-full rounded-xl px-3 text-xs outline-none"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Micro-app title…"
              />
            </div>

            <div className="lg:col-span-4">
              <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                Interactive Specification Prompt
              </label>
              <input
                className="oa-input-surface h-10 w-full rounded-xl px-3 text-xs outline-none"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe UI controls, charts, and interactivity…"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                Runtime Framework
              </label>
              <select
                className="oa-input-surface h-10 w-full rounded-xl px-3 text-xs outline-none"
                value={framework}
                onChange={(e) => setFramework(e.target.value as LiveMicroApp['framework'])}
              >
                {FRAMEWORK_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end lg:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="oa-accent-button flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Synthesize App
              </button>
            </div>
          </form>

          {/* App Switcher Pills */}
          {apps.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200/60 dark:border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Artifacts ({apps.length}):
              </span>
              {apps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setSelectedAppId(app.id)}
                  className={`rounded-xl px-3 py-1 text-xs font-semibold transition ${
                    selectedApp?.id === app.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {app.title}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Split-Pane Live Code Editor + Sandboxed Iframe Renderer */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Pane: Editable Source Code */}
          <section className="oa-float-card flex flex-col overflow-hidden p-4 lg:col-span-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 size={16} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-[var(--tone-strong)]">
                  Live HTML / Tailwind / JS Source Editor
                </h2>
              </div>
              <button
                type="button"
                onClick={() => selectedApp && setEditableCode(selectedApp.sourceCode)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700"
              >
                <RotateCcw size={12} /> Reset Code
              </button>
            </div>

            <textarea
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
              spellCheck={false}
              className="h-[460px] w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-cyan-200 outline-none focus:border-cyan-500/60"
            />
          </section>

          {/* Right Pane: Real-time Sandboxed Iframe Preview */}
          <section className="oa-float-card flex flex-col overflow-hidden p-4 lg:col-span-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-emerald-400" />
                <h2 className="text-sm font-bold text-[var(--tone-strong)]">
                  Real-Time Sandboxed Micro-App Preview
                </h2>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                sandbox=&quot;allow-scripts&quot; · {selectedApp?.viewsCount ?? 1} views
              </span>
            </div>

            <div className="h-[460px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              {loading && !editableCode ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  <Loader2 size={16} className="mr-2 animate-spin" /> Rendering sandbox…
                </div>
              ) : (
                <iframe
                  title={selectedApp?.title ?? 'OpenAgents Live Sandbox Preview'}
                  srcDoc={editableCode}
                  sandbox="allow-scripts"
                  className="h-full w-full border-0 bg-slate-950"
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
