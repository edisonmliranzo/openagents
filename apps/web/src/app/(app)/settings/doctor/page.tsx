'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HardDriveDownload,
  LifeBuoy,
  RefreshCw,
  Server,
  Terminal,
  Wrench,
} from 'lucide-react'
import type {
  ConnectorHealthSnapshot,
  LlmApiKey,
  SessionRow,
  UserSettings,
} from '@openagents/shared'
import ShellCommandCard from '@/components/settings/ShellCommandCard'
import { sdk } from '@/stores/auth'

interface DoctorSnapshot {
  apiHealth: { status: string; timestamp: string } | null
  settings: UserSettings | null
  keys: LlmApiKey[]
  connectorHealth: ConnectorHealthSnapshot | null
  sessions: SessionRow[]
}

interface DiagnosticCard {
  title: string
  status: 'ok' | 'warn' | 'error'
  detail: string
  action: string
  href?: string
}

function toneClass(status: DiagnosticCard['status']) {
  if (status === 'ok') return 'border-emerald-200 bg-emerald-50'
  if (status === 'warn') return 'border-amber-200 bg-amber-50'
  return 'border-red-200 bg-red-50'
}

function badgeClass(status: DiagnosticCard['status']) {
  if (status === 'ok') return 'bg-emerald-100 text-emerald-700'
  if (status === 'warn') return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

function runtimeHasAccess(settings: UserSettings | null, keys: LlmApiKey[]) {
  if (!settings) return false
  if (settings.preferredProvider === 'ollama') return true
  return keys.some((key) => key.provider === settings.preferredProvider)
}

export default function DoctorPage() {
  const [snapshot, setSnapshot] = useState<DoctorSnapshot>({
    apiHealth: null,
    settings: null,
    keys: [],
    connectorHealth: null,
    sessions: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [apiHealth, settings, keys, connectorHealth, sessionsResult] = await Promise.all([
        fetch('/api/v1/health', { cache: 'no-store' })
          .then(async (response) => (response.ok ? response.json() : null))
          .catch(() => null),
        sdk.users.getSettings(),
        sdk.users.getLlmKeys().catch(() => [] as LlmApiKey[]),
        sdk.connectors.health().catch(() => null),
        sdk.sessions.list({ limit: 50, includeGlobal: false, includeUnknown: false }).catch(() => ({ sessions: [] as SessionRow[] })),
      ])

      setSnapshot({
        apiHealth,
        settings,
        keys,
        connectorHealth,
        sessions: sessionsResult.sessions ?? [],
      })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load doctor state.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const degradedConnectors =
    snapshot.connectorHealth?.connectors.filter((connector) => connector.status !== 'connected') ?? []
  const diagnostics = useMemo<DiagnosticCard[]>(() => {
    const cards: DiagnosticCard[] = []

    cards.push({
      title: 'API health',
      status: snapshot.apiHealth?.status === 'ok' ? 'ok' : 'error',
      detail:
        snapshot.apiHealth?.status === 'ok'
          ? `API responded at ${new Date(snapshot.apiHealth.timestamp).toLocaleString()}.`
          : 'The browser could not confirm /api/v1/health on this origin.',
      action:
        snapshot.apiHealth?.status === 'ok'
          ? 'API looks healthy.'
          : 'Run pnpm doctor. If the API is down, run pnpm setup and then pnpm dev.',
    })

    cards.push({
      title: 'Runtime credentials',
      status: runtimeHasAccess(snapshot.settings, snapshot.keys) ? 'ok' : 'warn',
      detail:
        snapshot.settings?.preferredProvider && snapshot.settings?.preferredModel
          ? `${snapshot.settings.preferredProvider} / ${snapshot.settings.preferredModel}`
          : 'No default runtime selected.',
      action: runtimeHasAccess(snapshot.settings, snapshot.keys)
        ? 'Runtime can respond with the current provider.'
        : 'Open Config and save a provider key or switch to Ollama.',
      href: '/settings/config',
    })

    cards.push({
      title: 'Connector status',
      status: !snapshot.connectorHealth ? 'warn' : degradedConnectors.length === 0 ? 'ok' : 'warn',
      detail:
        snapshot.connectorHealth?.connectors.length
          ? `${snapshot.connectorHealth.connectors.length - degradedConnectors.length}/${snapshot.connectorHealth.connectors.length} connector(s) healthy.`
          : 'No connector health data available yet.',
      action:
        !snapshot.connectorHealth
          ? 'Open Config or Channels once, then refresh this page.'
          : degradedConnectors.length === 0
          ? 'No connector action needed.'
          : 'Reconnect the degraded connector or remove it if you do not use it.',
      href: '/control/connectors',
    })

    cards.push({
      title: 'Conversation history',
      status: snapshot.sessions.length > 0 ? 'ok' : 'warn',
      detail:
        snapshot.sessions.length > 0
          ? `${snapshot.sessions.length} recent session(s) detected.`
          : 'No sessions found yet.',
      action:
        snapshot.sessions.length > 0
          ? 'Open Chat to continue working.'
          : 'Open Chat and send a first message to confirm the runtime is working.',
      href: '/chat',
    })

    return cards
  }, [degradedConnectors.length, snapshot.apiHealth, snapshot.connectorHealth, snapshot.keys, snapshot.sessions.length, snapshot.settings])

  const overallStatus: DiagnosticCard['status'] = diagnostics.some((card) => card.status === 'error')
    ? 'error'
    : diagnostics.some((card) => card.status === 'warn')
      ? 'warn'
      : 'ok'

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              <Wrench size={12} />
              Doctor
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Diagnose install and runtime problems fast
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Use this page when login works but something feels wrong. For machine-level issues, run the CLI doctor command below from the repo folder.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw size={14} />
            Refresh checks
          </button>
        </div>
      </header>

      <section className={`rounded-2xl border p-5 shadow-sm ${toneClass(overallStatus)}`}>
        <div className="flex items-center gap-3">
          {overallStatus === 'ok' ? (
            <CheckCircle2 size={20} className="text-emerald-700" />
          ) : (
            <AlertTriangle size={20} className={overallStatus === 'warn' ? 'text-amber-700' : 'text-red-700'} />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {overallStatus === 'ok' ? 'Everything important looks healthy.' : 'Doctor found issues worth fixing.'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {overallStatus === 'ok'
                ? 'Keep a backup current and rerun the doctor command before upgrades.'
                : 'Use the fix commands below first. Then refresh this page.'}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {diagnostics.map((card) => (
          <article key={card.title} className={`rounded-2xl border p-5 shadow-sm ${toneClass(card.status)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                <p className="mt-1 text-sm text-slate-700">{card.detail}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${badgeClass(card.status)}`}>
                {card.status}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-700">{card.action}</p>
            {card.href ? (
              <Link
                href={card.href}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
              >
                Open fix page
                <ExternalLink size={12} />
              </Link>
            ) : null}
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ShellCommandCard
          title="Run the doctor command"
          command="pnpm doctor"
          note="Checks Node, pnpm, env files, Docker Compose, local login reachability, and API health."
        />
        <ShellCommandCard
          title="Create a restore point"
          command="pnpm backup:create"
          note="Create this before updates. It captures env files and user data into a portable archive."
        />
        <ShellCommandCard
          title="Restore from a backup"
          command="pnpm backup:restore -- --file backups/openagents-backup-YYYYMMDD-HHmmss.tar.gz"
          note="Restore a specific backup archive into the current repo when a deployment or local upgrade goes bad."
        />
        <ShellCommandCard
          title="Rerun local setup"
          command="pnpm setup"
          note="Use this after a broken local install, missing node_modules, or after pulling a big update."
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/settings/get-started" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:bg-slate-50">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <LifeBuoy size={14} className="text-slate-500" />
            Guided setup
          </div>
          <p className="mt-2 text-sm text-slate-600">Return to the step-by-step setup checklist and beginner mode controls.</p>
        </Link>
        <Link href="/settings/config" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:bg-slate-50">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Server size={14} className="text-slate-500" />
            Config
          </div>
          <p className="mt-2 text-sm text-slate-600">Change providers, add keys, switch to Ollama, and store domain details.</p>
        </Link>
        <Link href="/chat" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:bg-slate-50">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Activity size={14} className="text-slate-500" />
            Chat
          </div>
          <p className="mt-2 text-sm text-slate-600">Open the assistant after the doctor page shows green or amber instead of red.</p>
        </Link>
      </section>

      {(isLoading || error) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700'
              : 'border border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {error || 'Running diagnostics...'}
        </div>
      )}
    </div>
  )
}
