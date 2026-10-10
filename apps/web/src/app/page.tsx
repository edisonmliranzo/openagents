'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  ShieldCheck,
  Bot,
  Zap,
  Lock,
  BarChart3,
  Cpu,
  Globe,
  Sparkles,
  CheckCircle2,
  Terminal,
  ExternalLink,
  ChevronRight,
  Wrench,
  Layers,
  HeartHandshake,
  Check,
  Clock,
  Send,
  Eye,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

export default function ComingSoonPage() {
  const user = useAuthStore((state) => state.user)
  const isSuperadmin =
    user?.email?.trim().toLowerCase() === 'edison0220@gmail.com' ||
    user?.role?.trim().toLowerCase() === 'owner'

  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [waitlistCount, setWaitlistCount] = useState(1428)

  // Countdown timer state: 30 days
  const [timeLeft, setTimeLeft] = useState({
    days: 30,
    hours: 0,
    minutes: 0,
    seconds: 0,
  })

  useEffect(() => {
    // Get existing waitlist count
    try {
      const stored = localStorage.getItem('openagents_waitlist')
      if (stored) {
        const parsed = JSON.parse(stored)
        setWaitlistCount(1428 + parsed.length)
      }
    } catch {
      // ignore
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 }
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: 59, seconds: 59 }
        } else if (prev.hours > 0) {
          return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 }
        } else if (prev.days > 0) {
          return { ...prev, days: prev.days - 1, hours: 23, minutes: 59, seconds: 59 }
        }
        return prev
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const handleJoinWaitlist = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes('@')) return

    setIsSubmitting(true)
    setTimeout(() => {
      try {
        const existing = JSON.parse(localStorage.getItem('openagents_waitlist') || '[]')
        if (!existing.some((item: any) => item.email === email)) {
          existing.unshift({
            email,
            timestamp: new Date().toISOString(),
          })
          localStorage.setItem('openagents_waitlist', JSON.stringify(existing))
          window.dispatchEvent(new Event('waitlist_updated'))
        }
      } catch (err) {
        console.error(err)
      }
      setIsSubmitting(false)
      setSubmitted(true)
      setWaitlistCount((prev) => prev + 1)
    }, 500)
  }

  return (
    <div className="relative min-h-screen bg-slate-50/70 text-slate-900 font-sans selection:bg-rose-100 selection:text-rose-900">
      {/* Subtle Ambient Background Gradients for Light Mode */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-rose-200/40 via-orange-100/30 to-transparent blur-3xl" />
        <div className="absolute top-1/4 -right-40 h-[700px] w-[700px] rounded-full bg-gradient-to-bl from-indigo-200/35 via-blue-100/25 to-transparent blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-cyan-100/40 to-transparent blur-3xl" />
      </div>

      {/* Top Header Navbar */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          {/* Logo & Version */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 via-rose-600 to-orange-400 font-black text-white shadow-md shadow-rose-500/20">
              OA
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900">OpenAgents</span>
                <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-600 border border-rose-200">
                  v2.0 Coming Soon
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Self-Hosted Autonomous AI Agent Platform</p>
            </div>
          </div>

          {/* Navigation & Action Links */}
          <div className="flex items-center gap-2.5">
            {isSuperadmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 shadow-xs transition hover:bg-rose-100"
              >
                <BarChart3 className="h-3.5 w-3.5 text-rose-500" />
                <span>Admin Analytics</span>
              </Link>
            )}

            <a
              href="https://x.com/openagentsus"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
            >
              <svg className="h-3.5 w-3.5 fill-current text-slate-900" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>Follow on X</span>
            </a>

            {isSuperadmin ? (
              <Link
                href="/chat"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <span>Workspace</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <a
                href="#waitlist"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <span>Request Access</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:px-8">
        {/* Eyebrow Announcement Pill */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/80 bg-white/90 px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-xs backdrop-blur-xs">
            <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-rose-600 font-bold uppercase tracking-wider text-[11px]">Private Preview</span>
            <span className="text-slate-300">•</span>
            <span>Next-Gen Autonomous Agent Orchestration</span>
          </div>
        </div>

        {/* Main Hero Headline */}
        <div className="mt-8 text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl sm:leading-none">
            The Autonomous AI Platform{' '}
            <span className="bg-gradient-to-r from-rose-600 via-rose-500 to-orange-500 bg-clip-text text-transparent">
              You Truly Own.
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg leading-relaxed text-slate-600">
            OpenAgents 2.0 brings persistent memory, multi-agent collaboration swarms, native Model Context Protocol (MCP) integrations, and human-in-the-loop approvals directly to your own hardware. Zero cloud telemetry. Complete data sovereignty.
          </p>
        </div>

        {/* Interactive Countdown Cards */}
        <div className="mt-8 flex justify-center">
          <div className="grid grid-cols-4 gap-2.5 sm:gap-4 max-w-md w-full">
            {[
              { label: 'Days', value: timeLeft.days },
              { label: 'Hours', value: timeLeft.hours },
              { label: 'Minutes', value: timeLeft.minutes },
              { label: 'Seconds', value: timeLeft.seconds },
            ].map((unit, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white/90 p-3 sm:p-4 shadow-xs backdrop-blur-xs"
              >
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {String(unit.value).padStart(2, '0')}
                </span>
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
                  {unit.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Waitlist Signup Form */}
        <div id="waitlist" className="mt-8 max-w-lg mx-auto scroll-mt-24">
          {!submitted ? (
            <form onSubmit={handleJoinWaitlist} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email for early access..."
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs focus:border-rose-500 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 transition"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-rose-500/20 transition hover:brightness-110 disabled:opacity-70 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Reserving spot...</span>
                ) : (
                  <>
                    <span>Get Early Access</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-center shadow-xs backdrop-blur-xs">
              <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>You are on the VIP Early Access List!</span>
              </div>
              <p className="mt-1 text-xs text-emerald-700">
                We have reserved your invitation spot. Your invite will be prioritized for v2.0 deployment.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span>
              <strong className="text-slate-800">{waitlistCount.toLocaleString()}</strong> engineers & creators already on waitlist
            </span>
          </div>
        </div>

        {/* Hero Visual / Platform Showcase Image */}
        <div className="mt-14 relative max-w-5xl mx-auto">
          {/* Decorative Halo Behind Image */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-rose-400/20 via-indigo-400/20 to-orange-400/20 blur-xl opacity-70" />

          <div className="relative rounded-3xl border border-slate-200/90 bg-white p-2.5 sm:p-4 shadow-xl shadow-slate-200/50 backdrop-blur-md">
            {/* Top Bar for Mockup Frame */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-rose-400/70" />
                <div className="h-3 w-3 rounded-full bg-amber-400/70" />
                <div className="h-3 w-3 rounded-full bg-emerald-400/70" />
                <span className="ml-2 font-mono text-[11px] text-slate-400">openagents.local:3000 • Autonomous Agent Canvas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Swarms Live
                </span>
              </div>
            </div>

            {/* Generated High-Resolution Hero Visual */}
            <div className="relative aspect-video min-h-[380px] sm:min-h-[500px] w-full overflow-hidden rounded-2xl bg-slate-100 border border-slate-100 shadow-inner">
              <img
                src="/coming-soon-hero.jpg"
                alt="OpenAgents 2.0 Autonomous AI Platform Architecture"
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]"
              />

              {/* Interactive Floating Pill Badges */}
              <div className="absolute bottom-4 left-4 hidden sm:flex items-center gap-2 rounded-xl border border-white/80 bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-md backdrop-blur-md">
                <Bot className="h-4 w-4 text-rose-500" />
                <span>Multi-Agent Swarm Orchestration</span>
              </div>

              <div className="absolute bottom-4 right-4 hidden sm:flex items-center gap-2 rounded-xl border border-white/80 bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-md backdrop-blur-md">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>100% Self-Hosted & Air-Gapped</span>
              </div>
            </div>
          </div>
        </div>

        {/* 6 Key Pillars Grid */}
        <div className="mt-24">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Engineered For Complete Capability & Privacy
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Unlike cloud-locked assistants, OpenAgents gives you full custody of your agent execution graph, files, and secrets.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Bot,
                title: 'Multi-Agent Collaboration',
                desc: 'Coordinate researcher, coder, analyst, and executive agents with automatic task delegation and dynamic work allocation.',
                tag: 'Native MCP Protocol'
              },
              {
                icon: ShieldCheck,
                title: 'Durable Tasks & Approval Gates',
                desc: 'Resilient plan-execute-verify loops with human approval gates before executing side-effecting shell commands or emails.',
                tag: 'Safety Guardrails'
              },
              {
                icon: Cpu,
                title: 'Zero-Cost Local LLMs',
                desc: 'Run completely offline with Ollama (Llama 3, DeepSeek, Mistral) or connect Claude 3.7, OpenAI, and Gemini with BYOK.',
                tag: 'Provider Freedom'
              },
              {
                icon: Wrench,
                title: '50+ Built-in Tools',
                desc: 'Playwright browser automation, PDF text extraction, Monaco code editor, terminal access, and custom API webhooks.',
                tag: 'Extensible Plugins'
              },
              {
                icon: Lock,
                title: 'Total Data Sovereignty',
                desc: 'All memories, vector embeddings, and conversation histories are stored in your local PostgreSQL database and disk.',
                tag: 'Air-Gapped Ready'
              },
              {
                icon: Sparkles,
                title: 'Continuous Self-Improvement',
                desc: 'Agents dynamically synthesize reusable skills from your frequent workflows and adapt to your personal work style.',
                tag: 'Adaptive Memory'
              },
            ].map((pillar, idx) => (
              <div
                key={idx}
                className="group relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-800 transition group-hover:bg-rose-50 group-hover:text-rose-600">
                  <pillar.icon className="h-5 w-5" />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{pillar.title}</h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{pillar.desc}</p>
                <span className="mt-4 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {pillar.tag}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Release Timeline / Roadmap */}
        <div className="mt-24 rounded-3xl border border-slate-200/90 bg-white p-8 shadow-xs">
          <div className="max-w-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600">Roadmap to Launch</span>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              The Path to OpenAgents 2.0
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Here is what has been built and what is rolling out to early waitlist users:
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                phase: 'Phase 1 • Complete',
                title: 'Core Engine Hardening',
                desc: 'NestJS orchestrator, BullMQ queue, Prisma PostgreSQL sync, and Model Context Protocol SDK.',
                status: 'Done',
                statusColor: 'bg-emerald-100 text-emerald-800'
              },
              {
                phase: 'Phase 2 • Active Beta',
                title: 'Durable Tasks & Swarms',
                desc: 'Long-running multi-agent execution, human approval gates, and Playwright computer-use.',
                status: 'In Testing',
                statusColor: 'bg-rose-100 text-rose-800'
              },
              {
                phase: 'Phase 3 • Next',
                title: 'Self-Improving Memory',
                desc: 'Skill auto-synthesis from prompt histories, vector recall, and cross-agent communication.',
                status: 'Next Week',
                statusColor: 'bg-amber-100 text-amber-800'
              },
              {
                phase: 'Phase 4 • Launch',
                title: 'Public v2.0 General Release',
                desc: 'One-click binary installers, cross-platform mobile sync, and private cluster federation.',
                status: 'Q4 2026',
                statusColor: 'bg-indigo-100 text-indigo-800'
              },
            ].map((step, i) => (
              <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
                <span className="text-[11px] font-semibold text-slate-400">{step.phase}</span>
                <h4 className="mt-1 font-bold text-slate-900 text-sm">{step.title}</h4>
                <p className="mt-2 text-xs text-slate-600 leading-normal">{step.desc}</p>
                <div className="mt-4">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${step.statusColor}`}>
                    {step.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Bar Before Footer */}
        <div className="mt-20 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 sm:p-12 text-white shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Want to test the platform right now?
              </h3>
              <p className="mt-2 text-sm text-slate-300 max-w-xl">
                OpenAgents is running live locally. Sign into the workspace or inspect live telemetry on the admin dashboard.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isSuperadmin ? (
                <>
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-bold text-slate-900 shadow-md transition hover:bg-slate-100"
                  >
                    <BarChart3 className="h-4 w-4 text-rose-600" />
                    <span>Admin Analytics</span>
                  </Link>
                  <Link
                    href="/chat"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-xs font-bold text-white transition hover:bg-white/20"
                  >
                    <span>Launch Workspace</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <a
                  href="#waitlist"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-6 py-3.5 text-xs font-bold text-white shadow-md shadow-rose-500/20 transition hover:brightness-110"
                >
                  <span>Request Early Access</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Clean Light Footer */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-orange-400 font-bold text-white text-[10px]">
              OA
            </div>
            <span className="font-semibold text-slate-800">OpenAgents Platform</span>
            <span>• Open Source MIT License</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#waitlist" className="hover:text-rose-600 transition">
              Join Waitlist
            </a>
            {isSuperadmin && (
              <Link href="/admin" className="hover:text-rose-600 transition">
                Admin Portal
              </Link>
            )}
            <a
              href="https://x.com/openagentsus"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:text-slate-900 transition"
            >
              <svg className="h-3.5 w-3.5 fill-current text-slate-600" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>Follow on X</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
