'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Circle,
  HardDriveDownload,
  LifeBuoy,
  RefreshCw,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { ConnectorConnection, LlmApiKey, User, UserSettings } from '@openagents/shared'
import InstallQuickStart from '@/components/marketing/InstallQuickStart'
import ShellCommandCard from '@/components/settings/ShellCommandCard'
import { sdk } from '@/stores/auth'

interface SetupSnapshot {
  profile: User | null
  settings: UserSettings | null
  keys: LlmApiKey[]
  connectors: ConnectorConnection[]
  apiHealth: { status: string; timestamp: string } | null
}

interface ChecklistItem {
  title: string
  done: boolean
  description: string
  href?: string
  optional?: boolean
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {item.done ? (
            <CheckCircle2 size={18} className="text-emerald-600" />
          ) : (
            <Circle size={18} className="text-slate-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
            {item.optional ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                optional
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">{item.description}</p>
          {item.href ? (
            <Link
              href={item.href}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Open
              <ArrowRight size={12} />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function preferredProviderHasAccess(settings: UserSettings | null, keys: LlmApiKey[]) {
  if (!settings) return false
  if (settings.preferredProvider === 'ollama') {
    return true
  }
  return keys.some((key) => key.provider === settings.preferredProvider)
}

export default function GetStartedPage() {
  const [snapshot, setSnapshot] = useState<SetupSnapshot>({
    profile: null,
    settings: null,
    keys: [],
    connectors: [],
    apiHealth: null,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [profile, settings, keys, connectors, apiHealth] = await Promise.all([
        sdk.users.getProfile(),
        sdk.users.getSettings(),
        sdk.users.getLlmKeys().catch(() => [] as LlmApiKey[]),
        sdk.connectors.list().catch(() => [] as ConnectorConnection[]),
        fetch('/api/v1/health', { cache: 'no-store' })
          .then(async (response) => (response.ok ? response.json() : null))
          .catch(() => null),
      ])

      setSnapshot({
        profile,
        settings,
        keys,
        connectors,
        apiHealth,
      })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load the getting started guide.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function updateSettings(patch: Partial<Pick<UserSettings, 'beginnerMode' | 'onboardingCompletedAt'>>) {
    setIsSaving(true)
    setError('')
    setStatus('')
    try {
      const updated = await sdk.users.updateSettings(patch)
      setSnapshot((current) => ({ ...current, settings: updated }))
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('openagents:settings-updated'))
      }
      return updated
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update setup preferences.')
      return null
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleBeginnerMode() {
    const next = !(snapshot.settings?.beginnerMode ?? true)
    const updated = await updateSettings({ beginnerMode: next })
    if (updated) {
      setStatus(next ? 'Beginner mode is now on.' : 'Beginner mode is now off.')
    }
  }

  async function handleMarkComplete() {
    const updated = await updateSettings({ onboardingCompletedAt: new Date().toISOString() })
    if (updated) {
      setStatus('Setup marked complete.')
    }
  }

  async function handleReopenGuide() {
    const updated = await updateSettings({ onboardingCompletedAt: null })
    if (updated) {
      setStatus('Guided setup reopened.')
    }
  }

  const connectedTools = snapshot.connectors.filter((connector) => connector.connected)
  const checklist = useMemo<ChecklistItem[]>(() => {
    const settings = snapshot.settings
    const providerLabel =
      settings?.preferredProvider && settings?.preferredModel
        ? `${settings.preferredProvider} / ${settings.preferredModel}`
        : 'No runtime selected yet'

    return [
      {
        title: 'Pick your default runtime',
        done: Boolean(settings?.preferredProvider && settings?.preferredModel),
        description: providerLabel,
        href: '/settings/config',
      },
      {
        title: 'Make sure the runtime can actually run',
        done: preferredProviderHasAccess(settings, snapshot.keys),
        description:
          settings?.preferredProvider === 'ollama'
            ? 'Ollama is selected. Install a local model if chat replies are empty.'
            : snapshot.keys.length > 0
              ? 'Credentials are saved for at least one provider.'
              : 'No provider credentials saved yet.',
        href: '/settings/config',
      },
      {
        title: 'Connect your tools',
        done: connectedTools.length > 0,
        description:
          connectedTools.length > 0
            ? `${connectedTools.length} connector${connectedTools.length === 1 ? '' : 's'} ready.`
            : 'Gmail and Calendar are optional, but connecting them unlocks real actions.',
        href: '/control/channels',
        optional: true,
      },
      {
        title: 'Run a health check',
        done: snapshot.apiHealth?.status === 'ok',
        description:
          snapshot.apiHealth?.status === 'ok'
            ? `API reachable at ${new Date(snapshot.apiHealth.timestamp).toLocaleString()}.`
            : 'Use the Doctor page and pnpm doctor to see what is broken.',
        href: '/settings/doctor',
      },
      {
        title: 'Keep the UI simple',
        done: Boolean(settings?.beginnerMode),
        description: settings?.beginnerMode
          ? 'Beginner mode is on. The sidebar is reduced to the essentials.'
          : 'Beginner mode is off. Advanced routes remain visible.',
      },
      {
        title: 'Finish guided setup',
        done: Boolean(settings?.onboardingCompletedAt),
        description: settings?.onboardingCompletedAt
          ? `Completed ${new Date(settings.onboardingCompletedAt).toLocaleString()}.`
          : 'Mark setup complete when chat, runtime, and recovery commands are ready.',
      },
    ]
  }, [connectedTools.length, snapshot.apiHealth, snapshot.keys, snapshot.settings])

  const completedCount = checklist.filter((item) => item.done).length

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              <Sparkles size={12} />
              Guided Setup
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Get OpenAgents ready without guesswork
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              This page is the support-free setup path: choose a model, run a health check, turn on the simpler UI, and keep a backup command ready.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Progress
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {completedCount}/{checklist.length}
            </p>
            <p className="text-xs text-slate-500">
              {snapshot.profile?.email ?? 'Signed in user'}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {checklist.map((item) => (
            <ChecklistRow key={item.title} item={item} />
          ))}
        </div>

        <div className="space-y-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Brain size={15} className="text-slate-500" />
              Personal setup controls
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Keep the product simple for new users, then hide this guide when everything is ready.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleToggleBeginnerMode()}
                disabled={isSaving}
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                {snapshot.settings?.beginnerMode ? 'Turn off beginner mode' : 'Turn on beginner mode'}
              </button>
              <button
                type="button"
                onClick={() => void handleMarkComplete()}
                disabled={isSaving}
                className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Mark setup complete
              </button>
              <button
                type="button"
                onClick={() => void handleReopenGuide()}
                disabled={isSaving}
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Reopen guide later
              </button>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <LifeBuoy size={15} className="text-slate-500" />
              Quick links
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                { href: '/chat', label: 'Open chat', icon: ArrowRight },
                { href: '/settings/config', label: 'Model settings', icon: Settings2 },
                { href: '/settings/doctor', label: 'Open doctor', icon: Wrench },
                { href: '/docs', label: 'Read docs', icon: RefreshCw },
              ].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                >
                  {label}
                  <Icon size={14} />
                </Link>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ShellCommandCard
          title="Health check"
          command="pnpm doctor"
          note="Run this from the OpenAgents repo folder when chat, login, Docker, or ports are not behaving."
        />
        <ShellCommandCard
          title="Create a backup"
          command="pnpm backup:create"
          note="Creates a portable archive of env files and user data before upgrades or risky changes."
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <HardDriveDownload size={15} className="text-slate-500" />
          Install on another device
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Use the same self-serve installer for Windows, macOS, or Ubuntu. This is the same flow a non-technical user should follow.
        </p>
        <div className="mt-4">
          <InstallQuickStart theme="light" />
        </div>
      </section>

      {(isLoading || error || status) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700'
              : status
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {error || status || 'Loading setup guide...'}
        </div>
      )}
    </div>
  )
}
