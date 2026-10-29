'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  BellOff,
  Brain,
  Clock,
  Flame,
  Loader2,
  MessageSquareWarning,
  Power,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { FlowGuardianState, InterceptedNoiseItem } from '@openagents/sdk'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const PING_PRESETS = [
  {
    label: 'Low-Urgency Slack Nitpick',
    source: 'Slack #general',
    sender: '@alex_pm',
    originalMessage:
      'Hey quick question whenever you have a sec, should we rename the secondary button hover shade in Q3?',
  },
  {
    label: 'Medium-Urgency PR Review Ping',
    source: 'GitHub Webhook',
    sender: 'ci-bot / @sarah_eng',
    originalMessage:
      'Can you review PR #418 (bump telemetry batch interval from 5s to 10s) before tomorrow standup?',
  },
  {
    label: 'High-Urgency Production Latency Alert',
    source: 'PagerDuty / Datadog',
    sender: 'incident-daemon',
    originalMessage:
      'URGENT P1: Postgres connection pool saturation > 96% on primary eu-central-1 replica!',
  },
]

export default function FlowGuardianPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [flowState, setFlowState] = useState<FlowGuardianState | null>(null)
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [simulating, setSimulating] = useState(false)

  const [focusTopicInput, setFocusTopicInput] = useState(
    'Architecting OpenAgents Autonomous Swarm Consensus & Merkle Ledger',
  )
  const [source, setSource] = useState(PING_PRESETS[0].source)
  const [sender, setSender] = useState(PING_PRESETS[0].sender)
  const [originalMessage, setOriginalMessage] = useState(PING_PRESETS[0].originalMessage)

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const st = await sdk.agenticSuite.getFlowGuardianState()
      setFlowState(st)
      if (st.focusTopic) {
        setFocusTopicInput(st.focusTopic)
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load OpenAgents Flow Guardian state')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
  }, [loadState])

  async function handleToggleDeepWork(nextEnabled: boolean) {
    setToggling(true)
    try {
      const updated = await sdk.agenticSuite.toggleDeepWorkMode({
        deepWorkEnabled: nextEnabled,
        focusTopic: focusTopicInput.trim() || 'OpenAgents Deep Architecture Session',
      })
      setFlowState(updated)
      addToast(
        'success',
        updated.deepWorkEnabled
          ? `Deep Work Shield ARMED for "${updated.focusTopic}"`
          : 'Deep Work Shield disarmed — direct notifications restored',
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to toggle Deep Work mode')
    } finally {
      setToggling(false)
    }
  }

  async function handleSimulatePing(e: React.FormEvent) {
    e.preventDefault()
    if (!source.trim() || !sender.trim() || !originalMessage.trim()) {
      addToast('warning', 'Source, sender, and message content are required')
      return
    }
    setSimulating(true)
    try {
      const updated = await sdk.agenticSuite.simulateInterceptedPing({
        source: source.trim(),
        sender: sender.trim(),
        originalMessage: originalMessage.trim(),
      })
      setFlowState(updated)
      addToast('success', `Intercepted inbound ping from ${sender} and synthesized autonomous reply`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to simulate inbound ping interception')
    } finally {
      setSimulating(false)
    }
  }

  const deepWorkEnabled = flowState?.deepWorkEnabled ?? true
  const cognitiveLoadPct = flowState?.cognitiveLoadPct ?? 24
  const focusMinutesSaved = flowState?.focusMinutesSaved ?? 0
  const interceptedItems: InterceptedNoiseItem[] = flowState?.interceptedItems ?? []

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1440px] space-y-6 pb-20">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-slate-900/80 p-5 shadow-lg shadow-emerald-950/20 backdrop-blur">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  OpenAgents Attention Firewall
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    deepWorkEnabled
                      ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400'
                  }`}
                >
                  {deepWorkEnabled ? 'DEEP WORK SHIELD ACTIVE' : 'SHIELD STANDBY'}
                </span>
              </div>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white">
                Cognitive Load &amp; Deep-Work Flow Guardian
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                Protects uninterrupted developer flow by scoring inbound Slack, webhook, and PR noise, auto-negotiating deferrals, and compiling a concise digest for when you surface.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleToggleDeepWork(!deepWorkEnabled)}
              disabled={toggling}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
                deepWorkEnabled
                  ? 'border border-emerald-500/40 bg-emerald-600 text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500'
                  : 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {toggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              {deepWorkEnabled ? 'Deep Work Mode: ON' : 'Deep Work Mode: OFF'}
            </button>

            <button
              type="button"
              onClick={() => void loadState()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* Top Metrics & Focus Topic Configuration */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 lg:col-span-6">
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">
              Active Deep-Work Focus Topic
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={focusTopicInput}
                onChange={(e) => setFocusTopicInput(e.target.value)}
                placeholder="What are you focusing on right now?"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                disabled={toggling}
                onClick={() => void handleToggleDeepWork(true)}
                className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                Lock Focus
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              OpenAgents references this focus context when auto-replying to non-critical interruptions.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 lg:col-span-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Focus Time Saved</span>
              <Clock className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-extrabold text-emerald-400">
                {focusMinutesSaved}m
              </span>
              <span className="text-xs text-slate-400">
                ({(focusMinutesSaved / 60).toFixed(1)} hrs preserved)
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Calculated at 23m context-switch recovery per intercepted ping.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 lg:col-span-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Cognitive Load Index</span>
              <Activity className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold text-cyan-300">
                {cognitiveLoadPct}%
              </span>
              <span className="text-[11px] font-semibold text-emerald-400">
                {cognitiveLoadPct < 50 ? 'OPTIMAL FLOW ZONE' : 'ELEVATED LOAD'}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(5, cognitiveLoadPct))}%` }}
              />
            </div>
          </div>
        </div>

        {/* While You Were In Flow Digest */}
        <section className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900/90 to-cyan-950/30 p-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-300">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            While-You-Were-In-Flow Executive Digest
          </div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
            {flowState?.whileYouWereInFlowDigest ??
              'No interruptions recorded yet. Arm Deep Work Mode and simulate an inbound ping below.'}
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Inbound Ping Simulator */}
          <div className="space-y-5 lg:col-span-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
                  <BellOff className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Inbound Interruption Simulator
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Test how OpenAgents triages Slack, webhook, or PagerDuty pings
                  </p>
                </div>
              </div>

              <div className="mb-4 space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Test Scenarios
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PING_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setSource(preset.source)
                        setSender(preset.sender)
                        setOriginalMessage(preset.originalMessage)
                      }}
                      className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSimulatePing} className="space-y-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Channel / Source
                    </label>
                    <input
                      type="text"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder="e.g. Slack #engineering"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      Sender Handle
                    </label>
                    <input
                      type="text"
                      value={sender}
                      onChange={(e) => setSender(e.target.value)}
                      placeholder="e.g. @alex_pm"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 font-mono text-xs text-cyan-300 outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Inbound Message Payload
                  </label>
                  <textarea
                    rows={4}
                    value={originalMessage}
                    onChange={(e) => setOriginalMessage(e.target.value)}
                    placeholder="Type a simulated Slack message or alert webhook..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/90 p-3 text-xs text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={simulating}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-cyan-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-950/40 transition hover:brightness-110 disabled:opacity-50"
                >
                  {simulating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Simulate Inbound Ping &amp; Auto-Negotiate
                </button>
              </form>
            </section>
          </div>

          {/* Right Column: Intercepted Items Feed */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Intercepted Noise &amp; Autonomous Responses ({interceptedItems.length})
              </h2>
              <span className="font-mono text-[11px] text-slate-400">
                Urgency Threshold &lt; 85 Buffered
              </span>
            </div>

            {interceptedItems.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
                No pings intercepted yet. Trigger a test scenario on the left.
              </div>
            ) : (
              <div className="space-y-3.5">
                {interceptedItems.map((item) => {
                  const highUrgency = item.urgencyScore >= 80
                  const medUrgency = item.urgencyScore >= 45 && item.urgencyScore < 80
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 transition hover:border-cyan-500/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-white">
                            {item.source}
                          </span>
                          <span className="font-mono text-xs text-cyan-300">{item.sender}</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {new Date(item.receivedAt).toLocaleTimeString()}
                          </span>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                            highUrgency
                              ? 'border border-rose-500/40 bg-rose-500/15 text-rose-300'
                              : medUrgency
                                ? 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                                : 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {highUrgency ? (
                            <Flame className="h-3 w-3" />
                          ) : (
                            <MessageSquareWarning className="h-3 w-3" />
                          )}
                          Urgency Score: {item.urgencyScore}/100
                        </span>
                      </div>

                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">
                        <span className="font-semibold text-slate-400">Inbound Message: </span>
                        {item.originalMessage}
                      </div>

                      <div className="mt-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                          <Sparkles className="h-3.5 w-3.5" />
                          OpenAgents Auto-Handled Response:
                        </div>
                        <p className="mt-1 leading-relaxed">{item.autoHandledResponse}</p>
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
