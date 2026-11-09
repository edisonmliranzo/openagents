'use client'

import Link from 'next/link'
import { ArrowLeft, CheckCircle2, EyeOff, KeyRound, Lock, Mic, ShieldCheck, Trash2 } from 'lucide-react'

const PRIVACY_SECTIONS = [
  {
    id: 'overview',
    icon: ShieldCheck,
    title: '1. Core Privacy Commitment & Zero Training Guarantee',
    body: [
      'OpenAgents is built on a simple principle: your personal AI agent works for you, not an ad network or model training pipeline. We do not sell, rent, or broker your personal data, conversation history, memory graph, or uploaded artifacts to third parties.',
      'Prompts, completions, tool executions, and voice transcripts processed through OpenAgents are never used to train foundational models.',
    ],
  },
  {
    id: 'keys',
    icon: KeyRound,
    title: '2. API Keys, APIsRouter.dev & Bring Your Own Key (BYOK)',
    body: [
      'When you connect your unified API key from APIsRouter.dev (https://apisrouter.dev/v1) or bring your own API keys (BYOK) from Anthropic, OpenAI, Google Gemini, DeepSeek, xAI Grok, Groq, NVIDIA NIM, or other providers, your credentials are encrypted at rest using AES-256-GCM envelope encryption before being stored.',
      'Your raw API keys are never exposed in plaintext in client responses after saving—only masked suffixes (for example, ...a9f2) are returned to the UI. You can rotate or permanently delete any stored API key at any time in Settings → Config.',
    ],
  },
  {
    id: 'voice',
    icon: Mic,
    title: '3. Voice Calls & Expressive Avatar Privacy',
    body: [
      'Real-time voice calls and expressive avatar lip-sync (/phone and /frontier/voice-console) use your browser microphone only while an active call is unmuted and in progress.',
      'Audio amplitude analysis for 60fps avatar lip-sync runs locally in your browser via the Web Audio API. Microphone streams are immediately released when you mute or end the call.',
    ],
  },
  {
    id: 'memory',
    icon: Lock,
    title: '4. Personal Memory, Computer Use & Governance Controls',
    body: [
      'Your long-term memory entries, knowledge graph nodes, durable agent checkpoints, and audit ledger events are scoped strictly to your authenticated account or workspace.',
      'High-impact tool actions (such as sending emails, modifying calendar events, or running shell/browser actions) are governed by your Policy Guardrails (/frontier/policy-guardrails) and human-in-the-loop Approval inbox (/approvals).',
    ],
  },
  {
    id: 'analytics',
    icon: EyeOff,
    title: '5. Privacy-First Analytics & Cookies',
    body: [
      'OpenAgents uses strictly necessary authentication tokens (JWT / refresh tokens) to keep your session secure, alongside lightweight, privacy-preserving pageview and Web Vitals telemetry to monitor platform reliability and latency.',
      'We do not use cross-site behavioral advertising trackers or third-party fingerprinting pixels.',
    ],
  },
  {
    id: 'rights',
    icon: Trash2,
    title: '6. Your Data Rights (Export, Redaction & Deletion — GDPR / CCPA)',
    body: [
      'You have the right to inspect, export, redact, or permanently delete your conversations, memories, encrypted vault secrets, and account data at any time.',
      'Authenticated users can manage PII redaction and vault encryption directly in the Privacy Vault (/privacy) or request full account erasure via Support (/support).',
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#090b12] text-slate-100 selection:bg-rose-500 selection:text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090b12]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 text-rose-400" />
            <span>Back to OpenAgents</span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/privacy" className="text-slate-300 hover:text-white">
              Privacy Vault
            </Link>
            <span className="text-white/20">·</span>
            <Link href="/terms" className="text-slate-300 hover:text-white">
              Terms of Service
            </Link>
            <span className="text-white/20">·</span>
            <Link href="/support" className="text-slate-300 hover:text-white">
              Support
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Privacy Policy · Last Updated November 2026
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            OpenAgents Privacy Policy
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
            How OpenAgents protects your conversations, voice calls, personal memory graph, and encrypted API keys across{' '}
            <a
              href="https://apisrouter.dev/?ref=openagents"
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-rose-300 underline underline-offset-2 hover:text-white"
            >
              APIsRouter.dev
            </a>{' '}
            and Bring Your Own Key (BYOK) providers.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'AES-256-GCM Encrypted Keys', desc: 'Envelope-encrypted API keys & secrets' },
              { label: 'Zero Model Training', desc: 'Your prompts & voice calls stay private' },
              { label: 'Full Data Ownership', desc: 'Export or delete your memory anytime' },
            ].map((badge) => (
              <div key={badge.label} className="rounded-2xl border border-white/10 bg-black/30 p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{badge.label}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{badge.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 space-y-5">
          {PRIVACY_SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <section
                key={section.id}
                id={section.id}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-white">{section.title}</h2>
                </div>
                <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-300">
                  {section.body.map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div>
            <h3 className="text-sm font-bold text-white">Questions or Data Privacy Requests?</h3>
            <p className="mt-1 text-xs text-slate-400">
              Manage your live encryption settings in the Privacy Vault or reach our support team.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/privacy"
              className="rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:brightness-110"
            >
              Open Privacy Vault →
            </Link>
            <Link
              href="/terms"
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
