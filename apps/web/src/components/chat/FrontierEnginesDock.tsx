'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import clsx from 'clsx'
import {
  Activity,
  ArrowUpRight,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Code2,
  Command,
  Cpu,
  ExternalLink,
  Flame,
  GitBranch,
  Globe,
  HeartPulse,
  Layers,
  Loader2,
  Moon,
  Network,
  Play,
  Radar,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { sdk } from '@/stores/auth'
import type {
  DotsRouteResult,
  GrokDeepSearchResult,
  GrokPulseItem,
  GrokToneMode,
  HermesSteerConfig,
  HermesTraceRun,
  OpenClawHeartbeatRun,
  OpenClawSoulState,
} from '@openagents/sdk'

export type FrontierEngineModalTab =
  | null
  | 'grok'
  | 'openclaw'
  | 'hermes'
  | 'dots'
  | 'command_palette'

interface FrontierEnginesDockProps {
  onDispatchPrompt: (prompt: string) => Promise<void> | void
  onAppendAssistantOutput: (markdown: string) => void
  grokDeepSearchActive: boolean
  onToggleGrokDeepSearch: () => void
  bigBrainActive: boolean
  onToggleBigBrain: () => void
  hermesSteerActive: boolean
  onToggleHermesSteer: () => void
  dotsRouterActive: boolean
  onToggleDotsRouter: () => void
}

export const FRONTIER_AGENTIC_LINKS = [
  {
    title: 'Dynamic Tool Forge',
    subtitle: 'Self-synthesizing sandboxed TS/JS tools',
    href: '/agent/tool-forge',
    badge: 'VM Sandbox',
    color: 'from-rose-500 to-orange-500',
  },
  {
    title: 'Tree-of-Actions (MCTS)',
    subtitle: 'Parallel speculative rollout planner',
    href: '/agent/tree-of-actions',
    badge: '3-Beam MCTS',
    color: 'from-violet-500 to-indigo-600',
  },
  {
    title: 'Vision Computer Agent',
    subtitle: 'Closed-loop Observe → Plan → Act GUI',
    href: '/computer-use',
    badge: 'DOM + Vision',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    title: 'Ambient Sentinel',
    subtitle: 'Sub-second event reflexes & auto-heal',
    href: '/sentinel',
    badge: '24/7 Watch',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    title: 'Red-Team Verifier Loop',
    subtitle: 'Builder vs. Breaker adversarial hardening',
    href: '/swarm/verifier',
    badge: 'GAN Audit',
    color: 'from-amber-500 to-red-500',
  },
  {
    title: 'Overnight Mission Runner',
    subtitle: 'Long-horizon checkpointed autonomy',
    href: '/overnight',
    badge: 'Long-Horizon',
    color: 'from-indigo-500 to-purple-600',
  },
  {
    title: 'Shadow Digital Twin',
    subtitle: 'Episodic world-model & counterfactuals',
    href: '/digital-twin',
    badge: 'World Model',
    color: 'from-teal-500 to-emerald-600',
  },
  {
    title: 'Swarm Market Bidding',
    subtitle: 'Contract-Net ELO reputation auction',
    href: '/swarm/market',
    badge: 'ELO Auction',
    color: 'from-fuchsia-500 to-rose-500',
  },
  {
    title: 'Speculative Pre-Fetch & Ghost Typing',
    subtitle: 'Pre-warms tools & Tab ghost completions while typing',
    href: '/agent/speculative',
    badge: 'Sub-150ms TTFT',
    color: 'from-sky-500 to-cyan-500',
  },
  {
    title: 'Full-Duplex Voice & Screen Co-Pilot',
    subtitle: 'Real-time WebRTC screen share + spoken pair-coder',
    href: '/copilot',
    badge: 'Live Vision',
    color: 'from-emerald-500 to-cyan-600',
  },
  {
    title: 'Prompt & Agent Evolution Arena',
    subtitle: 'Genetic DSPy prompt crossover & Pareto tournament',
    href: '/agent/evolution',
    badge: 'Genetic DNA',
    color: 'from-purple-500 to-pink-600',
  },
  {
    title: 'Web Workflow Recorder (RPA)',
    subtitle: 'Show once, run forever with vision self-healing',
    href: '/workflows/recorder',
    badge: 'Self-Healing RPA',
    color: 'from-amber-500 to-orange-600',
  },
  {
    title: 'Inline Live Code Sandbox 2.0',
    subtitle: 'Interactive HTML/Tailwind/SVG micro-apps & 1-click publish',
    href: '/sandbox',
    badge: 'Artifacts 2.0',
    color: 'from-indigo-500 to-blue-600',
  },
  {
    title: 'Personal Knowledge Time-Machine',
    subtitle: 'Temporal event ledger & contradiction detector',
    href: '/time-machine',
    badge: 'Temporal Graph',
    color: 'from-violet-500 to-fuchsia-600',
  },
  {
    title: 'Secret-Zero Outbound Firewall',
    subtitle: 'Zero-trust API key, JWT, DB URI & PII interceptor',
    href: '/security/firewall',
    badge: 'Zero-Trust DLP',
    color: 'from-red-500 to-rose-600',
  },
  {
    title: 'Autonomous FinOps & API Arbitrage',
    subtitle: 'Spot latency/cost router & semantic cache savings',
    href: '/finops',
    badge: '64% Cost Cut',
    color: 'from-emerald-500 to-green-600',
  },
  {
    title: 'Multiplayer Live War Room',
    subtitle: 'Shared operational canvas with @Forge, @Scout, @Sentinel, @Atlas',
    href: '/war-room',
    badge: 'Multiplayer',
    color: 'from-rose-500 to-amber-500',
  },
  {
    title: '1-Click Prompt-to-Production Ship',
    subtitle: 'Automated preflight, AST check, deploy & atomic rollback',
    href: '/ship',
    badge: '1-Click Ship',
    color: 'from-cyan-500 to-indigo-600',
  },
] as const

export function FrontierEnginesDock({
  onDispatchPrompt,
  onAppendAssistantOutput,
  grokDeepSearchActive,
  onToggleGrokDeepSearch,
  bigBrainActive,
  onToggleBigBrain,
  hermesSteerActive,
  onToggleHermesSteer,
  dotsRouterActive,
  onToggleDotsRouter,
}: FrontierEnginesDockProps) {
  const router = useRouter()
  const [modal, setModal] = useState<FrontierEngineModalTab>(null)

  // Grok State
  const [grokQuery, setGrokQuery] = useState('')
  const [grokTone, setGrokTone] = useState<GrokToneMode>('truth_seeking')
  const [grokBusy, setGrokBusy] = useState(false)
  const [grokPulse, setGrokPulse] = useState<GrokPulseItem[]>([])
  const [grokHistory, setGrokHistory] = useState<GrokDeepSearchResult[]>([])
  const [activeGrokResult, setActiveGrokResult] = useState<GrokDeepSearchResult | null>(null)

  // OpenClaw State
  const [openClaw, setOpenClaw] = useState<OpenClawSoulState | null>(null)
  const [activeSoulFile, setActiveSoulFile] = useState<'soulMd' | 'userMd' | 'heartbeatMd' | 'memoryMd'>('soulMd')
  const [openClawSaving, setOpenClawSaving] = useState(false)
  const [openClawPulsing, setOpenClawPulsing] = useState(false)
  const [openClawSavedBanner, setOpenClawSavedBanner] = useState('')

  // Hermes State
  const [hermesConfig, setHermesConfig] = useState<HermesSteerConfig | null>(null)
  const [hermesTraces, setHermesTraces] = useState<HermesTraceRun[]>([])
  const [hermesPrompt, setHermesPrompt] = useState('')
  const [hermesBusy, setHermesBusy] = useState(false)
  const [hermesSaving, setHermesSaving] = useState(false)

  // Dots State
  const [dotsPrompt, setDotsPrompt] = useState('')
  const [dotsBusy, setDotsBusy] = useState(false)
  const [dotsHistory, setDotsHistory] = useState<DotsRouteResult[]>([])
  const [activeDotsResult, setActiveDotsResult] = useState<DotsRouteResult | null>(null)

  // Command Palette Search
  const [cmdSearch, setCmdSearch] = useState('')

  const loadGrok = useCallback(async () => {
    try {
      const res = await sdk.agenticSuite.getGrokState()
      setGrokPulse(res.pulse ?? [])
      setGrokHistory(res.history ?? [])
      if (res.history?.[0] && !activeGrokResult) {
        setActiveGrokResult(res.history[0])
      }
    } catch {
      // ignore
    }
  }, [activeGrokResult])

  const loadOpenClaw = useCallback(async () => {
    try {
      const res = await sdk.agenticSuite.getOpenClawState()
      setOpenClaw(res)
    } catch {
      // ignore
    }
  }, [])

  const loadHermes = useCallback(async () => {
    try {
      const res = await sdk.agenticSuite.getHermesState()
      setHermesConfig(res.config)
      setHermesTraces(res.traces ?? [])
    } catch {
      // ignore
    }
  }, [])

  const loadDots = useCallback(async () => {
    try {
      const res = await sdk.agenticSuite.getDotsState()
      setDotsHistory(res.history ?? [])
      if (res.history?.[0] && !activeDotsResult) {
        setActiveDotsResult(res.history[0])
      }
    } catch {
      // ignore
    }
  }, [activeDotsResult])

  useEffect(() => {
    if (modal === 'grok') void loadGrok()
    if (modal === 'openclaw') void loadOpenClaw()
    if (modal === 'hermes') void loadHermes()
    if (modal === 'dots') void loadDots()
  }, [modal, loadGrok, loadOpenClaw, loadHermes, loadDots])

  // Global keyboard shortcut: Ctrl+K or Cmd+K for Frontier Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setModal((prev) => (prev === 'command_palette' ? null : 'command_palette'))
      } else if (e.key === 'Escape' && modal) {
        setModal(null)
      }
    }
    const onOpenFrontierModal = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: FrontierEngineModalTab; query?: string }>).detail
      if (detail?.tab) {
        setModal(detail.tab)
        if (detail.tab === 'grok' && detail.query) setGrokQuery(detail.query)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('openagents:open-frontier-engine', onOpenFrontierModal)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('openagents:open-frontier-engine', onOpenFrontierModal)
    }
  }, [modal])

  async function handleRunGrokDeepSearch(qOverride?: string) {
    const query = (qOverride ?? grokQuery).trim()
    if (!query || grokBusy) return
    setGrokBusy(true)
    try {
      const res = await sdk.agenticSuite.runGrokDeepSearch({
        query,
        toneMode: grokTone,
        bigBrainEnabled: bigBrainActive,
      })
      setActiveGrokResult(res)
      setGrokHistory((prev) => [res, ...prev.filter((r) => r.id !== res.id)])
    } finally {
      setGrokBusy(false)
    }
  }

  async function handleSaveOpenClaw() {
    if (!openClaw || openClawSaving) return
    setOpenClawSaving(true)
    setOpenClawSavedBanner('')
    try {
      const updated = await sdk.agenticSuite.updateOpenClawSoul({
        soulMd: openClaw.soulMd,
        userMd: openClaw.userMd,
        heartbeatMd: openClaw.heartbeatMd,
        memoryMd: openClaw.memoryMd,
        heartbeatIntervalSec: openClaw.heartbeatIntervalSec,
        heartbeatEnabled: openClaw.heartbeatEnabled,
      })
      setOpenClaw(updated)
      setOpenClawSavedBanner('SOUL.md & Autonomous Heartbeat Core synced.')
      window.setTimeout(() => setOpenClawSavedBanner(''), 3500)
    } finally {
      setOpenClawSaving(false)
    }
  }

  async function handlePulseHeartbeat() {
    if (openClawPulsing) return
    setOpenClawPulsing(true)
    try {
      const res = await sdk.agenticSuite.runOpenClawHeartbeat('manual')
      setOpenClaw(res.state)
    } finally {
      setOpenClawPulsing(false)
    }
  }

  async function handleSaveHermesConfig() {
    if (!hermesConfig || hermesSaving) return
    setHermesSaving(true)
    try {
      const updated = await sdk.agenticSuite.updateHermesSteer(hermesConfig)
      setHermesConfig(updated)
    } finally {
      setHermesSaving(false)
    }
  }

  async function handleInvokeHermes() {
    const prompt = hermesPrompt.trim() || 'Audit repository architecture and emit a verified tool execution plan'
    if (hermesBusy) return
    setHermesBusy(true)
    try {
      const trace = await sdk.agenticSuite.invokeHermesTrace({ prompt })
      setHermesTraces((prev) => [trace, ...prev])
      setHermesPrompt('')
    } finally {
      setHermesBusy(false)
    }
  }

  async function handleRouteDots() {
    const prompt = dotsPrompt.trim() || 'Synthesize an end-to-end architecture and security verification plan'
    if (dotsBusy) return
    setDotsBusy(true)
    try {
      const res = await sdk.agenticSuite.routeWithDots({ prompt })
      setActiveDotsResult(res)
      setDotsHistory((prev) => [res, ...prev])
    } finally {
      setDotsBusy(false)
    }
  }

  const commandPaletteItems = useMemo(() => {
    const base = [
      {
        id: 'engine-grok',
        category: 'Frontier AI Engines',
        title: 'Grok 3 DeepSearch + Big Brain + Live Pulse Radar',
        subtitle: 'Multi-hop web/repo/arXiv synthesis with contrarian reality checks & citations',
        badge: 'Grok Engine',
        action: () => setModal('grok'),
      },
      {
        id: 'engine-openclaw',
        category: 'Frontier AI Engines',
        title: 'OpenClaw Autonomous Core (SOUL.md + Heartbeat Daemon)',
        subtitle: 'Live SOUL.md / USER.md / HEARTBEAT.md editor & autonomous background loop',
        badge: 'OpenClaw',
        action: () => setModal('openclaw'),
      },
      {
        id: 'engine-hermes',
        category: 'Frontier AI Engines',
        title: 'Hermes-3 Cognitive Steer & Native <tool_call> XML Forge',
        subtitle: 'Directness, reasoning depth, uncensored technical mode & XML trace inspector',
        badge: 'Hermes-3',
        action: () => setModal('hermes'),
      },
      {
        id: 'engine-dots',
        category: 'Frontier AI Engines',
        title: 'Dots Mixture-of-Reasoners & Dynamic Compute Router',
        subtitle: 'Real-time expert compute allocation & connected context dot-matrix',
        badge: 'Dots MoE',
        action: () => setModal('dots'),
      },
      ...FRONTIER_AGENTIC_LINKS.map((item) => ({
        id: `route-${item.href}`,
        category: '8 Autonomous Agentic Systems',
        title: item.title,
        subtitle: item.subtitle,
        badge: item.badge,
        action: () => {
          setModal(null)
          router.push(item.href)
        },
      })),
      {
        id: 'route-frontier-hub',
        category: 'OS Navigation',
        title: 'Frontier Command Center (/frontier)',
        subtitle: 'Unified dashboard for all 12 frontier engines, sleep digest, debate & watches',
        badge: 'Hub',
        action: () => {
          setModal(null)
          router.push('/frontier')
        },
      },
    ]
    const q = cmdSearch.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.subtitle.toLowerCase().includes(q) ||
        i.badge.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    )
  }, [cmdSearch, router])

  return (
    <>
      {/* Compact Frontier AI Engines Bar right under Power Toolbar in /chat */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto border-b border-slate-200/50 bg-gradient-to-r from-slate-900/[0.03] via-rose-500/[0.04] to-indigo-500/[0.04] px-3 py-1.5 text-[11px] dark:border-[#2d3347]/80 dark:from-white/[0.02] dark:via-rose-500/[0.06] dark:to-indigo-500/[0.06] sm:px-5">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white dark:bg-white dark:text-slate-900">
            <Sparkles size={9} /> Frontier DNA
          </span>

          {/* Grok DeepSearch Pill */}
          <button
            type="button"
            onClick={() => setModal('grok')}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition',
              grokDeepSearchActive
                ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                : 'border-slate-200/80 bg-white/80 text-slate-700 hover:border-sky-400 dark:border-[#2d3347] dark:bg-[#151a28] dark:text-slate-200',
            )}
            title="Grok 3 DeepSearch + Live Pulse Radar"
          >
            <Radar size={12} className="text-sky-500" />
            <span>Grok DeepSearch</span>
            {grokDeepSearchActive && <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-ping" />}
          </button>

          {/* Big Brain Think Toggle */}
          <button
            type="button"
            onClick={onToggleBigBrain}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition',
              bigBrainActive
                ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                : 'border-slate-200/80 bg-white/80 text-slate-700 hover:border-amber-400 dark:border-[#2d3347] dark:bg-[#151a28] dark:text-slate-200',
            )}
            title="Toggle Grok Big Brain Extended Chain-of-Thought Reasoning"
          >
            <Brain size={12} className="text-amber-500" />
            <span>Big Brain {bigBrainActive ? 'ON' : 'OFF'}</span>
          </button>

          {/* OpenClaw Soul & Heartbeat */}
          <button
            type="button"
            onClick={() => setModal('openclaw')}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 font-semibold text-slate-700 transition hover:border-rose-400 dark:border-[#2d3347] dark:bg-[#151a28] dark:text-slate-200"
            title="OpenClaw Autonomous Core: SOUL.md, USER.md, HEARTBEAT.md & Multi-Channel Claw"
          >
            <HeartPulse size={12} className="text-rose-500" />
            <span>OpenClaw Soul & Heartbeat</span>
          </button>

          {/* Hermes-3 Cognitive Steer */}
          <button
            type="button"
            onClick={() => setModal('hermes')}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition',
              hermesSteerActive
                ? 'border-violet-500 bg-violet-500/15 text-violet-800 dark:text-violet-300'
                : 'border-slate-200/80 bg-white/80 text-slate-700 hover:border-violet-400 dark:border-[#2d3347] dark:bg-[#151a28] dark:text-slate-200',
            )}
            title="Hermes-3 Cognitive Steering & Native <think>/<tool_call> XML Inspector"
          >
            <Sliders size={12} className="text-violet-500" />
            <span>Hermes Steer</span>
          </button>

          {/* Dots Mixture-of-Reasoners Router */}
          <button
            type="button"
            onClick={() => setModal('dots')}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition',
              dotsRouterActive
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                : 'border-slate-200/80 bg-white/80 text-slate-700 hover:border-emerald-400 dark:border-[#2d3347] dark:bg-[#151a28] dark:text-slate-200',
            )}
            title="Dots Mixture-of-Reasoners & Dynamic Compute Router"
          >
            <Network size={12} className="text-emerald-500" />
            <span>Dots MoE Router</span>
          </button>
        </div>

        {/* Right: ⌘K Command Palette Launcher */}
        <button
          type="button"
          onClick={() => setModal('command_palette')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300/80 bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white shadow-xs transition hover:bg-slate-800 dark:border-slate-700 dark:bg-white dark:text-slate-900"
          title="Open Frontier Command Palette (Ctrl+K / ⌘K)"
        >
          <Command size={11} />
          <span>All 12 Engines</span>
          <kbd className="rounded bg-white/20 px-1 py-0.2 font-mono text-[9px] dark:bg-slate-900/15">⌘K</kbd>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 1: GROK 3 DEEPSEARCH + BIG BRAIN + LIVE PULSE RADAR
         ───────────────────────────────────────────────────────────────────── */}
      {modal === 'grok' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-[#2d3347] dark:bg-[#111522]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-transparent px-5 py-4 dark:border-[#2d3347]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md">
                  <Radar size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Grok DeepSearch &amp; Big Brain Engine
                    </h2>
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-300">
                      Multi-Hop Truth-Seeking
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Decomposes complex queries across live repo, web, and arXiv signals with visible Chain-of-Thought &amp; contrarian verification.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
              {/* Tone + Big Brain Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-[#2d3347] dark:bg-[#161b2c]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Grok Tone:
                  </span>
                  {(
                    [
                      { id: 'truth_seeking', label: '🎯 Truth-Seeking' },
                      { id: 'unfiltered_witty', label: '🔥 Unfiltered & Witty' },
                      { id: 'first_principles', label: '⚛️ First-Principles' },
                      { id: 'executive_brief', label: '⚡ Executive Brief' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setGrokTone(mode.id)}
                      className={clsx(
                        'rounded-xl px-2.5 py-1 text-xs font-semibold transition',
                        grokTone === mode.id
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-[#1f263d] dark:text-slate-300',
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleGrokDeepSearch}
                    className={clsx(
                      'rounded-xl border px-3 py-1 text-xs font-bold transition',
                      grokDeepSearchActive
                        ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-[#2d3347] dark:bg-[#1f263d] dark:text-slate-300',
                    )}
                  >
                    Composer DeepSearch: {grokDeepSearchActive ? 'ENABLED' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleBigBrain}
                    className={clsx(
                      'rounded-xl border px-3 py-1 text-xs font-bold transition',
                      bigBrainActive
                        ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-[#2d3347] dark:bg-[#1f263d] dark:text-slate-300',
                    )}
                  >
                    🧠 Big Brain: {bigBrainActive ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Search Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={grokQuery}
                  onChange={(e) => setGrokQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleRunGrokDeepSearch()}
                  placeholder="Ask Grok DeepSearch anything (e.g., 'Compare MCTS rollouts vs zero-shot tool calling in production')..."
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#2d3347] dark:bg-[#161b2c] dark:text-white"
                />
                <button
                  type="button"
                  disabled={grokBusy || !grokQuery.trim()}
                  onClick={() => void handleRunGrokDeepSearch()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
                >
                  {grokBusy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  <span>DeepSearch</span>
                </button>
              </div>

              {/* Active DeepSearch Result */}
              {activeGrokResult && (
                <div className="space-y-4 rounded-2xl border border-sky-500/30 bg-sky-500/[0.03] p-4 dark:bg-sky-500/[0.05]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-sky-500 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                        Confidence {activeGrokResult.confidenceScore}%
                      </span>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {activeGrokResult.durationMs}ms • {activeGrokResult.citations.length} verified sources
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onAppendAssistantOutput(
                          `## 🔍 Grok DeepSearch: ${activeGrokResult.query}\n\n${activeGrokResult.synthesisMarkdown}\n\n> **Contrarian Take:** ${activeGrokResult.contrarianTake}`,
                        )
                        setModal(null)
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                    >
                      <Send size={12} /> Insert into Chat
                    </button>
                  </div>

                  {/* Reasoning Trace */}
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      <Brain size={13} /> Big Brain Chain-of-Thought Trace
                    </p>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                      {activeGrokResult.thinkingTrace.map((step, idx) => (
                        <li key={idx} className="font-mono text-[11px]">
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Synthesis Markdown */}
                  <div className="prose prose-sm max-w-none text-slate-800 dark:prose-invert dark:text-slate-100">
                    <ReactMarkdown>{activeGrokResult.synthesisMarkdown}</ReactMarkdown>
                  </div>

                  {/* Contrarian Take */}
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-200">
                    <span className="font-bold uppercase tracking-wider">⚡ Grok Contrarian Reality Check: </span>
                    {activeGrokResult.contrarianTake}
                  </div>

                  {/* Citations */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {activeGrokResult.citations.map((cit) => (
                      <div
                        key={cit.id}
                        className="rounded-xl border border-slate-200/80 bg-white p-2.5 text-xs dark:border-[#2d3347] dark:bg-[#161b2c]"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {cit.sourceType}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-600">
                            {cit.credibilityScore}% trust
                          </span>
                        </div>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-white line-clamp-1">{cit.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                          {cit.snippet}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Pulse Radar */}
              <div>
                <h3 className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Flame size={14} className="text-orange-500" /> Live Frontier Pulse Radar
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {grokPulse.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-[#2d3347] dark:bg-[#161b2c]"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-md bg-sky-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-sky-600 dark:text-sky-300">
                            {item.category.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.momentum}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs font-bold text-slate-900 dark:text-white">{item.headline}</p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{item.summary}</p>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setGrokQuery(item.suggestedPrompt)
                            void handleRunGrokDeepSearch(item.suggestedPrompt)
                          }}
                          className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
                        >
                          DeepSearch This
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setModal(null)
                            void onDispatchPrompt(item.suggestedPrompt)
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-transparent dark:text-slate-300"
                        >
                          Dispatch to Chat →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 2: OPENCLAW AUTONOMOUS CORE (SOUL.MD + HEARTBEAT + CHANNELS)
         ───────────────────────────────────────────────────────────────────── */}
      {modal === 'openclaw' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-[#2d3347] dark:bg-[#111522]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-gradient-to-r from-rose-500/10 via-orange-500/5 to-transparent px-5 py-4 dark:border-[#2d3347]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-md">
                  <HeartPulse size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      OpenClaw Autonomous Core &amp; Heartbeat Daemon
                    </h2>
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-300">
                      Persistent Soul + Wakeup Loop
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Live markdown identity files (<code className="font-mono">SOUL.md</code>,{' '}
                    <code className="font-mono">USER.md</code>, <code className="font-mono">HEARTBEAT.md</code>,{' '}
                    <code className="font-mono">MEMORY.md</code>) + autonomous workspace pulse.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {openClaw ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
                {/* Heartbeat Control Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-[#2d3347] dark:bg-[#161b2c]">
                  <div className="flex items-center gap-3">
                    <span
                      className={clsx(
                        'h-3 w-3 rounded-full',
                        openClaw.heartbeatEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400',
                      )}
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Autonomous Heartbeat Loop: {openClaw.heartbeatEnabled ? 'ACTIVE' : 'PAUSED'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Wakes up every {openClaw.heartbeatIntervalSec}s to evaluate HEARTBEAT.md against git, goals &amp; sentinel state.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={openClaw.heartbeatIntervalSec}
                      onChange={(e) =>
                        setOpenClaw({ ...openClaw, heartbeatIntervalSec: Number(e.target.value) })
                      }
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold dark:border-[#2d3347] dark:bg-[#1f263d] dark:text-white"
                    >
                      <option value={30}>Every 30s</option>
                      <option value={60}>Every 1m</option>
                      <option value={300}>Every 5m</option>
                      <option value={900}>Every 15m</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenClaw({ ...openClaw, heartbeatEnabled: !openClaw.heartbeatEnabled })
                      }
                      className={clsx(
                        'rounded-xl px-3 py-1.5 text-xs font-bold transition',
                        openClaw.heartbeatEnabled
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                      )}
                    >
                      {openClaw.heartbeatEnabled ? 'Loop ON' : 'Loop OFF'}
                    </button>
                    <button
                      type="button"
                      disabled={openClawPulsing}
                      onClick={() => void handlePulseHeartbeat()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                    >
                      {openClawPulsing ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                      <span>Pulse Heartbeat Now</span>
                    </button>
                  </div>
                </div>

                {/* Markdown Core File Tabs */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: 'soulMd', label: '🦞 SOUL.md' },
                          { id: 'userMd', label: '👤 USER.md' },
                          { id: 'heartbeatMd', label: '💓 HEARTBEAT.md' },
                          { id: 'memoryMd', label: '🧠 MEMORY.md' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveSoulFile(tab.id)}
                          className={clsx(
                            'rounded-xl px-3 py-1.5 font-mono text-xs font-bold transition',
                            activeSoulFile === tab.id
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#161b2c] dark:text-slate-300',
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={openClawSaving}
                      onClick={() => void handleSaveOpenClaw()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {openClawSaving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      <span>Save Core Files</span>
                    </button>
                  </div>

                  {openClawSavedBanner && (
                    <p className="mb-2 rounded-xl bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      ✓ {openClawSavedBanner}
                    </p>
                  )}

                  <textarea
                    rows={8}
                    value={openClaw[activeSoulFile]}
                    onChange={(e) => setOpenClaw({ ...openClaw, [activeSoulFile]: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-300 outline-none focus:border-rose-500 dark:border-[#2d3347]"
                  />
                </div>

                {/* Recent Heartbeat Runs */}
                {openClaw.recentHeartbeats.length > 0 && (
                  <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-4 space-y-2">
                    <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">
                      Latest Autonomous Heartbeat Telemetry
                    </p>
                    {openClaw.recentHeartbeats.slice(0, 2).map((hb: OpenClawHeartbeatRun) => (
                      <div
                        key={hb.id}
                        className="rounded-xl border border-slate-200/80 bg-white p-3 text-xs dark:border-[#2d3347] dark:bg-[#161b2c]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            Branch: <code className="font-mono text-rose-500">{hb.gitBranch}</code> •{' '}
                            {hb.dirtyFilesCount} dirty files • {hb.activeGoalsCount} active goals
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {new Date(hb.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 font-medium text-emerald-700 dark:text-emerald-300">
                          {hb.proactiveDecision}
                        </p>
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {hb.executedReflexes.map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {/* Multi-Channel Claw Gateway Matrix */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Multi-Channel Claw Gateway Bridges
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {openClaw.channels.map((ch) => (
                      <div
                        key={ch.id}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-[#2d3347] dark:bg-[#161b2c]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white">{ch.label}</span>
                          <span
                            className={clsx(
                              'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase',
                              ch.status === 'connected'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
                            )}
                          >
                            {ch.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{ch.lastEvent}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center p-12">
                <Loader2 size={24} className="animate-spin text-rose-500" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 3: HERMES-3 COGNITIVE STEER & NATIVE <TOOL_CALL> XML TRACE
         ───────────────────────────────────────────────────────────────────── */}
      {modal === 'hermes' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-[#2d3347] dark:bg-[#111522]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-transparent px-5 py-4 dark:border-[#2d3347]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md">
                  <Sliders size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Hermes-3 Cognitive Steering &amp; XML Tool-Call Forge
                    </h2>
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-300">
                      Nous Hermes Architecture
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Steer reasoning depth, tool aggressiveness, uncensored technical directness, and inspect raw{' '}
                    <code className="font-mono">&lt;think&gt;</code> &amp;{' '}
                    <code className="font-mono">&lt;tool_call&gt;</code> traces.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {hermesConfig ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
                {/* Sliders Grid */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { key: 'reasoningDepth', label: 'Reasoning Depth (<think> budget)' },
                      { key: 'toolAggressiveness', label: 'Tool-Call Aggressiveness' },
                      { key: 'directness', label: 'Signal Density & Directness' },
                      { key: 'creativity', label: 'Exploration / Temperature' },
                    ] as const
                  ).map((slider) => (
                    <div
                      key={slider.key}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-[#2d3347] dark:bg-[#161b2c]"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-100">
                        <span>{slider.label}</span>
                        <span className="font-mono text-violet-600 dark:text-violet-400">
                          {hermesConfig[slider.key]}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={hermesConfig[slider.key]}
                        onChange={(e) =>
                          setHermesConfig({ ...hermesConfig, [slider.key]: Number(e.target.value) })
                        }
                        className="mt-2 w-full accent-violet-600"
                      />
                    </div>
                  ))}
                </div>

                {/* Toggles + Save */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-[#2d3347] dark:bg-[#161b2c]">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setHermesConfig({
                          ...hermesConfig,
                          uncensoredTechnicalMode: !hermesConfig.uncensoredTechnicalMode,
                        })
                      }
                      className={clsx(
                        'rounded-xl px-3 py-1.5 text-xs font-bold transition',
                        hermesConfig.uncensoredTechnicalMode
                          ? 'bg-violet-600 text-white'
                          : 'bg-white text-slate-600 dark:bg-[#1f263d] dark:text-slate-300',
                      )}
                    >
                      Uncensored Technical Mode: {hermesConfig.uncensoredTechnicalMode ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setHermesConfig({
                          ...hermesConfig,
                          structuredJsonMode: !hermesConfig.structuredJsonMode,
                        })
                      }
                      className={clsx(
                        'rounded-xl px-3 py-1.5 text-xs font-bold transition',
                        hermesConfig.structuredJsonMode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 dark:bg-[#1f263d] dark:text-slate-300',
                      )}
                    >
                      Strict JSON Schema: {hermesConfig.structuredJsonMode ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={onToggleHermesSteer}
                      className={clsx(
                        'rounded-xl border px-3 py-1.5 text-xs font-bold transition',
                        hermesSteerActive
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 bg-white text-slate-600 dark:border-[#2d3347] dark:bg-[#1f263d] dark:text-slate-300',
                      )}
                    >
                      Inject into /chat Composer: {hermesSteerActive ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={hermesSaving}
                    onClick={() => void handleSaveHermesConfig()}
                    className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                  >
                    {hermesSaving ? 'Saving...' : 'Save Steer Vector'}
                  </button>
                </div>

                {/* Native XML Trace Runner */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={hermesPrompt}
                    onChange={(e) => setHermesPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleInvokeHermes()}
                    placeholder="Test Hermes-3 <think> + <tool_call> trace on a technical prompt..."
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-[#2d3347] dark:bg-[#161b2c] dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={hermesBusy}
                    onClick={() => void handleInvokeHermes()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50"
                  >
                    {hermesBusy ? <Loader2 size={15} className="animate-spin" /> : <Code2 size={15} />}
                    <span>Run XML Trace</span>
                  </button>
                </div>

                {hermesTraces[0] && (
                  <div className="space-y-3 rounded-2xl border border-violet-500/30 bg-slate-950 p-4 text-xs text-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-violet-400">
                        Hermes-3 Native Execution Trace ({hermesTraces[0].tokensPerSec} tok/s •{' '}
                        {hermesTraces[0].contextUtilizationPct}% ctx)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onAppendAssistantOutput(
                            `\`\`\`xml\n${hermesTraces[0].rawThinkXml}\n${hermesTraces[0].rawToolCallXml}\n\`\`\`\n\n${hermesTraces[0].finalResponse}`,
                          )
                          setModal(null)
                        }}
                        className="rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-violet-500"
                      >
                        Send Trace to Chat
                      </button>
                    </div>
                    <pre className="overflow-x-auto rounded-xl bg-black/50 p-3 font-mono text-[11px] text-amber-300">
                      {hermesTraces[0].rawThinkXml}
                    </pre>
                    <pre className="overflow-x-auto rounded-xl bg-black/50 p-3 font-mono text-[11px] text-emerald-300">
                      {hermesTraces[0].rawToolCallXml}
                    </pre>
                    <p className="text-xs text-slate-300">{hermesTraces[0].finalResponse}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center p-12">
                <Loader2 size={24} className="animate-spin text-violet-500" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 4: DOTS MIXTURE-OF-REASONERS & DYNAMIC COMPUTE ROUTER
         ───────────────────────────────────────────────────────────────────── */}
      {modal === 'dots' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-[#2d3347] dark:bg-[#111522]">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent px-5 py-4 dark:border-[#2d3347]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
                  <Network size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Dots Mixture-of-Reasoners &amp; Context Graph Router
                    </h2>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
                      Dynamic Compute Allocation
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Routes prompts across specialized reasoning paths while linking relevant memory, repo, goal &amp; tool dots.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-[#2d3347] dark:bg-[#161b2c]">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Automatically route every <code className="font-mono">/chat</code> prompt through Dots MoE Compute Router
                </span>
                <button
                  type="button"
                  onClick={onToggleDotsRouter}
                  className={clsx(
                    'rounded-xl px-3.5 py-1.5 text-xs font-bold transition',
                    dotsRouterActive
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  Dots Auto-Router: {dotsRouterActive ? 'ENABLED' : 'OFF'}
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={dotsPrompt}
                  onChange={(e) => setDotsPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleRouteDots()}
                  placeholder="Enter a task to simulate Dots Mixture-of-Reasoners compute allocation..."
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-[#2d3347] dark:bg-[#161b2c] dark:text-white"
                />
                <button
                  type="button"
                  disabled={dotsBusy}
                  onClick={() => void handleRouteDots()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50"
                >
                  {dotsBusy ? <Loader2 size={15} className="animate-spin" /> : <Cpu size={15} />}
                  <span>Route Compute</span>
                </button>
              </div>

              {activeDotsResult && (
                <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        Primary Path: {activeDotsResult.selectedPrimaryPath}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Estimated Latency: {activeDotsResult.estimatedLatencyMs}ms • Compute Saved:{' '}
                        {activeDotsResult.computeSavedPct}%
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onAppendAssistantOutput(activeDotsResult.synthesizedAnswer)
                        setModal(null)
                      }}
                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                    >
                      Insert Route Synthesis into Chat
                    </button>
                  </div>

                  {/* Expert Allocations */}
                  <div className="space-y-2">
                    {activeDotsResult.allocations.map((alloc) => (
                      <div
                        key={alloc.expertId}
                        className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-[#2d3347] dark:bg-[#161b2c]"
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-900 dark:text-white">{alloc.label}</span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400">
                            {alloc.weightPct}% compute • {alloc.modelTier}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                            style={{ width: `${alloc.weightPct}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{alloc.rationale}</p>
                      </div>
                    ))}
                  </div>

                  {/* Connected Context Dots */}
                  <div>
                    <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Connected Context Dots Grounded in Prompt
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeDotsResult.connectedDots.map((dot) => (
                        <span
                          key={dot.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-[#161b2c] dark:text-slate-200"
                        >
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span>{dot.label}</span>
                          <span className="font-mono text-[10px] text-emerald-600">{dot.relevanceScore}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 5: GLOBAL COMMAND PALETTE (CTRL+K / ⌘K) — ALL 12 FRONTIER ENGINES
         ───────────────────────────────────────────────────────────────────── */}
      {modal === 'command_palette' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 pt-16 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-[#2d3347] dark:bg-[#111522]">
            <div className="flex items-center gap-3 border-b border-slate-200/80 px-4 py-3.5 dark:border-[#2d3347]">
              <Search size={18} className="text-rose-500" />
              <input
                type="text"
                autoFocus
                value={cmdSearch}
                onChange={(e) => setCmdSearch(e.target.value)}
                placeholder="Search all 12 Frontier Engines (Grok, OpenClaw, Hermes, Dots, Tool Forge, MCTS, Sentinel, Swarm Market)..."
                className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800"
              >
                ESC
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-3 space-y-1.5">
              {commandPaletteItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-left transition hover:bg-slate-100/80 dark:hover:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-rose-500">
                        {item.category}
                      </span>
                      <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold text-white dark:bg-white dark:text-slate-900">
                        {item.badge}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{item.subtitle}</p>
                  </div>
                  <ArrowUpRight size={15} className="shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
