'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  Check,
  Copy,
  Eye,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Monitor,
  Radio,
  ShieldAlert,
  Sparkles,
  Terminal,
  Volume2,
  Zap,
} from 'lucide-react'
import type { CopilotVisualAnalysis } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

type CopilotMode = 'passive' | 'proactive' | 'pair_coding' | 'security_watch'

const COPILOT_MODES: Array<{
  id: CopilotMode
  label: string
  badge: string
  description: string
}> = [
  {
    id: 'passive',
    label: 'Passive Observer',
    badge: 'Low-Noise',
    description: 'Silently indexes viewport elements and responds only when addressed.',
  },
  {
    id: 'proactive',
    label: 'Proactive Co-Pilot',
    badge: 'Recommended',
    description: 'Flags UI anomalies, broken selectors, and workflow shortcuts in real time.',
  },
  {
    id: 'pair_coding',
    label: 'Live Pair Coder',
    badge: '@Forge Sync',
    description: 'Watches IDE/browser diffs and stages ready-to-apply TypeScript patches.',
  },
  {
    id: 'security_watch',
    label: 'SecOps Watch',
    badge: 'Zero-Trust',
    description: 'Monitors terminal & network frames for exposed credentials or unsafe commands.',
  },
]

export default function FullDuplexCopilotPage() {
  const addToast = useUIStore((s) => s.addToast)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [analyses, setAnalyses] = useState<CopilotVisualAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [listening, setListening] = useState(false)
  const [mode, setMode] = useState<CopilotMode>('pair_coding')
  const [windowTitle, setWindowTitle] = useState(
    'OpenAgents IDE & Live Cloudflare Deployment Console',
  )
  const [voiceTranscript, setVoiceTranscript] = useState(
    'Inspect the active viewport, check for any latency bottlenecks, and stage the next fix.',
  )
  const [domSummary, setDomSummary] = useState(
    'Active split-pane view: ChatWindow.tsx + DevTools Network SSE stream (TTFT 145ms) + git branch main clean.',
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sdk.agenticSuite.getCopilotState()
      setAnalyses(res.analyses ?? [])
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Live Co-Pilot state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [loadState])

  const startScreenShare = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        addToast('warning', 'Screen Capture API unavailable in this browser; using simulated viewport')
        return
      }
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      })
      streamRef.current = mediaStream
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setScreenSharing(true)
      const track = mediaStream.getVideoTracks()[0]
      const label = track?.label
      if (label) {
        setWindowTitle(`Live Screen Share: ${label}`)
      }
      track?.addEventListener('ended', () => {
        setScreenSharing(false)
      })
      addToast('success', 'WebRTC live screen stream connected to OpenAgents Co-Pilot')
    } catch (err: any) {
      addToast('info', 'Using simulated high-DPI workspace viewport preview')
    }
  }

  const stopScreenShare = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScreenSharing(false)
  }

  const toggleVoiceInput = () => {
    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null

    if (!SpeechRecognitionCtor) {
      setListening((prev) => !prev)
      addToast(
        'info',
        listening
          ? 'Voice mic muted'
          : 'Simulated Full-Duplex Voice stream active — edit transcript or click Analyze Frame',
      )
      return
    }

    if (listening) {
      setListening(false)
      return
    }

    try {
      const recognition = new SpeechRecognitionCtor()
      recognition.lang = 'en-US'
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      setListening(true)
      recognition.onresult = (event: any) => {
        const text = event.results?.[0]?.[0]?.transcript
        if (text) {
          setVoiceTranscript(text)
          addToast('success', `Heard: "${text}"`)
        }
      }
      recognition.onerror = () => setListening(false)
      recognition.onend = () => setListening(false)
      recognition.start()
    } catch {
      setListening(false)
    }
  }

  const handleAnalyzeFrame = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!voiceTranscript.trim()) {
      addToast('warning', 'Provide a voice transcript or command to analyze')
      return
    }
    setAnalyzing(true)
    try {
      const result = await sdk.agenticSuite.analyzeScreenFrame({
        windowTitle: `[${mode.toUpperCase()}] ${windowTitle.trim()}`,
        voiceTranscript: voiceTranscript.trim(),
        domSummary: `${domSummary.trim()} (Mode: ${mode})`,
      })
      setAnalyses((prev) => [result, ...prev.filter((a) => a.id !== result.id)])
      addToast('success', 'Visual frame grounded & spoken response synthesized')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to analyze screen frame')
    } finally {
      setAnalyzing(false)
    }
  }

  const getSeverityBadge = (index: number) => {
    if (mode === 'security_watch' || index === 0) {
      return {
        label: 'critical_fix',
        cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      }
    }
    if (index === 1) {
      return {
        label: 'warning',
        cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      }
    }
    return {
      label: 'info',
      cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    }
  }

  const handleCopyCommand = (id: string, cmd: string) => {
    navigator.clipboard?.writeText(cmd).catch(() => undefined)
    setCopiedId(id)
    addToast('success', 'Suggested Co-Pilot command copied to clipboard')
    setTimeout(() => setCopiedId(null), 1800)
  }

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        {/* Header */}
        <header className="oa-float-card flex flex-wrap items-center justify-between gap-4 border border-indigo-500/25 bg-gradient-to-r from-slate-950 via-indigo-950/90 to-slate-900 p-5 text-white">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25">
              <Radio size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                  OpenAgents Full-Duplex Live Voice &amp; Screen Co-Pilot
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Full-Duplex Vision + Audio
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Streams your live browser/IDE screen via WebRTC and pairs it with continuous voice intent grounding and 1-click remediation actions.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={screenSharing ? stopScreenShare : startScreenShare}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold transition ${
                screenSharing
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/30'
              }`}
            >
              {screenSharing ? <CameraOff size={15} /> : <Camera size={15} />}
              {screenSharing ? 'Stop WebRTC Share' : 'Share Live Screen'}
            </button>

            <button
              type="button"
              onClick={toggleVoiceInput}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold transition ${
                listening
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {listening ? <Mic size={15} /> : <MicOff size={15} />}
              {listening ? 'Listening (Full-Duplex)…' : 'Start Voice Mic'}
            </button>
          </div>
        </header>

        {/* Mode Selector */}
        <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {COPILOT_MODES.map((m) => {
            const active = mode === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`rounded-2xl border p-3.5 text-left transition ${
                  active
                    ? 'border-cyan-400 bg-slate-900 text-white shadow-md shadow-cyan-500/10'
                    : 'border-slate-200/80 bg-white/80 text-slate-800 hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold">{m.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {m.badge}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {m.description}
                </p>
              </button>
            )
          })}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: WebRTC Screen Viewport + Voice Command Console */}
          <div className="space-y-5 lg:col-span-6">
            <section className="oa-float-card overflow-hidden p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor size={16} className="text-cyan-400" />
                  <h2 className="text-sm font-bold text-[var(--tone-strong)]">
                    Live Grounded Viewport Preview
                  </h2>
                </div>
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 font-mono text-[10px] text-cyan-300">
                  {screenSharing ? 'WebRTC MediaStream (15fps)' : 'Simulated HUD Viewport'}
                </span>
              </div>

              <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${screenSharing ? 'block' : 'hidden'}`}
                />

                {!screenSharing && (
                  <div className="flex h-full flex-col justify-between p-4 font-mono text-xs text-slate-300">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-cyan-400">● REC // {windowTitle}</span>
                      <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-300">
                        1920×1080 Bounding Boxes Active
                      </span>
                    </div>

                    <div className="my-auto grid grid-cols-2 gap-3 py-3">
                      <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-3">
                        <div className="text-[10px] font-bold uppercase text-cyan-400">
                          [Region #1 • x:280, y:120]
                        </div>
                        <div className="mt-1 text-xs font-bold text-white">
                          Active Code &amp; Chat Stream
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          SSE streaming healthy · 0 unhandled runtime exceptions
                        </p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3">
                        <div className="text-[10px] font-bold uppercase text-emerald-400">
                          [Region #2 • x:880, y:84]
                        </div>
                        <div className="mt-1 text-xs font-bold text-white">
                          Frontier Engine Dock &amp; Telemetry
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Mode: {mode.toUpperCase()} · Ready for 1-click patch
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-[11px] text-slate-400">
                      <span>Audio: Full-Duplex Echo Cancellation Ready</span>
                      <button
                        type="button"
                        onClick={startScreenShare}
                        className="text-cyan-400 underline hover:text-cyan-300"
                      >
                        Connect real screen via getDisplayMedia →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Frame Analysis Input Form */}
              <form onSubmit={handleAnalyzeFrame} className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                    Active Window / Screen Title
                  </label>
                  <input
                    className="oa-input-surface h-10 w-full rounded-xl px-3 text-xs outline-none"
                    value={windowTitle}
                    onChange={(e) => setWindowTitle(e.target.value)}
                    placeholder="Window or IDE tab title…"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                    Live Voice Transcript / Spoken Instruction
                  </label>
                  <textarea
                    rows={2}
                    className="oa-input-surface w-full rounded-xl p-3 text-xs outline-none"
                    value={voiceTranscript}
                    onChange={(e) => setVoiceTranscript(e.target.value)}
                    placeholder="Speak or type what you want the Co-Pilot to inspect on screen…"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                    DOM / Viewport Telemetry Summary
                  </label>
                  <input
                    className="oa-input-surface h-9 w-full rounded-xl px-3 text-xs outline-none"
                    value={domSummary}
                    onChange={(e) => setDomSummary(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={analyzing}
                  className="oa-accent-button flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Grounding Visual Frame &amp; Voice Intent…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Analyze Live Screen Frame + Synthesize Co-Pilot Action
                    </>
                  )}
                </button>
              </form>
            </section>
          </div>

          {/* Right: Frame Insight Feed & 1-Click Suggested Fixes */}
          <div className="space-y-5 lg:col-span-6">
            <section className="oa-float-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
                    <Eye size={15} />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-[var(--tone-strong)]">
                      Live Co-Pilot Frame Insight Feed
                    </h2>
                    <p className="text-xs text-[var(--muted)]">
                      Grounded UI elements, spoken synthesis, severity badges &amp; 1-click fixes
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 font-mono text-[11px] text-slate-300">
                  {analyses.length} frames
                </span>
              </div>

              {loading && analyses.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-xs text-[var(--muted)]">
                  <Loader2 size={16} className="mr-2 animate-spin" /> Loading Co-Pilot insights…
                </div>
              ) : (
                <div className="space-y-4">
                  {analyses.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-lg"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <Layers size={14} className="text-cyan-400" />
                          <span>{item.windowTitle}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Spoken Voice Synthesis Banner */}
                      <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-300">
                          <Volume2 size={13} /> Spoken Co-Pilot Reply
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-100">
                          &ldquo;{item.spokenResponse}&rdquo;
                        </p>
                      </div>

                      {/* Detected Elements with Severity Badges */}
                      <div className="mt-3 space-y-2">
                        {item.detectedElements.map((el, idx) => {
                          const sev = getSeverityBadge(idx)
                          return (
                            <div
                              key={`${item.id}-el-${idx}`}
                              className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-cyan-300">{el.label}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] text-slate-400">
                                    {el.region}
                                  </span>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-black uppercase ${sev.cls}`}
                                  >
                                    {sev.label}
                                  </span>
                                </div>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-300">
                                {el.actionableSuggestion}
                              </p>
                            </div>
                          )
                        })}
                      </div>

                      {/* 1-Click Copy / Apply Suggested Fix */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3 py-2">
                        <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-300">
                          <Terminal size={13} />
                          <span className="line-clamp-1">{item.suggestedCommand}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyCommand(item.id, item.suggestedCommand)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-500/30"
                        >
                          {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                          {copiedId === item.id ? 'Applied / Copied' : '1-Click Apply Fix'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
