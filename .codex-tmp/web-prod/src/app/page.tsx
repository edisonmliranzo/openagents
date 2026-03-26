'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Files,
  Globe,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'
import {
  OPENAGENTS_LOCAL_QUICK_START,
  OPENAGENTS_REPO_WEB_URL,
  type OpenAgentsLocalQuickStartPlatform,
} from '@openagents/shared'
import styles from './landing.module.css'
import { useAuthStore } from '@/stores/auth'

type Platform = OpenAgentsLocalQuickStartPlatform

interface FeatureCard {
  title: string
  detail: string
  icon: LucideIcon
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    title: 'Research + Sources',
    detail: 'Search the web, read pages, and turn findings into grounded answers and summaries.',
    icon: Globe,
  },
  {
    title: 'Plans + Execution',
    detail: 'Break goals into steps, run tools, and keep approvals in the loop for risky actions.',
    icon: Sparkles,
  },
  {
    title: 'Files + Deliverables',
    detail: 'Create notes, reports, drafts, and simple web outputs instead of stopping at chat.',
    icon: Files,
  },
  {
    title: 'Tools + Connectors',
    detail: 'Extend the assistant with workflows, MCP tools, Gmail, Calendar, and internal APIs.',
    icon: Wrench,
  },
]

const ASSISTANT_EXAMPLES = [
  'Research the best CRM options for a 10-person sales team and write a recommendation memo.',
  "Summarize today's AI news and draft a LinkedIn post with source links.",
  'Plan my week from my tasks and calendar constraints.',
  'Draft a reply to this email thread and save it as a draft.',
  'Create a landing page for my product idea.',
]

const SELF_HOST_BENEFITS = [
  'Free and self-hosted by default',
  'Bring your own model and API keys',
  'Approvals for risky actions',
  'Memory, history, workflows, and connectors',
]

const DELIVERABLES = [
  'Research brief',
  'Recommendation memo',
  'Email draft',
  'Task plan',
  'Markdown notes',
  'Simple HTML page',
]

export default function RootPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [platform, setPlatform] = useState<Platform>('windows')
  const activeQuickStart = useMemo(() => OPENAGENTS_LOCAL_QUICK_START[platform], [platform])
  const appHref = accessToken ? '/chat' : '/login'
  const appLabel = accessToken ? 'Open Assistant' : 'Login'

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
              <p className="text-xs text-slate-400">Free Self-Hosted Personal AI Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={OPENAGENTS_REPO_WEB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-10 items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
            >
              GitHub
            </a>
            <Link
              href={appHref}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:bg-white/10"
            >
              {appLabel}
              <ArrowRight size={15} />
            </Link>
          </div>
        </header>

        <section className="mt-10 grid items-center gap-10 lg:grid-cols-[1.12fr_0.88fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/35 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">
              <ShieldCheck size={13} />
              Free + Self-Hosted + Tool-Enabled
            </div>

            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Your personal AI assistant
              <span className="bg-gradient-to-r from-rose-300 to-orange-200 bg-clip-text text-transparent">
                {' '}
                for any task.
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Self-host OpenAgents to research, plan, write, browse, create files, and take
              action with approvals, memory, workflows, and connectors.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="#quick-start"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-5 text-sm font-semibold text-white shadow-glow-red transition hover:brightness-110"
              >
                Self-Host Free
                <ArrowRight size={15} />
              </Link>
              <Link
                href={appHref}
                className="inline-flex h-11 items-center rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
              >
                {appLabel}
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {SELF_HOST_BENEFITS.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-slate-200 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                    <span>{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.scene} aria-hidden>
            <div className={styles.orbitRing} />
            <div className={styles.sphere} />

            <div className={styles.objectCardPrimary}>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Task Flow</p>
              <p className="mt-2 text-lg font-semibold text-white">
                Goal {'->'} plan {'->'} tool calls
              </p>
              <p className="mt-3 text-sm text-slate-300">
                Give the assistant a goal and let it break the work into steps before it acts.
              </p>
            </div>

            <div className={styles.objectCardSecondary}>
              <p className="text-xs uppercase tracking-[0.14em] text-rose-200">Approvals</p>
              <p className="mt-2 text-lg font-semibold text-white">Human-in-the-loop</p>
              <p className="mt-3 text-sm text-slate-300">
                Review risky actions before they run and keep an audit trail of what happened.
              </p>
            </div>

            <div className={styles.objectCardTertiary}>
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-200">Deliverable</p>
              <p className="mt-2 text-sm text-slate-200">
                Reports, drafts, notes, plans, and simple web pages.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <article className={styles.panel}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-white">Example prompts</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Start with one goal. OpenAgents handles the research, planning, and output.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                One assistant, many tasks
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {ASSISTANT_EXAMPLES.map((example, index) => (
                <div
                  key={example}
                  className="rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-200"
                >
                  <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-cyan-100">
                    {index + 1}
                  </span>
                  {example}
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <h2 className="text-2xl font-semibold text-white">What you get</h2>
            <ul className="mt-5 space-y-3">
              {[
                'Chat + execution in one workspace',
                'Web research with citations',
                'Files, notes, workflows, and connectors',
                'Memory, history, and repairable runs',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-200">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section id="quick-start" className="mt-14 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <article className={styles.panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-white">Quick start</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Run OpenAgents locally on Windows, macOS, or Ubuntu.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                Free self-hosted install
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(Object.keys(OPENAGENTS_LOCAL_QUICK_START) as Platform[]).map((key) => {
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
                    {OPENAGENTS_LOCAL_QUICK_START[key].label}
                  </button>
                )
              })}
            </div>

            <div className={styles.commandShell}>
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                  {activeQuickStart.label}
                </p>
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

              <p className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
                Access example: {activeQuickStart.accessExample}
              </p>
            </div>
          </article>

          <article className={styles.panel}>
            <h3 className="text-2xl font-semibold text-white">Run your own assistant</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Bring your own keys, run it on your machine or VPS, and keep the stack under your
              control.
            </p>

            <ul className="mt-5 space-y-3">
              {[
                'Research, plan, write, and take action',
                'Use approvals before risky tool calls',
                'Extend with custom tools and MCP servers',
                'Keep your data, memory, and workflows in your own environment',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-200">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <a
              href={`${OPENAGENTS_REPO_WEB_URL}/blob/main/README.md`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-400/10 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Read Self-Host Docs
              <ArrowRight size={15} />
            </a>
          </article>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_CARDS.map((item) => {
            const Icon = item.icon
            return (
              <article
                key={item.title}
                className="rounded-2xl border border-white/10 bg-slate-950/55 p-5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-rose-300/35 hover:bg-slate-950/70"
              >
                <Icon size={16} className="text-cyan-200" />
                <h3 className="mt-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-200">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.detail}</p>
              </article>
            )
          })}
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className={styles.panel}>
            <h3 className="text-xl font-semibold text-white">Deliverables</h3>
            <p className="mt-1 text-sm text-slate-300">
              OpenAgents should return finished work, not just chat text.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DELIVERABLES.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <h3 className="text-xl font-semibold text-white">Built for real work</h3>
            <p className="mt-1 text-sm text-slate-300">
              OpenAgents combines answer-engine behavior with tool execution so it can move from a
              question to a result inside one assistant.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-rose-200">Research</p>
                <p className="mt-2 text-sm text-slate-200">
                  Cite sources, compare pages, and generate reports from web findings.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Execution</p>
                <p className="mt-2 text-sm text-slate-200">
                  Use workflows, connectors, and tools to produce drafts, files, and actions.
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-10 rounded-2xl border border-cyan-300/20 bg-cyan-400/5 px-5 py-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                Final CTA
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Run your own assistant</h2>
              <p className="mt-1 text-sm text-cyan-50/85">
                Start free, self-host it where you want, and keep extending it as your assistant
                grows.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="#quick-start"
                className="inline-flex h-11 items-center rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
              >
                Install OpenAgents
              </Link>
              <Link
                href={appHref}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-5 text-sm font-semibold text-white shadow-glow-red transition hover:brightness-110"
              >
                {appLabel}
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
