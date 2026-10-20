'use client'

import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Bell,
  BellRing,
  Calendar,
  CheckSquare,
  Clock,
  History,
  Loader2,
  Mail,
  Newspaper,
  Play,
  Save,
  Sparkles,
  Brain,
} from 'lucide-react'
import { sdk } from '@/stores/auth'
import { enablePushNotifications, getPushSupport, type PushSupport } from '@/lib/push'

// Mirrors packages/sdk/src/api/briefing.ts. Uses sdk.client directly so this page
// works before createBriefingApi is wired into the SDK index.
type SectionKey = 'email' | 'calendar' | 'tasks' | 'news' | 'memory'
interface BriefingSettings {
  enabled: boolean
  time: string
  timezone: string
  sections: Record<SectionKey, boolean>
  newsTopics?: string[]
}
interface BriefingCard { section: SectionKey; title: string; items: string[] }
interface BriefingRecord {
  id: string
  createdAt: string
  dateKey: string
  trigger: 'scheduled' | 'manual'
  summary: string
  cards: BriefingCard[]
}

const api = {
  latest: () => sdk.client.get<{ briefing: BriefingRecord | null }>('/api/v1/briefing/latest'),
  history: () => sdk.client.get<BriefingRecord[]>('/api/v1/briefing/history?limit=30'),
  getSettings: () => sdk.client.get<BriefingSettings>('/api/v1/briefing/settings'),
  updateSettings: (s: Partial<BriefingSettings>) => sdk.client.put<BriefingSettings>('/api/v1/briefing/settings', s),
  run: () => sdk.client.post<{ ok: boolean; briefing: BriefingRecord }>('/api/v1/briefing/run'),
  vapidPublicKey: () => sdk.client.get<{ publicKey: string | null }>('/api/v1/push/vapid-public-key'),
  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    sdk.client.post<{ ok: boolean }>('/api/v1/push/subscribe', sub),
}

const SECTION_META: Record<SectionKey, { label: string; icon: typeof Mail }> = {
  email: { label: 'Email', icon: Mail },
  calendar: { label: 'Calendar', icon: Calendar },
  tasks: { label: 'Tasks', icon: CheckSquare },
  news: { label: 'News', icon: Newspaper },
  memory: { label: 'Memory', icon: Brain },
}

function timezones(): string[] {
  try {
    const fn = (Intl as any).supportedValuesOf
    if (typeof fn === 'function') return fn('timeZone') as string[]
  } catch {}
  return ['UTC']
}

export default function BriefingPage() {
  const [latest, setLatest] = useState<BriefingRecord | null>(null)
  const [selected, setSelected] = useState<BriefingRecord | null>(null)
  const [history, setHistory] = useState<BriefingRecord[]>([])
  const [settings, setSettings] = useState<BriefingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [push, setPush] = useState<PushSupport>('unsupported')
  const [pushBusy, setPushBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [l, h, s] = await Promise.all([api.latest(), api.history(), api.getSettings()])
      setLatest(l.briefing)
      setHistory(h)
      setSettings(s)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load briefing')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    setPush(getPushSupport())
  }, [load])

  const runNow = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await api.run()
      setLatest(res.briefing)
      setSelected(null)
      setHistory((h) => [res.briefing, ...h.filter((b) => b.id !== res.briefing.id)])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to run briefing')
    } finally {
      setRunning(false)
    }
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      setSettings(await api.updateSettings(settings))
      setNotice('Settings saved')
      setTimeout(() => setNotice(null), 2500)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const enablePush = async () => {
    setPushBusy(true)
    setError(null)
    try {
      await enablePushNotifications(api)
      setNotice('Push notifications enabled')
      setTimeout(() => setNotice(null), 2500)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to enable push notifications')
    } finally {
      setPush(getPushSupport())
      setPushBusy(false)
    }
  }

  const shown = selected ?? latest

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading briefing…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="h-6 w-6 text-amber-500" /> Daily Briefing
          </h1>
          <p className="text-sm text-zinc-500">Your proactive morning summary from OpenAgents.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={enablePush}
            disabled={pushBusy || push === 'unsupported' || push === 'denied'}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            title={push === 'denied' ? 'Notifications are blocked in your browser settings' : undefined}
          >
            {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : push === 'granted' ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {push === 'granted' ? 'Push enabled (re-subscribe)' : push === 'unsupported' ? 'Push unsupported' : push === 'denied' ? 'Push blocked' : 'Enable push notifications'}
          </button>
          <button
            onClick={runNow}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run now
          </button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{notice}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          {shown ? (
            <>
              <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
                <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{selected ? 'Past briefing' : "Today's briefing"} · {new Date(shown.createdAt).toLocaleString()}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 capitalize dark:bg-zinc-800">{shown.trigger}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{shown.summary}</p>
                {selected && (
                  <button onClick={() => setSelected(null)} className="mt-3 text-xs text-zinc-500 underline">Back to latest</button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {shown.cards.map((card) => {
                  const Icon = SECTION_META[card.section]?.icon ?? Sparkles
                  return (
                    <div key={card.section} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4 text-zinc-500" /> {card.title}
                      </h3>
                      {card.items.length ? (
                        <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                          {card.items.map((item, i) => <li key={i} className="list-inside list-disc">{item}</li>)}
                        </ul>
                      ) : (
                        <p className="text-xs text-zinc-500">Nothing to report{card.section === 'email' || card.section === 'calendar' || card.section === 'news' ? ' — connect a source to enable this section.' : '.'}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No briefing yet. Click <strong>Run now</strong> to generate your first one.
            </div>
          )}
        </section>

        <aside className="space-y-6">
          {settings && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4" /> Schedule</h2>
              <label className="mb-3 flex items-center justify-between text-sm">
                Daily briefing
                <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
              </label>
              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-xs text-zinc-500">Time</span>
                <input
                  type="time"
                  value={settings.time}
                  onChange={(e) => setSettings({ ...settings, time: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                />
              </label>
              <label className="mb-3 block text-sm">
                <span className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  Timezone
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setSettings({ ...settings, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
                  >Use mine</button>
                </span>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
                >
                  {Array.from(new Set([settings.timezone, ...timezones()])).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </label>
              <div className="mb-4 space-y-1">
                <span className="block text-xs text-zinc-500">Sections</span>
                {(Object.keys(SECTION_META) as SectionKey[]).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.sections[key]}
                      onChange={(e) => setSettings({ ...settings, sections: { ...settings.sections, [key]: e.target.checked } })}
                    />
                    {SECTION_META[key].label}
                  </label>
                ))}
              </div>
              {settings.sections.news && (
                <label className="mb-4 block text-sm">
                  <span className="mb-1 block text-xs text-zinc-500">News topics (comma separated)</span>
                  <input
                    type="text"
                    value={(settings.newsTopics ?? ['AI', 'technology']).join(', ')}
                    placeholder="AI, technology"
                    onChange={(e) =>
                      setSettings({ ...settings, newsTopics: e.target.value.split(',').map((t) => t.replace(/^\s+/, '')) })
                    }
                    className="w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
                  />
                </label>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
              </button>
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> History</h2>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-500">No past briefings.</p>
            ) : (
              <ul className="max-h-96 space-y-1 overflow-y-auto">
                {history.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => setSelected(b.id === latest?.id ? null : b)}
                      className={clsx(
                        'w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800',
                        shown?.id === b.id && 'bg-zinc-100 dark:bg-zinc-800',
                      )}
                    >
                      <div className="flex justify-between text-xs text-zinc-500">
                        <span>{b.dateKey}</span><span className="capitalize">{b.trigger}</span>
                      </div>
                      <div className="truncate">{b.summary}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
