'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { GrowthAutopilotState, GrowthExperiment } from '@openagents/sdk'
import {
  ArrowUpRight,
  Check,
  Copy,
  DollarSign,
  Flame,
  Loader2,
  Megaphone,
  Percent,
  RefreshCw,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'

const CHANNEL_OPTIONS: Array<{
  value: GrowthExperiment['channel']
  label: string
  badge: string
}> = [
  { value: 'x_thread', label: 'Viral X / Twitter Launch Thread', badge: 'X Thread' },
  { value: 'linkedin_launch', label: 'Executive LinkedIn Deep-Dive Post', badge: 'LinkedIn' },
  { value: 'waitlist_email', label: 'High-Converting Waitlist Activation Email', badge: 'Waitlist Email' },
  { value: 'seo_landing', label: 'Programmatic SEO Comparison Landing Copy', badge: 'SEO Landing' },
]

const CAMPAIGN_PRESETS = [
  {
    title: 'OpenAgents 1-Click Prompt-to-Production Launch',
    channel: 'x_thread' as const,
    productAngle:
      'Show how OpenAgents combines Grok DeepSearch, OpenClaw Soul Heartbeat, and isolated VM Tool Forge to ship verified PRs while you sleep.',
  },
  {
    title: 'Enterprise Zero-Trust Secret-Zero Firewall Rollout',
    channel: 'linkedin_launch' as const,
    productAngle:
      'Highlight how CTOs eliminate API key & PII leakage across multi-agent swarms with cryptographic SHA-256 execution receipts.',
  },
  {
    title: 'VIP Early-Access Cohort Onboarding Wave',
    channel: 'waitlist_email' as const,
    productAngle:
      'Invite waitlist builders to claim their OpenAgents workspace with $50 in FinOps arbitrage compute credits.',
  },
]

export default function GrowthAutopilotPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [state, setState] = useState<GrowthAutopilotState | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [title, setTitle] = useState(CAMPAIGN_PRESETS[0].title)
  const [channel, setChannel] = useState<GrowthExperiment['channel']>('x_thread')
  const [productAngle, setProductAngle] = useState(CAMPAIGN_PRESETS[0].productAngle)

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sdk.agenticSuite.getGrowthState()
      setState(data)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load OpenAgents Growth Autopilot telemetry')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
  }, [loadState])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !productAngle.trim()) return
    setGenerating(true)
    try {
      const updated = await sdk.agenticSuite.generateGrowthCampaign({
        title: title.trim(),
        channel,
        productAngle: productAngle.trim(),
      })
      setState(updated)
      addToast('success', 'Autonomous growth experiment synthesized & staged')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to generate growth campaign')
    } finally {
      setGenerating(false)
    }
  }

  const copyText = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      addToast('success', `${label} copied to clipboard`)
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000)
    } catch {
      addToast('error', 'Failed to copy to clipboard')
    }
  }

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        {/* Header */}
        <header className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-indigo-950/80 p-6 shadow-2xl">
          <div className="pointer-events-none absolute -right-14 -top-14 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                <TrendingUp size={13} />
                OpenAgents Revenue &amp; GTM Autopilot
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Autonomous Revenue, Stripe &amp; Growth Autopilot
              </h1>
              <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                Real-time waitlist velocity, conversion funnel telemetry, projected Stripe MRR, and autonomous multi-channel
                campaign synthesis for OpenAgents.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadState()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Sync Stripe &amp; Funnel
            </button>
          </div>

          {/* 4 Revenue & Funnel KPI Cards */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Verified Waitlist Builders</span>
                <Users size={15} className="text-cyan-400" />
              </div>
              <div className="mt-1.5 text-2xl font-black text-white">
                {(state?.waitlistCount ?? 0).toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-cyan-300">
                Organic developer + team signups
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Weekly Growth Velocity</span>
                <TrendingUp size={15} className="text-emerald-400" />
              </div>
              <div className="mt-1.5 text-2xl font-black text-emerald-300">
                +{state?.weeklyGrowthPct ?? 0}%
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Week-over-week compounding lift
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Paid Conversion Rate</span>
                <Percent size={15} className="text-indigo-400" />
              </div>
              <div className="mt-1.5 text-2xl font-black text-indigo-300">
                {state?.conversionRatePct ?? 0}%
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Free sandbox → OpenAgents Pro tier
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Projected Stripe MRR</span>
                <DollarSign size={15} className="text-emerald-400" />
              </div>
              <div className="mt-1.5 text-2xl font-black text-emerald-300">
                ${(state?.mrrProjectedUsd ?? 0).toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Active subscriptions + usage expansion
              </div>
            </div>
          </div>
        </header>

        {/* Campaign Generator Form */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                <Megaphone size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-white">
                  Synthesize High-Converting Growth Experiment
                </h2>
                <p className="text-xs text-slate-400">
                  Generates channel-native launch copy, predicted conversion lift, and high-intent call-to-action
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CAMPAIGN_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    setTitle(preset.title)
                    setChannel(preset.channel)
                    setProductAngle(preset.productAngle)
                  }}
                  className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  Preset: {preset.title.split(' ').slice(0, 3).join(' ')}…
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Campaign Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., OpenAgents Autonomous Overnight Mission Launch Thread"
                  className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/90 px-3.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Distribution Channel
                </label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as GrowthExperiment['channel'])}
                  className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/90 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                >
                  {CHANNEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Product Angle &amp; Value Hook (productAngle)
              </label>
              <textarea
                rows={3}
                value={productAngle}
                onChange={(e) => setProductAngle(e.target.value)}
                placeholder="Describe the core OpenAgents differentiator, benchmark, or workflow to spotlight…"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 p-3.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={generating || !title.trim() || !productAngle.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-emerald-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Synthesizing Campaign…
                  </>
                ) : (
                  <>
                    <Rocket size={15} />
                    Generate Growth Campaign
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Growth Experiments Cards */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Active &amp; Ready Growth Experiments ({state?.experiments.length ?? 0})
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {state?.experiments.map((exp) => (
              <article
                key={exp.id}
                className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-lg transition hover:border-cyan-500/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-indigo-300">
                        {exp.channel}
                      </span>
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                        Predicted Lift +{exp.predictedLiftPct}%
                      </span>
                      <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-cyan-300">
                        {exp.status}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(exp.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-extrabold text-white">{exp.title}</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(`copy-${exp.id}`, exp.generatedCopy, 'Campaign copy')
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                    >
                      {copiedKey === `copy-${exp.id}` ? <Check size={13} /> : <Copy size={13} />}
                      1-Click Copy Copy
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(`cta-${exp.id}`, exp.callToAction, 'Call to action')
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                    >
                      {copiedKey === `cta-${exp.id}` ? <Check size={13} /> : <Copy size={13} />}
                      Copy CTA
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                      <Sparkles size={13} />
                      Generated Campaign Copy (generatedCopy)
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-200 sm:text-sm">
                      {exp.generatedCopy}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3">
                    <div className="text-xs">
                      <span className="font-bold uppercase tracking-wider text-emerald-300">
                        Call To Action (callToAction):{' '}
                      </span>
                      <span className="font-medium text-white">{exp.callToAction}</span>
                    </div>
                    <ArrowUpRight size={15} className="text-emerald-400" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
