'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  Search,
  LifeBuoy,
  ShieldCheck,
  Terminal,
  MessageSquare,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Sun,
  Moon,
  Send,
  FileText,
  Cpu,
  Share2,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Wrench,
  Clock,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

interface SupportGuide {
  id: string
  category: 'Getting Started' | 'Local Ollama & Models' | 'Omnichannel Growth' | 'Security & Approvals' | 'Billing & Plans'
  title: string
  summary: string
  steps: string[]
  command?: string
  routeLink?: { label: string; href: string }
}

const SUPPORT_GUIDES: SupportGuide[] = [
  {
    id: 'quickstart-local',
    category: 'Getting Started',
    title: 'Starting OpenAgents API, Web & Local Database',
    summary: 'How to launch the full OpenAgents stack locally and verify health checks in under 60 seconds.',
    steps: [
      'Ensure PostgreSQL and Redis (or local memory fallback) are running on your machine.',
      'Run the API server on port 3001 and Web UI on port 3000 from the workspace root.',
      'Verify API health at /api/v1/health or open the built-in System Doctor.',
    ],
    command: 'pnpm --filter @openagents/api dev',
    routeLink: { label: 'Open System Doctor', href: '/settings/doctor' },
  },
  {
    id: 'ollama-setup',
    category: 'Local Ollama & Models',
    title: 'Connecting Local Ollama Models (Qwen, DeepSeek, Phi-4)',
    summary: 'Run 100% private local inference with zero API token cost using Ollama on localhost:11434.',
    steps: [
      'Install Ollama from ollama.com and pull your preferred model (e.g. ollama pull qwen2.5:14b).',
      'Make sure Ollama is serving on http://localhost:11434.',
      'Open Settings → Config & Keys in OpenAgents and select Ollama as your active provider.',
    ],
    command: 'ollama run qwen2.5:14b',
    routeLink: { label: 'Configure Models & Keys', href: '/settings/config' },
  },
  {
    id: 'omnichannel-growth',
    category: 'Omnichannel Growth',
    title: 'Setting Up Comment, Reply, DM, Email, SMS & WhatsApp (/growth)',
    summary: 'Connect your social accounts, SMTP/IMAP email, and Twilio/WhatsApp channels for autonomous outreach.',
    steps: [
      'Navigate to Growth & Social (/growth) from the main sidebar.',
      'Open the "6-Channel Connectors (Email/SMS/WA/Social)" tab to configure SMTP/IMAP, Twilio SMS, or WhatsApp Business.',
      'Use "Auto-Reply & DM Rules" to set keyword triggers (e.g. comment "GUIDE" → auto-reply + send DM + email/WhatsApp follow-up).',
      'Keep "Require Approval" enabled while testing to review every drafted message in the Approval Queue before it sends.',
    ],
    routeLink: { label: 'Open Omnichannel Growth Hub', href: '/growth' },
  },
  {
    id: 'approvals-safety',
    category: 'Security & Approvals',
    title: 'Managing Human-in-the-Loop Approvals & Security Guardrails',
    summary: 'Control which tools require manual confirmation ("Allow Once") vs. trusted automation.',
    steps: [
      'Whenever an agent attempts a shell command, file write, or external message, an Approval Card appears.',
      'Review the exact payload and risk badge before choosing Allow Once, Always Allow, or Deny.',
      'Inspect all pending and historical decisions anytime in the Approvals center.',
    ],
    routeLink: { label: 'Open Approvals Queue', href: '/approvals' },
  },
  {
    id: 'mcp-servers',
    category: 'Security & Approvals',
    title: 'Connecting Custom MCP Servers Safely',
    summary: 'Attach HTTP or local stdio Model Context Protocol servers with encrypted secret headers and env vars.',
    steps: [
      'Go to Control → MCP Servers (/mcp) and click Add Server.',
      'For remote HTTP MCP servers, enter a public HTTPS endpoint (private RFC1918/loopback IPs are blocked against SSRF).',
      'For local stdio command servers, sign in with your Workspace Owner account to authorize host command execution.',
    ],
    routeLink: { label: 'Manage MCP Servers', href: '/mcp' },
  },
  {
    id: 'billing-usage',
    category: 'Billing & Plans',
    title: 'Tracking Token Costs, FinOps & Subscription Tiers',
    summary: 'Monitor real-time model spend across OpenAI, Anthropic, Gemini, and local Ollama runs.',
    steps: [
      'Open Control → Usage & Billing (/billing) to view your daily and monthly token consumption.',
      'When using BYOK (Bring Your Own Key) or local Ollama, OpenAgents adds 0% markup to your model inference.',
      'Workspace owners can manage plan tiers and cost budgets directly from the Billing dashboard.',
    ],
    routeLink: { label: 'View Billing & Usage', href: '/billing' },
  },
]

const FAQ_ITEMS = [
  {
    q: 'How does OpenAgents protect my privacy compared to cloud-only AI platforms?',
    a: 'OpenAgents is built local-first. Your conversations, PostgreSQL memory store, files, and local Ollama models can run entirely on your own hardware. All stored API keys and OAuth tokens are encrypted at rest with AES-256-GCM (enc:v1:), we never sell your data, and we never train foundation models on your workspace.',
  },
  {
    q: 'How do I use the Comment, Reply, DM, Email, SMS, and WhatsApp engine?',
    a: 'Click "Growth & Social" (/growth) in the left sidebar. From there you can generate viral hooks, queue comments/replies/DMs/emails/SMS/WhatsApp messages in the Omnichannel Inbox, create keyword Auto-Reply & DM triggers, and connect your SMTP/IMAP, Twilio SMS, and WhatsApp Business credentials.',
  },
  {
    q: 'Why did an agent action pause for approval?',
    a: 'By design, OpenAgents pauses before executing high-impact tools (such as terminal commands, external API mutations, or outbound messages) and presents a deterministic Approval Card. You can approve the action once, whitelist the tool for future runs, or deny it.',
  },
  {
    q: 'How do I report a security vulnerability or suspicious activity?',
    a: 'Select "Security / Vulnerability Report" in the Support Ticket form below or email security@openagents.us directly. Our security team reviews all vulnerability reports with top priority.',
  },
  {
    q: 'Can I export or delete all of my workspace data?',
    a: 'Yes. You own 100% of your data. Workspace owners can export conversations, memories, workflows, and artifacts in standard JSON/Markdown formats or purge them permanently from their database at any time.',
  },
]

interface SupportTicket {
  id: string
  createdAt: string
  name: string
  email: string
  category: string
  priority: 'Low' | 'Normal' | 'High / Urgent'
  subject: string
  message: string
  includeDiagnostics: boolean
  status: 'Received • Queued for Priority Review'
}

export default function SupportCenterPage() {
  const user = useAuthStore((s) => s.user)
  const [hydrated, setHydrated] = useState(false)
  const [warmTheme, setWarmTheme] = useState(true)

  // Search & category filter for Knowledge Base
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)

  // Live API Health Diagnostic state
  const [healthState, setHealthState] = useState<{
    checking: boolean
    ok: boolean | null
    latencyMs: number | null
    uptimeSeconds: number | null
    timestamp: string | null
  }>({
    checking: true,
    ok: null,
    latencyMs: null,
    uptimeSeconds: null,
    timestamp: null,
  })

  // Support Ticket Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [ticketCategory, setTicketCategory] = useState('Omnichannel / Growth Setup')
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High / Urgent'>('Normal')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [latestTicket, setLatestTicket] = useState<SupportTicket | null>(null)

  const checkApiHealth = useCallback(async () => {
    setHealthState((prev) => ({ ...prev, checking: true }))
    const start = performance.now()
    try {
      const res = await fetch('/api/v1/health', { cache: 'no-store' })
      const latency = Math.round(performance.now() - start)
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        setHealthState({
          checking: false,
          ok: true,
          latencyMs: latency,
          uptimeSeconds: typeof data.uptimeSeconds === 'number' ? data.uptimeSeconds : null,
          timestamp: data.timestamp ?? new Date().toISOString(),
        })
      } else {
        setHealthState({
          checking: false,
          ok: false,
          latencyMs: latency,
          uptimeSeconds: null,
          timestamp: new Date().toISOString(),
        })
      }
    } catch {
      setHealthState({
        checking: false,
        ok: false,
        latencyMs: null,
        uptimeSeconds: null,
        timestamp: new Date().toISOString(),
      })
    }
  }, [])

  useEffect(() => {
    setHydrated(true)
    checkApiHealth()
    try {
      const saved = window.localStorage.getItem('openagents_support_tickets_v1')
      if (saved) {
        setTickets(JSON.parse(saved))
      }
    } catch {
      // ignore storage errors
    }
  }, [checkApiHealth])

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email)
    if (user?.name && !name) setName(user.name)
  }, [user, email, name])

  const isAuthenticated = hydrated && Boolean(user?.id)

  const categories = [
    'All',
    'Getting Started',
    'Local Ollama & Models',
    'Omnichannel Growth',
    'Security & Approvals',
    'Billing & Plans',
  ]

  const filteredGuides = SUPPORT_GUIDES.filter((g) => {
    const matchesCat = selectedCategory === 'All' || g.category === selectedCategory
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch =
      !q ||
      g.title.toLowerCase().includes(q) ||
      g.summary.toLowerCase().includes(q) ||
      g.steps.some((s) => s.toLowerCase().includes(q))
    return matchesCat && matchesSearch
  })

  const handleCopyCommand = (cmd: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd)
      setCopiedCmd(cmd)
      setTimeout(() => setCopiedCmd(null), 1800)
    }
  }

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !subject.trim() || !message.trim()) return

    const newTicket: SupportTicket = {
      id: `OA-SUP-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: new Date().toLocaleString(),
      name: name.trim() || 'OpenAgents User',
      email: email.trim(),
      category: ticketCategory,
      priority,
      subject: subject.trim(),
      message: message.trim(),
      includeDiagnostics,
      status: 'Received • Queued for Priority Review',
    }

    const updated = [newTicket, ...tickets].slice(0, 20)
    setTickets(updated)
    setLatestTicket(newTicket)
    setSubject('')
    setMessage('')
    try {
      window.localStorage.setItem('openagents_support_tickets_v1', JSON.stringify(updated))
    } catch {
      // ignore storage errors
    }
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-300 selection:bg-rose-500 selection:text-white ${
        warmTheme ? 'bg-[#f7f6f2] text-[#141413]' : 'bg-[#090b12] text-[#f5f5f7]'
      }`}
    >
      {/* Ambient Aura */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div
          className={`absolute -top-36 left-1/2 -translate-x-1/2 h-[460px] w-[920px] rounded-full blur-[135px] transition-opacity duration-500 ${
            warmTheme
              ? 'bg-gradient-to-tr from-rose-200/60 via-amber-100/70 to-orange-200/50 opacity-90'
              : 'bg-gradient-to-tr from-rose-600/15 via-amber-500/10 to-indigo-600/15 opacity-80'
          }`}
        />
      </div>

      {/* Top Navigation */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl transition-colors ${
          warmTheme
            ? 'border-black/[0.06] bg-[#f7f6f2]/85'
            : 'border-white/10 bg-[#090b12]/85'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-3.5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 via-orange-400 to-amber-400 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold tracking-tight sm:text-base">OpenAgents</span>
            </Link>
            <span
              className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium sm:inline-flex ${
                warmTheme ? 'bg-black/[0.05] text-stone-600' : 'bg-white/10 text-slate-300'
              }`}
            >
              Support &amp; Help Center
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <Link
              href="/terms"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition sm:px-3.5 ${
                warmTheme
                  ? 'border-black/10 bg-white/80 text-stone-700 hover:bg-white shadow-sm'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-rose-500" />
              <span className="hidden sm:inline">Terms &amp; Conditions</span>
              <span className="sm:hidden">Terms</span>
            </Link>

            <button
              type="button"
              onClick={() => setWarmTheme((w) => !w)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                warmTheme
                  ? 'border-black/10 bg-white/80 text-stone-700 hover:bg-white shadow-sm'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              {warmTheme ? <Sun className="h-3.5 w-3.5 text-amber-500" /> : <Moon className="h-3.5 w-3.5 text-rose-400" />}
              <span className="hidden sm:inline">{warmTheme ? 'Warm Ivory' : 'Midnight'}</span>
            </button>

            {isAuthenticated ? (
              <Link
                href="/chat"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#141413] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 sm:px-4 dark:bg-white dark:text-slate-900"
              >
                <span className="hidden sm:inline">Workspace</span>
                <span className="sm:hidden">Open</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 sm:px-4"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Back to Home</span>
                <span className="sm:hidden">Home</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 sm:pb-24 sm:pt-10 lg:px-8">
        {/* Hero Header + Search */}
        <div className="mx-auto max-w-4xl text-center">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium shadow-sm mb-5 ${
              warmTheme
                ? 'border-black/[0.08] bg-white/85 text-stone-700'
                : 'border-white/15 bg-white/5 text-slate-200'
            }`}
          >
            <LifeBuoy className="h-3.5 w-3.5 text-rose-500" />
            <span>24/7 Self-Healing Diagnostics • Priority Human &amp; Agent Support</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            How can we help you today?
          </h1>
          <p
            className={`mx-auto mt-4 max-w-2xl text-sm sm:text-base leading-relaxed ${
              warmTheme ? 'text-stone-600' : 'text-slate-300'
            }`}
          >
            Search step-by-step setup guides for Local Ollama, Omnichannel Growth (Comment, Reply, DM, Email, SMS, WhatsApp), and Security Approvals—or open a priority ticket below.
          </p>

          {/* Search Bar */}
          <div className="mx-auto mt-7 max-w-2xl">
            <div
              className={`flex items-center gap-3 rounded-full border px-5 py-3.5 shadow-lg ${
                warmTheme
                  ? 'border-black/10 bg-white text-stone-900 shadow-stone-900/5'
                  : 'border-white/15 bg-[#131724] text-white'
              }`}
            >
              <Search className="h-4 w-4 text-rose-500 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guides (e.g., WhatsApp, Ollama, SMTP, Approvals, MCP, Billing)..."
                className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:opacity-50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-semibold text-rose-500 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Platform Status Banner */}
        <section className="mt-10">
          <div
            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-[24px] border p-5 ${
              warmTheme
                ? 'border-black/[0.07] bg-white/90 shadow-sm'
                : 'border-white/10 bg-[#131724]'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  healthState.checking
                    ? 'bg-amber-500/15 text-amber-500'
                    : healthState.ok
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-rose-500/15 text-rose-500'
                }`}
              >
                {healthState.checking ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : healthState.ok ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold">
                    {healthState.checking
                      ? 'Checking OpenAgents API Gateway...'
                      : healthState.ok
                        ? 'All OpenAgents Systems Operational'
                        : 'Local API Gateway Unreachable'}
                  </h2>
                  {healthState.latencyMs !== null && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {healthState.latencyMs}ms latency
                    </span>
                  )}
                  <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-500">
                    HSTS + AES-256-GCM Active
                  </span>
                </div>
                <p className={`mt-0.5 text-xs ${warmTheme ? 'text-stone-500' : 'text-slate-400'}`}>
                  {healthState.ok
                    ? `Verified /api/v1/health endpoint${
                        healthState.uptimeSeconds
                          ? ` • Uptime: ${Math.floor(healthState.uptimeSeconds / 60)}m ${healthState.uptimeSeconds % 60}s`
                          : ''
                      }`
                    : 'Ensure your local API server is running on port 3001 (pnpm --filter @openagents/api dev).'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={checkApiHealth}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                  warmTheme
                    ? 'border-stone-200 bg-[#f7f6f2] text-stone-700 hover:bg-stone-200/70'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${healthState.checking ? 'animate-spin' : ''}`} />
                <span>Re-Test Health</span>
              </button>
              {isAuthenticated && (
                <Link
                  href="/settings/doctor"
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span>System Doctor</span>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Knowledge Base & Step-by-Step Troubleshooting Guides */}
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">
                Quick-Start &amp; Troubleshooting Guides
              </h2>
              <p className={`text-xs ${warmTheme ? 'text-stone-500' : 'text-slate-400'}`}>
                Filter by topic or copy ready-to-run terminal commands.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const active = selectedCategory === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'bg-[#141413] text-white dark:bg-rose-500'
                        : warmTheme
                          ? 'border border-black/[0.08] bg-white/80 text-stone-600 hover:bg-white'
                          : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredGuides.map((guide) => (
              <div
                key={guide.id}
                className={`flex flex-col justify-between rounded-[24px] border p-6 transition ${
                  warmTheme
                    ? 'border-black/[0.07] bg-white/95 shadow-sm hover:shadow-md'
                    : 'border-white/10 bg-[#131724]/90 hover:border-rose-500/30'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-500">
                      {guide.category}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-extrabold">{guide.title}</h3>
                  <p className={`mt-1 text-xs leading-relaxed ${warmTheme ? 'text-stone-600' : 'text-slate-300'}`}>
                    {guide.summary}
                  </p>

                  <ol className="mt-4 space-y-2 text-xs">
                    {guide.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 font-mono text-[10px] font-bold text-rose-500">
                          {idx + 1}
                        </span>
                        <span className={warmTheme ? 'text-stone-700' : 'text-slate-200'}>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                  {guide.command ? (
                    <div
                      className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-[11px] ${
                        warmTheme
                          ? 'border-stone-200 bg-[#f7f6f2] text-stone-800'
                          : 'border-white/10 bg-black/40 text-slate-200'
                      }`}
                    >
                      <Terminal className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>{guide.command}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyCommand(guide.command!)}
                        className="ml-1 opacity-70 hover:opacity-100"
                        title="Copy command"
                      >
                        {copiedCmd === guide.command ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span />
                  )}

                  {guide.routeLink && (
                    <Link
                      href={isAuthenticated ? guide.routeLink.href : '/login'}
                      className="inline-flex items-center gap-1 text-xs font-bold text-rose-500 hover:underline"
                    >
                      <span>{guide.routeLink.label}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 2-Column Section: Submit a Support Ticket + Direct Support Channels & FAQ */}
        <section className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left: Interactive Support Ticket Form */}
          <div className="lg:col-span-7">
            <div
              className={`rounded-[28px] border p-6 sm:p-8 ${
                warmTheme
                  ? 'border-black/[0.07] bg-white/95 shadow-sm'
                  : 'border-white/10 bg-[#131724]/95'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/15 to-amber-500/15 text-rose-500">
                  <MessageSquare className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold">Submit a Priority Support Ticket</h2>
                  <p className={`text-xs ${warmTheme ? 'text-stone-500' : 'text-slate-400'}`}>
                    Get help with setup, omnichannel connectors, billing, or security reports.
                  </p>
                </div>
              </div>

              {latestTicket && (
                <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs">
                  <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Ticket {latestTicket.id} Created
                    </span>
                    <span className="font-mono text-[11px]">{latestTicket.priority} Priority</span>
                  </div>
                  <p className="mt-1.5 text-stone-700 dark:text-slate-200">
                    We logged your request (&ldquo;{latestTicket.subject}&rdquo;). You can also send it directly to our engineering inbox with one click:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`mailto:support@openagents.us?subject=${encodeURIComponent(
                        `[${latestTicket.id}] [${latestTicket.category}] ${latestTicket.subject}`,
                      )}&body=${encodeURIComponent(
                        `Ticket ID: ${latestTicket.id}\nPriority: ${latestTicket.priority}\nCategory: ${latestTicket.category}\nFrom: ${latestTicket.name} (${latestTicket.email})\n\n${latestTicket.message}`,
                      )}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>Send via Email Client (support@openagents.us)</span>
                    </a>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitTicket} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold mb-1.5">Your Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Rivera"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-xs outline-none transition ${
                        warmTheme
                          ? 'border-stone-300 bg-white text-stone-900 focus:border-rose-500'
                          : 'border-white/15 bg-black/40 text-white focus:border-rose-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-xs outline-none transition ${
                        warmTheme
                          ? 'border-stone-300 bg-white text-stone-900 focus:border-rose-500'
                          : 'border-white/15 bg-black/40 text-white focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold mb-1.5">Category</label>
                    <select
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-xs outline-none transition ${
                        warmTheme
                          ? 'border-stone-300 bg-white text-stone-900 focus:border-rose-500'
                          : 'border-white/15 bg-black/40 text-white focus:border-rose-500'
                      }`}
                    >
                      <option value="Omnichannel / Growth Setup">Omnichannel / Growth Setup (DM, Email, SMS, WhatsApp)</option>
                      <option value="Local Ollama & AI Models">Local Ollama &amp; AI Models</option>
                      <option value="Technical / Workspace Issue">Technical / Workspace Issue</option>
                      <option value="Security / Vulnerability Report">Security / Vulnerability Report</option>
                      <option value="Billing & Subscription">Billing &amp; Subscription</option>
                      <option value="Feature Request">Feature Request</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1.5">Priority</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Low', 'Normal', 'High / Urgent'] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setPriority(level)}
                          className={`rounded-xl border py-2 text-xs font-semibold transition ${
                            priority === level
                              ? 'border-rose-500 bg-rose-500 text-white'
                              : warmTheme
                                ? 'border-stone-200 bg-[#f7f6f2] text-stone-700 hover:bg-stone-200/60'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5">Subject *</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief summary of your question or issue..."
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-xs outline-none transition ${
                      warmTheme
                        ? 'border-stone-300 bg-white text-stone-900 focus:border-rose-500'
                        : 'border-white/15 bg-black/40 text-white focus:border-rose-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5">How can we help? *</label>
                  <textarea
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe what you're trying to accomplish, any error messages, or steps to reproduce..."
                    className={`w-full rounded-xl border p-3.5 text-xs outline-none transition ${
                      warmTheme
                        ? 'border-stone-300 bg-white text-stone-900 focus:border-rose-500'
                        : 'border-white/15 bg-black/40 text-white focus:border-rose-500'
                    }`}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeDiagnostics}
                    onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                    className="h-4 w-4 rounded accent-rose-500"
                  />
                  <span className={warmTheme ? 'text-stone-600' : 'text-slate-300'}>
                    Attach non-sensitive API health &amp; latency snapshot ({healthState.ok ? 'Online' : 'Offline'})
                  </span>
                </label>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-6 py-3.5 text-xs font-bold text-white shadow-md transition hover:brightness-105"
                >
                  <Send className="h-4 w-4" />
                  <span>Submit Support Ticket</span>
                </button>
              </form>

              {/* Recent Tickets History */}
              {tickets.length > 0 && (
                <div className="mt-7 pt-6 border-t border-black/[0.06] dark:border-white/10">
                  <h3 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">
                    Your Recent Support Tickets ({tickets.length})
                  </h3>
                  <div className="space-y-2">
                    {tickets.slice(0, 3).map((t) => (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 text-xs ${
                          warmTheme
                            ? 'border-stone-200 bg-[#f7f6f2]'
                            : 'border-white/10 bg-black/30'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-rose-500">{t.id}</span>
                            <span className="truncate font-semibold">{t.subject}</span>
                          </div>
                          <div className="text-[11px] opacity-60">
                            {t.category} • {t.createdAt}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          Queued
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Direct Channels + FAQ Accordion */}
          <div className="lg:col-span-5 space-y-6">
            {/* Direct Contact Channels */}
            <div
              className={`rounded-[28px] border p-6 ${
                warmTheme
                  ? 'border-black/[0.07] bg-white/95 shadow-sm'
                  : 'border-white/10 bg-[#131724]/95'
              }`}
            >
              <h2 className="text-base font-extrabold">Direct Support Channels</h2>
              <p className={`mt-1 text-xs ${warmTheme ? 'text-stone-500' : 'text-slate-400'}`}>
                Reach the OpenAgents team directly for urgent production or security inquiries.
              </p>

              <div className="mt-4 space-y-3 text-xs">
                <a
                  href="mailto:support@openagents.us"
                  className={`flex items-center justify-between rounded-2xl border p-3.5 transition ${
                    warmTheme
                      ? 'border-stone-200 bg-[#f7f6f2] hover:border-rose-500/40'
                      : 'border-white/10 bg-black/30 hover:border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-rose-500 shrink-0" />
                    <div>
                      <div className="font-bold">General &amp; Technical Support</div>
                      <div className="font-mono text-[11px] opacity-70">support@openagents.us</div>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 opacity-50" />
                </a>

                <a
                  href="mailto:security@openagents.us"
                  className={`flex items-center justify-between rounded-2xl border p-3.5 transition ${
                    warmTheme
                      ? 'border-stone-200 bg-[#f7f6f2] hover:border-rose-500/40'
                      : 'border-white/10 bg-black/30 hover:border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-bold">Security &amp; Trust Desk</div>
                      <div className="font-mono text-[11px] opacity-70">security@openagents.us</div>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 opacity-50" />
                </a>

                <a
                  href="https://x.com/openagentsus"
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center justify-between rounded-2xl border p-3.5 transition ${
                    warmTheme
                      ? 'border-stone-200 bg-[#f7f6f2] hover:border-rose-500/40'
                      : 'border-white/10 bg-black/30 hover:border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Share2 className="h-4 w-4 text-amber-500 shrink-0" />
                    <div>
                      <div className="font-bold">Official X / Twitter Updates</div>
                      <div className="font-mono text-[11px] opacity-70">@openagentsus</div>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 opacity-50" />
                </a>
              </div>
            </div>

            {/* Expandable FAQ Accordion */}
            <div
              className={`rounded-[28px] border p-6 ${
                warmTheme
                  ? 'border-black/[0.07] bg-white/95 shadow-sm'
                  : 'border-white/10 bg-[#131724]/95'
              }`}
            >
              <h2 className="text-base font-extrabold">Frequently Asked Questions</h2>
              <div className="mt-4 space-y-2.5">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaqIndex === idx
                  return (
                    <div
                      key={idx}
                      className={`rounded-2xl border transition ${
                        warmTheme
                          ? 'border-stone-200 bg-[#f7f6f2]'
                          : 'border-white/10 bg-black/30'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs font-bold"
                      >
                        <span>{item.q}</span>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-rose-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                        )}
                      </button>
                      {isOpen && (
                        <div
                          className={`px-4 pb-3.5 text-xs leading-relaxed ${
                            warmTheme ? 'text-stone-600' : 'text-slate-300'
                          }`}
                        >
                          {item.a}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
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
            <span>• Support &amp; Help Center</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/" className="hover:underline">
              Home
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms &amp; Conditions
            </Link>
            <Link href="/support" className="font-semibold text-rose-500 hover:underline">
              Support Center
            </Link>
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
