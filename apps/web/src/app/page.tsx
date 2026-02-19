'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Cloud, Laptop2, Sparkles } from 'lucide-react'
import styles from './landing.module.css'

type Platform = 'windows' | 'macos' | 'ubuntu'

interface QuickStartConfig {
  label: string
  shellPrefix: string
  localCommands: string[]
  runtimeNote: string
}

const QUICK_START: Record<Platform, QuickStartConfig> = {
  windows: {
    label: 'Windows',
    shellPrefix: 'PS>',
    localCommands: [
      'git clone https://github.com/openagents/openagents.git',
      'cd openagents',
      'pnpm install',
      'copy apps\\api\\.env.example apps\\api\\.env',
      'pnpm --filter @openagents/api db:migrate',
      'pnpm dev',
    ],
    runtimeNote: 'Runs with PowerShell and local SQLite by default.',
  },
  macos: {
    label: 'macOS',
    shellPrefix: '$',
    localCommands: [
      'git clone https://github.com/openagents/openagents.git',
      'cd openagents',
      'pnpm install',
      'cp apps/api/.env.example apps/api/.env',
      'pnpm --filter @openagents/api db:migrate',
      'pnpm dev',
    ],
    runtimeNote: 'Works with zsh/bash and local SQLite by default.',
  },
  ubuntu: {
    label: 'Ubuntu',
    shellPrefix: '$',
    localCommands: [
      'git clone https://github.com/openagents/openagents.git',
      'cd openagents',
      'pnpm install',
      'cp apps/api/.env.example apps/api/.env',
      'pnpm --filter @openagents/api db:migrate',
      'pnpm dev',
    ],
    runtimeNote: 'Best on Ubuntu 22.04+ with Node.js 20+.',
  },
}

const CLOUD_STEPS = [
  'Sign in and activate OpenAgents Cloud Pro.',
  'Choose your workspace region and team size.',
  'Connect providers or use local Ollama fallback.',
  'Deploy your first agent workflow in minutes.',
]

const FEATURE_CARDS = [
  {
    title: 'Local-First Runtime',
    detail: 'Run on your machine with full data control and instant debugging.',
  },
  {
    title: 'Gateway Chat Control',
    detail: 'Operate sessions, approvals, and actions from one dashboard.',
  },
  {
    title: 'Cloud Sync',
    detail: 'Scale to hosted workspaces when you need shared uptime.',
  },
  {
    title: 'Tool Integrations',
    detail: 'Wire email, calendar, web fetch, notes, and custom actions.',
  },
]

export default function RootPage() {
  const [platform, setPlatform] = useState<Platform>('windows')
  const activeQuickStart = useMemo(() => QUICK_START[platform], [platform])

  return (
    <main className={styles.page}>
      <div className={styles.starfield} aria-hidden />
      <div className={styles.glowLeft} aria-hidden />
      <div className={styles.glowRight} aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-20 pt-6 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/55 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-400 text-[11px] font-extrabold text-white shadow-glow-red">
              OA
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">OpenAgents</p>
              <p className="text-xs text-slate-400">Local + Cloud Agent Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:bg-white/10"
            >
              Login
            </Link>
            <Link
              href="/chat"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-4 text-sm font-semibold text-white shadow-glow-red transition hover:brightness-110"
            >
              Launch Dashboard
              <ArrowRight size={15} />
            </Link>
          </div>
        </header>

        <section className="mt-10 grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/35 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">
              <Sparkles size={13} />
              OpenAgents Cloud + Local Runtime
            </div>

            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Build AI agents that run
              <span className="bg-gradient-to-r from-rose-300 to-orange-200 bg-clip-text text-transparent"> where you want.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              OpenAgents gives you a modern gateway dashboard, local-first execution, and a hosted Cloud option when
              you need shared uptime. Start on your laptop in minutes, then scale your team with one click.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="#quick-start"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Quick Start
                <ArrowRight size={15} />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
              >
                Sign In to Continue
              </Link>
            </div>
          </div>

          <div className={styles.scene} aria-hidden>
            <div className={styles.orbitRing} />
            <div className={styles.sphere} />
            <div className={styles.objectCardPrimary}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Gateway Status</p>
              <p className="mt-2 text-lg font-semibold text-white">Live Sessions + Approvals</p>
              <p className="mt-3 text-sm text-slate-300">Monitor active runs, route tool calls, and take action in real time.</p>
            </div>
            <div className={styles.objectCardSecondary}>
              <p className="text-xs uppercase tracking-[0.14em] text-rose-200">Cloud Pro</p>
              <p className="mt-2 text-lg font-semibold text-white">$9.99/month</p>
              <p className="mt-3 text-sm text-slate-300">Hosted workspace, team access, and priority updates.</p>
            </div>
            <div className={styles.objectCardTertiary}>
              <Laptop2 size={15} className="text-cyan-200" />
              <p className="text-sm text-slate-200">Local mode stays available for development and offline work.</p>
            </div>
          </div>
        </section>

        <section id="quick-start" className="mt-14 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <article className={styles.panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-white">Quick Start</h2>
                <p className="mt-1 text-sm text-slate-300">Run OpenAgents locally on Windows, macOS, or Ubuntu.</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                Local install guide
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(Object.keys(QUICK_START) as Platform[]).map((key) => {
                const active = key === platform
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPlatform(key)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? 'border border-rose-300/50 bg-rose-500/20 text-rose-100'
                        : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {QUICK_START[key].label}
                  </button>
                )
              })}
            </div>

            <div className={styles.commandShell}>
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">{activeQuickStart.label}</p>
                <p className="text-xs text-slate-400">{activeQuickStart.runtimeNote}</p>
              </div>
              <pre className="space-y-2 overflow-x-auto text-sm text-slate-100">
                {activeQuickStart.localCommands.map((line) => (
                  <div key={line} className="whitespace-pre">
                    <span className="mr-2 text-cyan-300">{activeQuickStart.shellPrefix}</span>
                    <code>{line}</code>
                  </div>
                ))}
              </pre>
            </div>
          </article>

          <article className={styles.panel}>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
              <Cloud size={13} />
              OpenAgents Cloud
            </div>

            <h3 className="mt-4 text-2xl font-semibold text-white">Pro Plan</h3>
            <p className="mt-1 text-slate-300">
              <span className="text-4xl font-semibold text-white">$9.99</span>
              <span className="ml-1 text-sm">per month</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Use our hosted infrastructure for always-on agents, shared workspaces, and managed operations.
            </p>

            <ul className="mt-5 space-y-3">
              {CLOUD_STEPS.map((step) => (
                <li key={step} className="flex items-start gap-2 text-sm text-slate-200">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/login?plan=cloud-pro"
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Start Cloud Pro
              <ArrowRight size={15} />
            </Link>
          </article>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_CARDS.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-white/10 bg-slate-950/55 p-5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-rose-300/35 hover:bg-slate-950/70"
            >
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-200">{item.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.detail}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
