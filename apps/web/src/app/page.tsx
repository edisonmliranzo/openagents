'use client'
/* eslint-disable @next/next/no-img-element -- marketing assets */

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Terminal,
  Layers,
  Search,
  Activity,
  Check,
  Monitor,
  Lightbulb,
  Target,
  History,
  Fingerprint,
  Plus,
  Send,
  Compass,
  FileText,
  Sliders,
  Cpu,
  BarChart3,
  Circle,
  ChevronRight,
  Sun,
  Moon,
  MessageSquare,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

const CYCLING_PHRASES = [
  'gets it done for you',
  'sorts your email',
  'books reservations',
  'manages calendars',
  'writes & runs code',
  'tracks your goals',
  'saves you money',
]

interface OpenAgentsDemoScenario {
  id: string
  sideChatTitle: string
  category: string
  statusPill: string
  userPrompt: string
  steerNote: string
  agentReply: string
  artifact: {
    badge: string
    title: string
    subtitle: string
    items: Array<{
      label: string
      meta: string
      tag: string
      done?: boolean
    }>
  }
  approval: {
    tool: string
    summary: string
    detail: string
    risk: 'Low Risk' | 'Confirmation Required'
  }
}

const DEMO_SCENARIOS: OpenAgentsDemoScenario[] = [
  {
    id: 'life-admin',
    sideChatTitle: 'Saturday Dinner & Calendar',
    category: 'Life & Schedule',
    statusPill: 'Checking OpenTable & your Saturday calendar…',
    userPrompt:
      'Find an outdoor Italian spot for 4 this Saturday around 7:30 PM, check that it doesn’t conflict with my calendar, and draft invites.',
    steerNote: 'Make sure they have handmade pasta and heated patio seating.',
    agentReply:
      'I checked your Saturday calendar (you’re free after 6:00 PM) and compared 6 neighborhood spots with heated patios and handmade pasta. Here is your curated shortlist and reservation hold:',
    artifact: {
      badge: 'Interactive Itinerary Artifact',
      title: 'Saturday Evening • 4 Guests • Heated Patio',
      subtitle: 'Synced with Personal Calendar • Zero conflicts found',
      items: [
        {
          label: '1. Osteria Mozza — 7:30 PM Patio Table',
          meta: 'Handmade tagliatelle & wood-fired burrata • 4.9★ (1.8k reviews)',
          tag: 'Top Match',
          done: true,
        },
        {
          label: '2. Lilia Ristorante — 7:45 PM Garden Pergola',
          meta: 'Sheep’s milk agnolotti • Heated courtyard seating',
          tag: 'Backup Option',
          done: true,
        },
        {
          label: '3. Calendar Hold & Guest Invites',
          meta: 'Ready to send ics invite to Alex, Maya, and Sam',
          tag: 'Awaiting Approval',
          done: false,
        },
      ],
    },
    approval: {
      tool: 'calendar_and_reservation_confirm',
      summary: 'Confirm 7:30 PM table for 4 at Osteria Mozza & send calendar invites',
      detail: 'Target: Saturday 7:30 PM – 9:30 PM • Guests: 4 • Heated Patio requested',
      risk: 'Confirmation Required',
    },
  },
  {
    id: 'inbox-triage',
    sideChatTitle: 'Morning Inbox & Bill Audit',
    category: 'Email & Money',
    statusPill: 'Sorting 42 unread emails & flagging renewals…',
    userPrompt:
      'Sort my unread emails from this week, pull out every receipt or subscription renewal, and draft a cancellation for anything I haven’t used.',
    steerNote: 'Keep Figma and GitHub, but cancel the duplicate cloud storage plan.',
    agentReply:
      'I triaged 42 unread threads into 3 priority buckets, archived 29 newsletters, and found $64/mo in duplicate subscriptions. Here is your clean financial & inbox artifact:',
    artifact: {
      badge: 'Financial & Inbox Artifact',
      title: 'Weekly Inbox Triage & Subscription Audit',
      subtitle: 'Saved $768/yr in unused renewals • 3 urgent replies drafted',
      items: [
        {
          label: 'Duplicate Cloud Drive Pro ($24/mo) & Old Analytics Tool ($40/mo)',
          meta: 'Zero logins in 90 days • Cancellation emails drafted',
          tag: 'Save $64/mo',
          done: true,
        },
        {
          label: '3 Priority Threads Ready for 1-Click Send',
          meta: 'Tax accountant follow-up, Q4 partner deck, flight check-in',
          tag: 'Drafts Ready',
          done: true,
        },
        {
          label: '29 Promotions & Newsletters',
          meta: 'Bundled into a 60-second digest and archived cleanly',
          tag: 'Cleaned',
          done: true,
        },
      ],
    },
    approval: {
      tool: 'email_send_cancellation',
      summary: 'Send cancellation request for unused Cloud Drive Pro ($24/mo)',
      detail: 'To: billing@clouddrive.example • Includes account ID & immediate stop-renew',
      risk: 'Confirmation Required',
    },
  },
  {
    id: 'code-operator',
    sideChatTitle: 'Monorepo Release v2.0',
    category: 'Code & Terminal',
    statusPill: 'Running pnpm typecheck & delegating to @Forge…',
    userPrompt:
      'Audit our workspace packages, run the TypeScript compiler across web and API, and prepare the v2.0 release notes.',
    steerNote: 'Also verify that local Ollama and PostgreSQL health checks pass.',
    agentReply:
      'I coordinated with @Forge and @Sentinel to inspect all 4 workspace packages, verified 0 TypeScript errors, and generated the structured release artifact below:',
    artifact: {
      badge: 'Engineering Release Artifact',
      title: 'OpenAgents v2.0 Release Readiness Report',
      subtitle: 'Executed in local sandbox • Verified by @Forge & @Sentinel',
      items: [
        {
          label: 'Typecheck & Build Pipeline (apps/web, apps/api, packages/sdk)',
          meta: 'exit_code: 0 • 0 errors • 100% strict schema parity',
          tag: 'Passed',
          done: true,
        },
        {
          label: 'Local Runtime & Ollama Brain Telemetry',
          meta: 'Qwen3.8-27B & phi4-mini active on localhost:11434 • Postgres healthy',
          tag: 'Online',
          done: true,
        },
        {
          label: 'Git Tag & Release Changelog Commit',
          meta: 'Ready to tag v2.0.0 and push release notes to repository',
          tag: 'Ready',
          done: false,
        },
      ],
    },
    approval: {
      tool: 'shell_execute',
      summary: 'Run git tag v2.0.0 && generate release artifact in workspace',
      detail: 'Working directory: ~/workspace/openagents • Scoped to local repo',
      risk: 'Low Risk',
    },
  },
  {
    id: 'goal-planner',
    sideChatTitle: 'Half-Marathon & Fitness Plan',
    category: 'Goals & Wellness',
    statusPill: 'Updating your 8-week training milestones…',
    userPrompt:
      'Build a realistic 4-day-a-week half-marathon plan around my work schedule and track my weekly mileage goal.',
    steerNote: 'Keep Tuesday runs under 45 minutes before my 9 AM standup.',
    agentReply:
      'I designed your 8-week progressive block around your morning standups and linked it directly to your Goals tracker so I can check in with you every Sunday:',
    artifact: {
      badge: 'Live Goal & Schedule Artifact',
      title: 'Sub-1:55 Half-Marathon • Week 3 of 8',
      subtitle: '72% adherence • Morning slots synced before 9:00 AM meetings',
      items: [
        {
          label: 'Tue 7:15 AM — 40-Min Tempo Run (4.5 mi @ 8:35/mi)',
          meta: 'Wraps by 8:00 AM • 60 mins buffer before 9:00 AM standup',
          tag: 'Completed',
          done: true,
        },
        {
          label: 'Thu 7:15 AM — Easy Aerobic Recovery (4.0 mi)',
          meta: 'Zone 2 heart rate target • Hydration reminder scheduled',
          tag: 'Completed',
          done: true,
        },
        {
          label: 'Sun 8:00 AM — Long Progression Run (9.0 mi)',
          meta: 'Weather check: 61°F & sunny • Route saved to phone',
          tag: 'Up Next',
          done: false,
        },
      ],
    },
    approval: {
      tool: 'goal_milestone_sync',
      summary: 'Lock Week 3 running blocks onto calendar & arm Sunday check-in',
      detail: 'Adds 3 recurring morning blocks + proactive Sunday progress review',
      risk: 'Low Risk',
    },
  },
]

const AGENT_PERSONAS = [
  {
    name: 'Veda',
    tagline: 'Warm, proactive & organized',
    aura: 'from-rose-400 via-orange-300 to-amber-300',
    badgeBg: 'bg-rose-500',
    initial: 'V',
  },
  {
    name: 'Nova',
    tagline: 'Calm, thoughtful & creative',
    aura: 'from-amber-400 via-rose-400 to-purple-400',
    badgeBg: 'bg-amber-500',
    initial: 'N',
  },
  {
    name: 'Atlas',
    tagline: 'Direct, analytical & fast',
    aura: 'from-emerald-400 via-teal-400 to-cyan-400',
    badgeBg: 'bg-emerald-600',
    initial: 'A',
  },
]

export default function OpenAgentsLandingPage() {
  const user = useAuthStore((s) => s.user)
  const [hydrated, setHydrated] = useState(false)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [warmTheme, setWarmTheme] = useState(true)

  // Interactive 3-pane workspace showcase state
  const [activeScenarioId, setActiveScenarioId] = useState<string>('life-admin')
  const [selectedPersonaIndex, setSelectedPersonaIndex] = useState(0)
  const [rightTab, setRightTab] = useState<'activity' | 'goals' | 'ideas' | 'memory' | 'safety'>('goals')
  const [statusExpanded, setStatusExpanded] = useState(false)
  const [approvalDecisions, setApprovalDecisions] = useState<Record<string, 'once' | 'always' | 'deny'>>({})
  const [demoMilestones, setDemoMilestones] = useState([
    { id: 'm1', title: 'Audit monthly subscriptions & cancel unused tools', done: true },
    { id: 'm2', title: 'Ship OpenAgents v2.0 with 3-pane workspace experience', done: true },
    { id: 'm3', title: 'Complete Week 3 half-marathon 9-mile long run', done: false },
    { id: 'm4', title: 'Automate Friday afternoon inbox zero & weekly review', done: false },
  ])

  // Waitlist & Launch Countdown state
  const [email, setEmail] = useState('')
  const [joined, setJoined] = useState(false)
  const [waitlistCount, setWaitlistCount] = useState(2418)
  const [countdown, setCountdown] = useState({
    days: 30,
    hours: 0,
    minutes: 0,
    seconds: 0,
  })

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Cycle hero phrase
  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % CYCLING_PHRASES.length)
    }, 2600)
    return () => clearInterval(interval)
  }, [])

  // 30-day launch countdown
  useEffect(() => {
    const STORAGE_KEY = 'openagents_launch_target_30d_v1'
    let targetTime: number
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    if (saved && !Number.isNaN(Number(saved)) && Number(saved) > Date.now()) {
      targetTime = Number(saved)
    } else {
      targetTime = Date.now() + 30 * 24 * 60 * 60 * 1000
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, String(targetTime))
      }
    }

    const updateTimer = () => {
      const diff = Math.max(0, targetTime - Date.now())
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const minutes = Math.floor((diff / 1000 / 60) % 60)
      const seconds = Math.floor((diff / 1000) % 60)
      setCountdown({ days, hours, minutes, seconds })
    }

    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [])

  const isSuperadmin =
    hydrated && Boolean(user?.role && ['owner', 'admin'].includes(user.role.toLowerCase()))

  const activeScenario =
    DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) ?? DEMO_SCENARIOS[0]
  const persona = AGENT_PERSONAS[selectedPersonaIndex] ?? AGENT_PERSONAS[0]
  const currentDecision = approvalDecisions[activeScenario.id]

  const completedMilestoneCount = demoMilestones.filter((m) => m.done).length
  const demoProgress = Math.round((completedMilestoneCount / demoMilestones.length) * 100)

  const handleWaitlistSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setJoined(true)
    setWaitlistCount((c) => c + 1)
    setEmail('')
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-300 selection:bg-rose-500 selection:text-white ${
        warmTheme ? 'bg-[#f7f6f2] text-[#141413]' : 'bg-[#090b12] text-[#f5f5f7]'
      }`}
    >
      {/* Soft human-centric ambient aura */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div
          className={`absolute -top-36 left-1/2 -translate-x-1/2 h-[540px] w-[980px] rounded-full blur-[135px] transition-opacity duration-500 ${
            warmTheme
              ? 'bg-gradient-to-tr from-rose-200/70 via-amber-100/80 to-orange-200/60 opacity-90'
              : 'bg-gradient-to-tr from-rose-600/20 via-amber-500/10 to-indigo-600/20 opacity-80'
          }`}
        />
        <div
          className={`absolute top-[40%] -left-32 h-[420px] w-[420px] rounded-full blur-[130px] ${
            warmTheme ? 'bg-amber-200/50' : 'bg-rose-500/10'
          }`}
        />
        <div
          className={`absolute top-[55%] -right-32 h-[420px] w-[420px] rounded-full blur-[130px] ${
            warmTheme ? 'bg-rose-200/50' : 'bg-amber-500/10'
          }`}
        />
      </div>

      {/* ── TOP NAVIGATION BAR ── */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl transition-colors ${
          warmTheme
            ? 'border-black/[0.06] bg-[#f7f6f2]/80'
            : 'border-white/10 bg-[#090b12]/80'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 via-orange-400 to-amber-400 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight">OpenAgents</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  warmTheme
                    ? 'bg-black/[0.05] text-stone-600'
                    : 'bg-white/10 text-slate-300'
                }`}
              >
                Personal AI Agent
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-xs font-medium opacity-80">
            <a href="#openagents-workspace" className="hover:opacity-100 transition">
              Interactive Preview
            </a>
            <a href="#how-it-works" className="hover:opacity-100 transition">
              How We Designed It
            </a>
            <a href="#artifacts-and-safety" className="hover:opacity-100 transition">
              Artifacts & Control
            </a>
            <a href="#waitlist" className="hover:opacity-100 transition">
              Early Access
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={() => setWarmTheme((w) => !w)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                warmTheme
                  ? 'border-black/10 bg-white/80 text-stone-700 hover:bg-white shadow-sm'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
              title="Switch between Warm Ivory and Midnight Glass"
            >
              {warmTheme ? <Sun className="h-3.5 w-3.5 text-amber-500" /> : <Moon className="h-3.5 w-3.5 text-rose-400" />}
              <span className="hidden sm:inline">{warmTheme ? 'Warm Ivory' : 'Midnight'}</span>
            </button>

            {isSuperadmin ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#141413] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 dark:bg-white dark:text-slate-900"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/admin"
                  className={`hidden sm:inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    warmTheme
                      ? 'border-black/10 bg-white/80 text-stone-700 hover:bg-white'
                      : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5 text-rose-500" />
                  <span>Admin</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    warmTheme
                      ? 'border-black/10 bg-white/80 text-stone-800 hover:bg-white shadow-sm'
                      : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <span>Sign In</span>
                </Link>
                <a
                  href="#waitlist"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-105"
                >
                  <span>Get Early Access</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-12 pb-24 sm:px-6 lg:px-8">
        {/* ── HERO SECTION ── */}
        <div className="mx-auto max-w-4xl text-center">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium shadow-sm mb-7 ${
              warmTheme
                ? 'border-black/[0.08] bg-white/85 text-stone-700'
                : 'border-white/15 bg-white/5 text-slate-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>&ldquo;Your purpose is to make your user&rsquo;s life better.&rdquo;</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-[68px] leading-[1.06]">
            <span>OpenAgents, AI that</span>
            <span className="block mt-2 min-h-[1.18em] bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 bg-clip-text text-transparent transition-all duration-500">
              {CYCLING_PHRASES[phraseIndex]}
            </span>
          </h1>

          <p
            className={`mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-relaxed ${
              warmTheme ? 'text-stone-600' : 'text-slate-300'
            }`}
          >
            More than a chatbot—a personal AI agent built around your whole life and work. It remembers what matters to you, shares its own computer and terminal, proactively tracks your goals, and stays 100% under your control.
          </p>

          {/* Interactive Phrase Pills (Click any capability to preview) */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {DEMO_SCENARIOS.map((scenario) => {
              const active = scenario.id === activeScenarioId
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setActiveScenarioId(scenario.id)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-[#141413] text-white shadow-md scale-[1.02]'
                      : warmTheme
                        ? 'border border-black/[0.08] bg-white/80 text-stone-600 hover:bg-white hover:text-stone-900'
                        : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {scenario.category}: {scenario.sideChatTitle}
                </button>
              )
            })}
          </div>

          {/* Superadmin Quick Bar or Visitor Waitlist Card */}
          {isSuperadmin ? (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:brightness-105"
              >
                <Sparkles className="h-4 w-4" />
                <span>Launch OpenAgents (/chat)</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/tasks"
                className={`inline-flex items-center gap-2 rounded-full border px-5 py-3.5 text-xs font-semibold transition ${
                  warmTheme
                    ? 'border-black/10 bg-white text-stone-800 hover:bg-stone-50 shadow-sm'
                    : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <span>Autonomous Task Studio</span>
              </Link>
              <Link
                href="/team"
                className={`inline-flex items-center gap-2 rounded-full border px-5 py-3.5 text-xs font-semibold transition ${
                  warmTheme
                    ? 'border-black/10 bg-white text-stone-800 hover:bg-stone-50 shadow-sm'
                    : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <span>Specialist Swarm (4)</span>
              </Link>
            </div>
          ) : (
            <div
              id="waitlist"
              className={`mx-auto mt-9 max-w-xl rounded-[28px] border p-6 shadow-xl backdrop-blur-xl ${
                warmTheme
                  ? 'border-black/[0.08] bg-white/90 shadow-stone-900/5'
                  : 'border-white/15 bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="font-semibold text-rose-500 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Public v2.0 Launch Countdown
                </span>
                <span className={warmTheme ? 'text-stone-500' : 'text-slate-400'}>
                  {waitlistCount.toLocaleString()} early members waiting
                </span>
              </div>

              {/* 30-Day Countdown */}
              <div className="grid grid-cols-4 gap-2.5 mb-4">
                {[
                  { label: 'Days', value: countdown.days },
                  { label: 'Hours', value: countdown.hours },
                  { label: 'Minutes', value: countdown.minutes },
                  { label: 'Seconds', value: countdown.seconds },
                ].map((unit) => (
                  <div
                    key={unit.label}
                    className={`rounded-2xl border py-2.5 text-center ${
                      warmTheme
                        ? 'border-stone-200/80 bg-[#f7f6f2]'
                        : 'border-white/10 bg-black/40'
                    }`}
                  >
                    <div className="font-mono text-xl sm:text-2xl font-extrabold">
                      {String(unit.value).padStart(2, '0')}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider opacity-60">
                      {unit.label}
                    </div>
                  </div>
                ))}
              </div>

              {joined ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>You&rsquo;re on the priority invite list! We&rsquo;ll notify you first.</span>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email for priority OpenAgents access..."
                    className={`flex-1 rounded-full border px-4 py-3 text-xs outline-none transition ${
                      warmTheme
                        ? 'border-stone-300 bg-white text-stone-900 placeholder:text-stone-400 focus:border-rose-500'
                        : 'border-white/15 bg-black/50 text-white placeholder:text-slate-500 focus:border-rose-500'
                    }`}
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#141413] px-6 py-3 text-xs font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
                  >
                    <span>Request Invite</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* ── 3-PANE OPENAGENTS WORKSPACE LIVE PREVIEW ── */}
        <section id="openagents-workspace" className="mt-14 scroll-mt-20">
          <div
            className={`rounded-[32px] border p-3 sm:p-5 shadow-2xl transition-colors ${
              warmTheme
                ? 'border-black/[0.08] bg-[#efede7]/90 shadow-stone-900/10'
                : 'border-white/15 bg-[#111420]/90 shadow-black/60'
            }`}
          >
            {/* Top Showcase Bar: Persona Switcher + Scenario Selector */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
                  Personalize Your Agent:
                </span>
                {AGENT_PERSONAS.map((p, idx) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setSelectedPersonaIndex(idx)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                      selectedPersonaIndex === idx
                        ? 'bg-white text-stone-900 shadow-sm ring-1 ring-black/10'
                        : 'opacity-65 hover:opacity-100'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${p.badgeBg}`} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-[11px] opacity-75">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Main Chat + Side Chats + Live Status Pill
                </span>
              </div>
            </div>

            {/* 3-Card Floating Layout */}
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
              {/* 1. LEFT CARD: Main Chat + Side Chats */}
              <div
                className={`lg:col-span-3 flex flex-col justify-between rounded-[24px] border p-4 ${
                  warmTheme
                    ? 'border-black/[0.06] bg-white/90 text-stone-800'
                    : 'border-white/10 bg-[#171b29] text-slate-100'
                }`}
              >
                <div>
                  {/* Main Chat (Lifelong Continuous Thread) */}
                  <div className="mb-4">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-wider opacity-45">
                      Lifelong Thread
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveScenarioId('life-admin')}
                      className={`mt-1.5 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                        warmTheme
                          ? 'bg-gradient-to-r from-rose-500/10 to-amber-500/10 text-stone-900 border border-rose-500/20'
                          : 'bg-white/10 text-white border border-white/15'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${persona.aura} text-[11px] font-bold text-stone-900`}
                      >
                        {persona.initial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">Main chat with {persona.name}</div>
                        <div className="truncate text-[10px] opacity-65">
                          Continuous memory across everything
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Side Chats (Focused Threads) */}
                  <div>
                    <div className="flex items-center justify-between px-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-45">
                        Side chats
                      </p>
                      <span className="text-[10px] opacity-50">{DEMO_SCENARIOS.length} active</span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {DEMO_SCENARIOS.map((sc) => {
                        const isSelected = sc.id === activeScenarioId
                        return (
                          <button
                            key={sc.id}
                            type="button"
                            onClick={() => setActiveScenarioId(sc.id)}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                              isSelected
                                ? warmTheme
                                  ? 'bg-stone-900 text-white font-semibold shadow-sm'
                                  : 'bg-rose-500 text-white font-semibold'
                                : warmTheme
                                  ? 'text-stone-600 hover:bg-stone-100'
                                  : 'text-slate-300 hover:bg-white/5'
                            }`}
                          >
                            <span className="truncate">{sc.sideChatTitle}</span>
                            <span
                              className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] ${
                                isSelected ? 'bg-white/20 text-white' : 'opacity-50'
                              }`}
                            >
                              {sc.category.split(' ')[0]}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Specialist Swarm Sub-Agents */}
                  <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/10">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-wider opacity-45">
                      Delegated Specialists
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {['@Forge • Code', '@Scout • Web', '@Sentinel • OS', '@Atlas • Plan'].map(
                        (sp) => (
                          <div
                            key={sp}
                            className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-medium ${
                              warmTheme
                                ? 'border-stone-200/70 bg-stone-50/80 text-stone-700'
                                : 'border-white/10 bg-white/[0.03] text-slate-300'
                            }`}
                          >
                            {sp}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Pill */}
                <div
                  className={`mt-5 flex items-center justify-between rounded-full border px-2 py-1.5 ${
                    warmTheme
                      ? 'border-stone-200 bg-[#f7f6f2]'
                      : 'border-white/10 bg-black/40'
                  }`}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full opacity-60">
                    <Sliders className="h-3.5 w-3.5" />
                  </span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full opacity-60">
                    <Search className="h-3.5 w-3.5" />
                  </span>
                  <Link
                    href={isSuperadmin ? '/chat' : '#waitlist'}
                    className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900"
                  >
                    <Plus className="h-3 w-3" /> New
                  </Link>
                </div>
              </div>

              {/* 2. CENTER CARD: Personal Agent Avatar + 3-Layer Status Pill + Artifacts + Approval Card */}
              <div
                className={`lg:col-span-6 flex flex-col justify-between rounded-[24px] border p-4 sm:p-5 ${
                  warmTheme
                    ? 'border-black/[0.06] bg-white/95 text-stone-900'
                    : 'border-white/10 bg-[#171b29] text-slate-100'
                }`}
              >
                {/* Top Header: Model Chip + Custom Agent Identity + Live Status Pill */}
                <div>
                  <div className="flex items-start justify-between border-b border-black/[0.06] dark:border-white/10 pb-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                        warmTheme
                          ? 'border-stone-200 bg-stone-50 text-stone-600'
                          : 'border-white/10 bg-white/5 text-slate-300'
                      }`}
                    >
                      <Cpu className="h-3 w-3 text-emerald-500" />
                      Qwen3.8-27B · Local
                    </span>

                    {/* Center Avatar + Live Status Pill */}
                    <div className="flex flex-col items-center text-center -mt-1">
                      <div className="relative">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${persona.aura} text-base font-extrabold text-stone-900 shadow-md ring-2 ring-white`}
                        >
                          {persona.initial}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-xs font-bold">{persona.name}</span>
                        <span className="text-[10px] opacity-55">• {persona.tagline}</span>
                      </div>

                      {/* LIVE STATUS PILL (Clickable 3-Layer Transparency) */}
                      <button
                        type="button"
                        onClick={() => setStatusExpanded((v) => !v)}
                        className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                          warmTheme
                            ? 'border-amber-300/80 bg-amber-50/90 text-amber-900 hover:bg-amber-100'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                        }`}
                        title="Click to inspect live agent steps & computer view"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                        <span>{activeScenario.statusPill}</span>
                        <ChevronRight
                          className={`h-3 w-3 transition-transform ${
                            statusExpanded ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        warmTheme
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      Autopilot
                    </span>
                  </div>

                  {/* Layer 2 & 3 of Status Pill: Expandable Live Computer / Step Drawer */}
                  {statusExpanded && (
                    <div
                      className={`mt-3 rounded-2xl border p-3 text-xs ${
                        warmTheme
                          ? 'border-amber-200 bg-amber-50/60 text-stone-800'
                          : 'border-amber-500/30 bg-black/40 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Monitor className="h-3.5 w-3.5 text-amber-600" />
                          {persona.name}&rsquo;s Shared Computer & Step Log
                        </span>
                        <span className="text-[10px] opacity-65">Layer 2 & 3 Transparency</span>
                      </div>
                      <div className="space-y-1 text-[11px] opacity-85 font-mono">
                        <div>✓ [00:01] Loaded personal memory & preferences</div>
                        <div>✓ [00:02] Executed tool verification in isolated sandbox</div>
                        <div>◉ [00:03] Compiled interactive Artifact & prepared approval gate</div>
                      </div>
                    </div>
                  )}

                  {/* Chat Stream */}
                  <div className="mt-4 space-y-3.5">
                    {/* User Message */}
                    <div className="flex justify-end">
                      <div
                        className={`max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-xs leading-relaxed ${
                          warmTheme
                            ? 'bg-[#141413] text-white'
                            : 'bg-rose-500 text-white'
                        }`}
                      >
                        {activeScenario.userPrompt}
                      </div>
                    </div>

                    {/* Mid-Run Steering Pill */}
                    <div className="flex justify-end">
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${
                          warmTheme
                            ? 'border-rose-200 bg-rose-50/80 text-rose-800'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                        }`}
                      >
                        <Sparkles className="h-3 w-3 text-rose-500" />
                        <span className="font-semibold">Steered mid-run:</span>
                        <span>&ldquo;{activeScenario.steerNote}&rdquo;</span>
                      </div>
                    </div>

                    {/* Agent Reply + Rich Artifact */}
                    <div className="space-y-2.5">
                      <p className="text-xs leading-relaxed opacity-90">
                        {activeScenario.agentReply}
                      </p>

                      {/* RICH ARTIFACT CARD */}
                      <div
                        className={`rounded-2xl border p-3.5 shadow-sm ${
                          warmTheme
                            ? 'border-stone-200/90 bg-[#faf9f5]'
                            : 'border-white/10 bg-black/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-300">
                            <Layers className="h-3 w-3" />
                            {activeScenario.artifact.badge}
                          </span>
                          <span className="text-[10px] opacity-55">Rich Artifact</span>
                        </div>
                        <h4 className="mt-1.5 text-sm font-bold">
                          {activeScenario.artifact.title}
                        </h4>
                        <p className="text-[11px] opacity-65">
                          {activeScenario.artifact.subtitle}
                        </p>

                        <div className="mt-3 space-y-2">
                          {activeScenario.artifact.items.map((item, i) => (
                            <div
                              key={i}
                              className={`flex items-start justify-between gap-2 rounded-xl border p-2.5 text-xs ${
                                warmTheme
                                  ? 'border-stone-200/70 bg-white'
                                  : 'border-white/10 bg-white/[0.03]'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <CheckCircle2
                                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                                    item.done ? 'text-emerald-500' : 'text-amber-500'
                                  }`}
                                />
                                <div>
                                  <div className="font-semibold text-[12px]">{item.label}</div>
                                  <div className="text-[11px] opacity-65">{item.meta}</div>
                                </div>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  item.done
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                }`}
                              >
                                {item.tag}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* DETERMINISTIC APPROVAL CARD (Allow once / Always allow / Deny) */}
                      <div
                        className={`rounded-2xl border p-3.5 transition ${
                          warmTheme
                            ? 'border-amber-300/80 bg-amber-50/70'
                            : 'border-amber-500/30 bg-amber-500/10'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Approval Gate · {activeScenario.approval.tool}
                          </span>
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                            {activeScenario.approval.risk}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold">
                          {activeScenario.approval.summary}
                        </p>
                        <p className="mt-0.5 text-[11px] opacity-70">
                          {activeScenario.approval.detail}
                        </p>

                        {currentDecision ? (
                          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-white/80 dark:bg-black/40 px-3 py-2 text-xs font-semibold">
                            <span>
                              {currentDecision === 'once' && '✓ Allowed once — action executed safely.'}
                              {currentDecision === 'always' && '✓ Always allowed — saved to your permission rules.'}
                              {currentDecision === 'deny' && '✕ Denied — action blocked and agent notified.'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setApprovalDecisions((prev) => {
                                  const next = { ...prev }
                                  delete next[activeScenario.id]
                                  return next
                                })
                              }
                              className="text-[11px] underline opacity-70 hover:opacity-100"
                            >
                              Reset
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setApprovalDecisions((prev) => ({ ...prev, [activeScenario.id]: 'once' }))
                              }
                              className="rounded-full bg-[#141413] px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
                            >
                              Allow once
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setApprovalDecisions((prev) => ({
                                  ...prev,
                                  [activeScenario.id]: 'always',
                                }))
                              }
                              className="rounded-full border border-black/15 bg-white px-3.5 py-1.5 text-[11px] font-semibold text-stone-800 transition hover:bg-stone-100"
                            >
                              Always allow
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setApprovalDecisions((prev) => ({ ...prev, [activeScenario.id]: 'deny' }))
                              }
                              className="rounded-full px-3 py-1.5 text-[11px] font-medium text-rose-600 hover:bg-rose-500/10"
                            >
                              Deny
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Floating Composer */}
                <div
                  className={`mt-4 flex items-center justify-between rounded-full border px-4 py-2 ${
                    warmTheme
                      ? 'border-stone-200 bg-[#f7f6f2]'
                      : 'border-white/10 bg-black/40'
                  }`}
                >
                  <span className="text-xs opacity-50 truncate">
                    Steer {persona.name} mid-run or ask for anything…
                  </span>
                  <Link
                    href={isSuperadmin ? '/chat' : '#waitlist'}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white"
                  >
                    <Send className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* 3. RIGHT CARD: Activity / Goals / Ideas / Memory / Safety Panel */}
              <div
                className={`lg:col-span-3 flex flex-col justify-between rounded-[24px] border p-4 ${
                  warmTheme
                    ? 'border-black/[0.06] bg-white/90 text-stone-800'
                    : 'border-white/10 bg-[#171b29] text-slate-100'
                }`}
              >
                <div>
                  {/* User Profile Header */}
                  <div className="flex flex-col items-center text-center pt-1">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-200 text-sm font-bold text-amber-900 ring-2 ring-amber-300/50">
                      E
                    </div>
                    <p className="mt-2 text-xs font-bold">Your Personal Space</p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Synced with {persona.name}
                    </p>
                  </div>

                  {/* Segmented 5-Icon Bar (Activity, Goals, Ideas, Memory, Safety) */}
                  <div
                    className={`mt-3.5 grid grid-cols-5 gap-1 rounded-full p-1 ${
                      warmTheme ? 'bg-[#f2f0ea]' : 'bg-black/40'
                    }`}
                  >
                    {[
                      { id: 'activity', icon: Activity, label: 'Activity' },
                      { id: 'goals', icon: Target, label: 'Goals' },
                      { id: 'ideas', icon: Lightbulb, label: 'Ideas' },
                      { id: 'memory', icon: History, label: 'Memory' },
                      { id: 'safety', icon: Fingerprint, label: 'Safety' },
                    ].map((t) => {
                      const Icon = t.icon
                      const active = rightTab === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setRightTab(t.id as typeof rightTab)}
                          title={t.label}
                          className={`flex h-8 items-center justify-center rounded-full transition ${
                            active
                              ? 'bg-white text-stone-900 shadow-sm'
                              : 'opacity-50 hover:opacity-90'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      )
                    })}
                  </div>

                  {/* Tab Content */}
                  <div className="mt-4">
                    {rightTab === 'goals' && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold">Active Goals & Milestones</span>
                          <span className="text-[11px] font-semibold text-emerald-600">
                            {demoProgress}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-white/10 mb-3">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all"
                            style={{ width: `${demoProgress}%` }}
                          />
                        </div>
                        <p className="text-[11px] opacity-60 mb-2">
                          Click any milestone below to toggle progress:
                        </p>
                        <div className="space-y-1.5">
                          {demoMilestones.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                setDemoMilestones((prev) =>
                                  prev.map((item) =>
                                    item.id === m.id ? { ...item, done: !item.done } : item,
                                  ),
                                )
                              }
                              className={`flex w-full items-start gap-2 rounded-xl border p-2 text-left text-[11px] transition ${
                                warmTheme
                                  ? 'border-stone-200/80 bg-[#faf9f5] hover:bg-white'
                                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                              }`}
                            >
                              {m.done ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 shrink-0 opacity-40 mt-0.5" />
                              )}
                              <span className={m.done ? 'line-through opacity-60' : 'font-medium'}>
                                {m.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {rightTab === 'ideas' && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold">Proactive Ideas for You</p>
                        {[
                          {
                            emoji: '🎯',
                            title: 'Prep your Monday 9 AM briefing',
                            desc: 'Summarize open PRs, calendar blocks, and priority emails.',
                            scenario: 'inbox-triage',
                          },
                          {
                            emoji: '🍽️',
                            title: 'Book Saturday patio dinner',
                            desc: 'Hold a table for 4 and send calendar invites.',
                            scenario: 'life-admin',
                          },
                          {
                            emoji: '⚡',
                            title: 'Run v2.0 monorepo audit',
                            desc: 'Delegate to @Forge & @Sentinel for full typecheck.',
                            scenario: 'code-operator',
                          },
                        ].map((idea, i) => (
                          <div
                            key={i}
                            className={`rounded-xl border p-2.5 text-xs ${
                              warmTheme
                                ? 'border-stone-200/80 bg-[#faf9f5]'
                                : 'border-white/10 bg-white/[0.03]'
                            }`}
                          >
                            <div className="font-semibold">
                              {idea.emoji} {idea.title}
                            </div>
                            <p className="mt-0.5 text-[11px] opacity-65">{idea.desc}</p>
                            <button
                              type="button"
                              onClick={() => setActiveScenarioId(idea.scenario)}
                              className="mt-2 rounded-full bg-[#141413] px-3 py-1 text-[10px] font-semibold text-white dark:bg-white dark:text-slate-900"
                            >
                              Start
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {rightTab === 'activity' && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold">Today&rsquo;s Background Work</p>
                        {[
                          { time: '2m ago', label: 'Verified Saturday calendar & patio tables' },
                          { time: '18m ago', label: 'Flagged $64/mo in unused subscriptions' },
                          { time: '1h ago', label: '@Forge completed workspace typecheck (0 errors)' },
                        ].map((act, i) => (
                          <div
                            key={i}
                            className={`rounded-xl border p-2.5 text-[11px] ${
                              warmTheme
                                ? 'border-stone-200/80 bg-[#faf9f5]'
                                : 'border-white/10 bg-white/[0.03]'
                            }`}
                          >
                            <div className="font-medium">{act.label}</div>
                            <div className="opacity-50 text-[10px] mt-0.5">{act.time}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {rightTab === 'memory' && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold">Remembered Facts</p>
                        {[
                          { k: 'Schedule', v: 'Keep Tuesday runs before 9:00 AM standup' },
                          { k: 'Dining', v: 'Loves handmade pasta & heated outdoor patios' },
                          { k: 'Stack', v: 'Next.js + NestJS + Local Ollama (Qwen3.8-27B)' },
                        ].map((f, i) => (
                          <div
                            key={i}
                            className={`rounded-xl border p-2.5 text-[11px] ${
                              warmTheme
                                ? 'border-stone-200/80 bg-[#faf9f5]'
                                : 'border-white/10 bg-white/[0.03]'
                            }`}
                          >
                            <span className="font-bold">{f.k}:</span> {f.v}
                          </div>
                        ))}
                      </div>
                    )}

                    {rightTab === 'safety' && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold">Deterministic Safety & Privacy</p>
                        <div
                          className={`rounded-xl border p-2.5 text-[11px] space-y-1.5 ${
                            warmTheme
                              ? 'border-emerald-200 bg-emerald-50/60'
                              : 'border-emerald-500/30 bg-emerald-500/10'
                          }`}
                        >
                          <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                            ✓ 100% Local PostgreSQL & Ollama Brain
                          </div>
                          <div className="opacity-80">
                            Sensitive tools pause deterministically for your explicit approval.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-white/10 text-center">
                  <Link
                    href={isSuperadmin ? '/chat' : '#waitlist'}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    <span>Open full OpenAgents workspace</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW WE DESIGNED IT: THE 6 PILLARS OF OPENAGENTS ── */}
        <section id="how-it-works" className="mt-24 scroll-mt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-500">
              OpenAgents Architecture
            </span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight">
              Designed Around the Way You Actually Live and Work
            </h2>
            <p className={`mt-3 text-sm sm:text-base ${warmTheme ? 'text-stone-600' : 'text-slate-400'}`}>
              Every detail of OpenAgents is crafted to feel warm, personal, and effortlessly capable—combining consumer simplicity with autonomous power.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Sparkles,
                badge: '01 • Personal Identity',
                title: 'Name Your Agent & Shape Its Personality',
                desc: 'Give your agent a name like Veda, Nova, or Atlas, choose its aura, and tailor how it communicates. Its core directive: "Your purpose is to make your user\'s life better."',
              },
              {
                icon: MessageSquare,
                badge: '02 • Main Chat + Side Chats',
                title: 'One Lifelong Thread + Focused Side Chats',
                desc: 'Talk to your agent in one continuous Main Chat that remembers everything, or spin up Side Chats for specific trips, codebases, or goals—with real-time mid-run steering.',
              },
              {
                icon: Monitor,
                badge: '03 • 3-Layer Status Pill',
                title: 'See What It’s Doing Without the Clutter',
                desc: 'A calm Status Pill sits right beneath your agent’s avatar showing live progress. Click it anytime to inspect step-by-step tool logs or take over its shared browser and terminal.',
              },
              {
                icon: Lightbulb,
                badge: '04 • Proactive Ideas & Goals',
                title: 'Never Stare at a Blank Prompt Again',
                desc: 'Your agent surfaces tailored Ideas based on your active Goals, recent conversations, and calendar—turning big ambitions into checkable milestones.',
              },
              {
                icon: FileText,
                badge: '05 • Rich Interactive Artifacts',
                title: 'Visual Cards Instead of Walls of Text',
                desc: 'Instead of dumping 2,000 words of raw markdown, OpenAgents crafts clean itineraries, budget tables, and release checklists you can act on immediately.',
              },
              {
                icon: ShieldCheck,
                badge: '06 • Deterministic Control',
                title: 'Allow Once, Always Allow, or Deny',
                desc: 'Whenever an action touches external systems, shell commands, or money, a deterministic Approval Card pauses execution until you tap Allow.',
              },
            ].map((item, idx) => {
              const Icon = item.icon
              return (
                <div
                  key={idx}
                  className={`rounded-[28px] border p-6 transition hover:-translate-y-0.5 ${
                    warmTheme
                      ? 'border-black/[0.07] bg-white/85 shadow-sm hover:shadow-md'
                      : 'border-white/10 bg-white/[0.03] hover:border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/15 to-amber-500/15 text-rose-500">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-semibold opacity-50">{item.badge}</span>
                  </div>
                  <h3 className="mt-4 text-base font-bold">{item.title}</h3>
                  <p
                    className={`mt-2 text-xs leading-relaxed ${
                      warmTheme ? 'text-stone-600' : 'text-slate-400'
                    }`}
                  >
                    {item.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── ARTIFACTS & PRIVATE LOCAL ARCHITECTURE COMPARISON ── */}
        <section id="artifacts-and-safety" className="mt-24 scroll-mt-20">
          <div
            className={`rounded-[32px] border p-8 sm:p-10 ${
              warmTheme
                ? 'border-black/[0.07] bg-white/90 shadow-lg shadow-stone-900/5'
                : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-500">
                  Cloud Beauty + Local Sovereignty
                </span>
                <h3 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Personal AI That Runs 100% on Your Own Machine
                </h3>
                <p
                  className={`mt-3 text-xs sm:text-sm leading-relaxed ${
                    warmTheme ? 'text-stone-600' : 'text-slate-400'
                  }`}
                >
                  OpenAgents combines human-centric design—Main Chat, Side Chats, Status Pill, Goals, Ideas, and Rich Artifacts—with your local Ollama models, Windows Shell hands, and 4 specialist agents.
                </p>
                <div className="mt-6 space-y-2.5 text-xs">
                  {[
                    'Hybrid Brain: Local Ollama (Qwen, DeepSeek, Phi-4) + 15 Cloud Providers',
                    '4 Built-in Specialists: @Forge (Code), @Scout (Web), @Sentinel (OS), @Atlas (Plan)',
                    'Zero Cloud Lock-in: PostgreSQL memory & credentials stay on your PC',
                  ].map((pt, i) => (
                    <div key={i} className="flex items-center gap-2 font-medium">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  className={`rounded-2xl border p-5 ${
                    warmTheme ? 'border-stone-200 bg-[#f7f6f2]' : 'border-white/10 bg-black/40'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-500">
                    <Compass className="h-4 w-4" /> Everyday Life & Admin
                  </div>
                  <ul className="mt-3 space-y-2 text-xs opacity-80">
                    <li>• Triages unread emails & flags recurring bills</li>
                    <li>• Plans travel itineraries & compares flights</li>
                    <li>• Tracks fitness, reading & personal milestones</li>
                    <li>• Remembers family preferences & important dates</li>
                  </ul>
                </div>

                <div
                  className={`rounded-2xl border p-5 ${
                    warmTheme ? 'border-stone-200 bg-[#f7f6f2]' : 'border-white/10 bg-black/40'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Terminal className="h-4 w-4" /> Engineering & Deep Work
                  </div>
                  <ul className="mt-3 space-y-2 text-xs opacity-80">
                    <li>• Writes code, runs tests & inspects local repos</li>
                    <li>• Executes safe Windows PowerShell & terminal tasks</li>
                    <li>• Orchestrates 4 specialist agents in parallel</li>
                    <li>• Connects to filesystem, GitHub & MCP servers</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer
        className={`relative z-10 border-t py-8 text-xs ${
          warmTheme
            ? 'border-black/[0.06] bg-[#efede7]/60 text-stone-500'
            : 'border-white/10 bg-[#050811] text-slate-400'
        }`}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 font-bold text-white text-[10px]">
              OA
            </div>
            <span className={`font-semibold ${warmTheme ? 'text-stone-900' : 'text-white'}`}>
              OpenAgents
            </span>
            <span>• Your Personal AI Agent</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#openagents-workspace" className="hover:underline">
              Live Preview
            </a>
            <a href="#how-it-works" className="hover:underline">
              Design Philosophy
            </a>
            {isSuperadmin ? (
              <>
                <Link href="/chat" className="font-semibold text-rose-500 hover:underline">
                  Open Workspace (/chat)
                </Link>
                <Link href="/admin" className="hover:underline">
                  Admin
                </Link>
              </>
            ) : (
              <Link href="/login" className="font-semibold text-rose-500 hover:underline">
                Admin Sign In
              </Link>
            )}
            <a
              href="https://x.com/openagentsus"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              @openagentsus
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
