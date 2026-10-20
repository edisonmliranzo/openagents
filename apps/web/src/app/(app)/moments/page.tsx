'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Bell,
  Calendar,
  Clock,
  ExternalLink,
  Mail,
  Moon,
  RefreshCw,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

type MomentKind = 'meeting_soon' | 'unanswered_email' | 'calendar_conflict' | 'goal_stalled' | 'watch_hit'
type MomentStatus = 'active' | 'snoozed' | 'dismissed' | 'acted'

interface MomentAction {
  id: string
  label: string
  href?: string
}

interface Moment {
  id: string
  key: string
  kind: MomentKind
  title: string
  body: string
  context?: string[]
  actions: MomentAction[]
  status: MomentStatus
  snoozedUntil?: string
  delivered: boolean
  deliveredAt?: string
  actedActionId?: string
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

interface MomentSettings {
  enabled: boolean
  timezone: string
  quietHours: { enabled: boolean; start: string; end: string }
  maxPerDay: number
  kinds: Record<MomentKind, boolean>
}

const KIND_META: Record<MomentKind, { label: string; badge: string }> = {
  meeting_soon: { label: 'Meeting Prep', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  calendar_conflict: { label: 'Calendar Conflict', badge: 'bg-rose-100 text-rose-700 border-rose-200' },
  unanswered_email: { label: 'Unanswered Email', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  goal_stalled: { label: 'Stalled Goal', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
  watch_hit: { label: 'Watch Alert', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const ALL_KINDS: MomentKind[] = [
  'meeting_soon',
  'calendar_conflict',
  'unanswered_email',
  'goal_stalled',
  'watch_hit',
]

export default function ProactiveMomentsPage() {
  const router = useRouter()
  const addToast = useUIStore((s) => s.addToast)

  const [moments, setMoments] = useState<Moment[]>([])
  const [settings, setSettings] = useState<MomentSettings>({
    enabled: true,
    timezone: 'UTC',
    quietHours: { enabled: true, start: '22:00', end: '07:00' },
    maxPerDay: 8,
    kinds: {
      meeting_soon: true,
      unanswered_email: true,
      calendar_conflict: true,
      goal_stalled: true,
      watch_hit: true,
    },
  })
  const [statusFilter, setStatusFilter] = useState<MomentStatus | 'all'>('active')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [momentsRes, settingsRes] = await Promise.all([
        sdk.client.get<Moment[]>(
          `/api/v1/proactive/moments${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`,
        ),
        sdk.client.get<MomentSettings>('/api/v1/proactive/moments/settings'),
      ])
      setMoments(momentsRes)
      setSettings(settingsRes)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load Proactive Moments')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  async function handleScanNow() {
    setScanning(true)
    setError('')
    try {
      const res = await sdk.client.post<{ created: number; moments: Moment[] }>(
        '/api/v1/proactive/moments/scan',
      )
      addToast('success', `Scan complete: ${res.created} new moment(s) detected.`)
      await loadAll()
    } catch (err: any) {
      const msg = err?.message ?? 'Scan failed'
      setError(msg)
      addToast('error', msg)
    } finally {
      setScanning(false)
    }
  }

  async function handleAct(moment: Moment, action: MomentAction) {
    setBusyId(moment.id)
    try {
      await sdk.client.post(`/api/v1/proactive/moments/${encodeURIComponent(moment.id)}/act`, {
        actionId: action.id,
      })
      if (action.href) {
        if (/^https?:\/\//.test(action.href)) {
          window.open(action.href, '_blank', 'noopener,noreferrer')
        } else {
          router.push(action.href)
        }
      }
      await loadAll()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to trigger action')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSnooze(id: string, minutes = 60) {
    setBusyId(id)
    try {
      await sdk.client.post(`/api/v1/proactive/moments/${encodeURIComponent(id)}/snooze`, { minutes })
      addToast('info', `Snoozed for ${minutes} minutes.`)
      await loadAll()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to snooze moment')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDismiss(id: string) {
    setBusyId(id)
    try {
      await sdk.client.post(`/api/v1/proactive/moments/${encodeURIComponent(id)}/dismiss`)
      addToast('info', 'Moment dismissed.')
      await loadAll()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to dismiss moment')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true)
    try {
      const updated = await sdk.client.put<MomentSettings>('/api/v1/proactive/moments/settings', settings)
      setSettings(updated)
      addToast('success', 'Proactive Moments settings saved.')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  function renderIcon(kind: MomentKind) {
    switch (kind) {
      case 'meeting_soon':
        return <Calendar className="h-5 w-5 text-indigo-600" />
      case 'calendar_conflict':
        return <AlertTriangle className="h-5 w-5 text-rose-600" />
      case 'unanswered_email':
        return <Mail className="h-5 w-5 text-amber-600" />
      case 'goal_stalled':
        return <Target className="h-5 w-5 text-purple-600" />
      case 'watch_hit':
        return <Zap className="h-5 w-5 text-emerald-600" />
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Bell className="h-7 w-7 text-rose-600" />
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Proactive Moments</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Timely nudges for upcoming meetings, calendar overlaps, unanswered threads, stalled goals, and watch hits.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleScanNow()}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {scanning ? 'Scanning...' : 'Scan Now'}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        {/* Moments Feed */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Moments Feed</h2>
            <div className="flex gap-1.5">
              {(['active', 'snoozed', 'acted', 'dismissed', 'all'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {moments.map((m) => (
              <article key={m.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-white p-2 shadow-sm">{renderIcon(m.kind)}</div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{m.title}</h3>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            KIND_META[m.kind]?.badge ?? 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {KIND_META[m.kind]?.label ?? m.kind}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-700">{m.body}</p>
                      {m.context && m.context.length > 0 && (
                        <ul className="mt-2 space-y-1 rounded-lg border border-slate-200/80 bg-white p-2.5 text-[11px] text-slate-600">
                          {m.context.map((ctx, idx) => (
                            <li key={idx}>• {ctx}</li>
                          ))}
                        </ul>
                      )}
                      {m.snoozedUntil && m.status === 'snoozed' && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Snoozed until {new Date(m.snoozedUntil).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-3">
                  <div className="flex flex-wrap gap-2">
                    {m.actions.map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => void handleAct(m, act)}
                        disabled={busyId === m.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {act.label}
                      </button>
                    ))}
                  </div>

                  {m.status === 'active' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleSnooze(m.id, 60)}
                        disabled={busyId === m.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Snooze 1h
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDismiss(m.id)}
                        disabled={busyId === m.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}

            {moments.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">
                {loading
                  ? 'Loading moments...'
                  : 'No moments in this view. Click Scan Now to check calendar, inbox, goals, and watches.'}
              </p>
            )}
          </div>
        </section>

        {/* Quiet Hours & Delivery Settings */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Moon className="h-5 w-5 text-slate-700" />
            <h2 className="text-base font-semibold text-slate-900">Delivery &amp; Quiet Hours</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Control when OpenAgents can nudge you and how many moments can be delivered per day.
          </p>

          <div className="mt-4 space-y-4">
            <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-800">
              <span>Enable Proactive Moments</span>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-rose-600"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">
                Timezone
                <input
                  value={settings.timezone}
                  onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}
                  placeholder="UTC or America/New_York"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Daily Cap (Max per day)
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={settings.maxPerDay}
                  onChange={(e) => setSettings((s) => ({ ...s, maxPerDay: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800"
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <label className="flex items-center justify-between text-xs font-semibold text-slate-800">
                <span>Quiet Hours</span>
                <input
                  type="checkbox"
                  checked={settings.quietHours.enabled}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      quietHours: { ...s.quietHours, enabled: e.target.checked },
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-rose-600"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <label className="text-[11px] font-medium text-slate-500">
                  Start (HH:MM)
                  <input
                    type="time"
                    value={settings.quietHours.start}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        quietHours: { ...s.quietHours, start: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </label>
                <label className="text-[11px] font-medium text-slate-500">
                  End (HH:MM)
                  <input
                    type="time"
                    value={settings.quietHours.end}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        quietHours: { ...s.quietHours, end: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Detectors</p>
              {ALL_KINDS.map((k) => (
                <label
                  key={k}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                >
                  <span>{KIND_META[k].label}</span>
                  <input
                    type="checkbox"
                    checked={settings.kinds[k] ?? true}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        kinds: { ...s.kinds, [k]: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-rose-600"
                  />
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              disabled={savingSettings}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
