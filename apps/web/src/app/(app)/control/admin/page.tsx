'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk, useAuthStore } from '@/stores/auth'
import type { PlatformAdminOverviewSnapshot } from '@openagents/shared'
import { RefreshCw, ShieldCheck, Users, Smartphone, MessageSquare, Globe2 } from 'lucide-react'

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value)
}

function formatDateTime(iso: string | null) {
  if (!iso) return 'n/a'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'n/a'
  return d.toLocaleString()
}

function truncate(value: string | null, max = 56) {
  if (!value) return 'n/a'
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function StatCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string
  value: string
  detail: string
  icon: React.ElementType
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <Icon size={16} />
        </div>
      </div>
    </article>
  )
}

export default function CreatorAdminPage() {
  const user = useAuthStore((state) => state.user)
  const isOwnerUser = (user?.role ?? '').toLowerCase() === 'owner'
  const [snapshot, setSnapshot] = useState<PlatformAdminOverviewSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await sdk.platform.adminOverview({ days: 30, limit: 60 })
      setSnapshot(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load admin dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOwnerUser) return
    void load()
  }, [isOwnerUser, load])

  const totals = snapshot?.totals
  const daily = useMemo(() => snapshot?.daily ?? [], [snapshot?.daily])
  const topUsers = useMemo(() => snapshot?.topUsers ?? [], [snapshot?.topUsers])
  const recentDevices = useMemo(() => snapshot?.recentDevices ?? [], [snapshot?.recentDevices])

  if (!isOwnerUser) {
    return (
      <div className="mx-auto max-w-[900px]">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          Creator admin access is restricted to the owner account.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Creator Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Private install, device, and adoption analytics for owner/admin only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Users"
          value={formatNumber(totals?.totalUsers ?? 0)}
          detail={`${formatNumber(totals?.newUsers30d ?? 0)} new in last 30d`}
          icon={Users}
        />
        <StatCard
          title="Tracked Devices"
          value={formatNumber(totals?.trackedDevices ?? 0)}
          detail={`${formatNumber(totals?.activeDevices30d ?? 0)} active in last 30d`}
          icon={Smartphone}
        />
        <StatCard
          title="Conversations"
          value={formatNumber(totals?.totalConversations ?? 0)}
          detail={`${formatNumber(totals?.totalMessages ?? 0)} total messages`}
          icon={MessageSquare}
        />
        <StatCard
          title="Install Signals"
          value={formatNumber(totals?.totalDeviceLoginEvents ?? 0)}
          detail={`${formatNumber(totals?.mappedDomains ?? 0)} mapped domains`}
          icon={Globe2}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Role Distribution</h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
            <ShieldCheck size={12} />
            Viewer: {snapshot?.viewer.email ?? user?.email ?? 'owner'}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Owners: <span className="font-semibold text-slate-900">{formatNumber(totals?.owners ?? 0)}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Admins: <span className="font-semibold text-slate-900">{formatNumber(totals?.admins ?? 0)}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Members: <span className="font-semibold text-slate-900">{formatNumber(totals?.members ?? 0)}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Top Install Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5 text-right">Devices</th>
                  <th className="px-4 py-2.5 text-right">Logins</th>
                  <th className="px-4 py-2.5">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {topUsers.length === 0 && (
                  <tr>
                    <td className="px-4 py-5 text-sm text-slate-500" colSpan={5}>No device analytics yet.</td>
                  </tr>
                )}
                {topUsers.map((row) => (
                  <tr key={row.userId}>
                    <td className="px-4 py-2.5 text-slate-700">{row.email}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.role}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-700">{formatNumber(row.devices)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-700">{formatNumber(row.loginEvents)}</td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-500">{formatDateTime(row.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Daily Adoption (Last 30d)</h2>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-right">New Users</th>
                  <th className="px-4 py-2.5 text-right">New Devices</th>
                  <th className="px-4 py-2.5 text-right">Active Devices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {daily.map((row) => (
                  <tr key={row.date}>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-slate-700">{row.date}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(row.newUsers)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(row.newDevices)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(row.activeDevices)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Recent Devices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">IP</th>
                <th className="px-4 py-2.5">User Agent</th>
                <th className="px-4 py-2.5 text-right">Logins</th>
                <th className="px-4 py-2.5">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentDevices.length === 0 && (
                <tr>
                  <td className="px-4 py-5 text-sm text-slate-500" colSpan={6}>No recent device data.</td>
                </tr>
              )}
              {recentDevices.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2.5 text-slate-700">{row.email}</td>
                  <td className="px-4 py-2.5 text-slate-500">{row.role}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-slate-600">{row.ipAddress ?? 'n/a'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500">{truncate(row.userAgent, 96)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700">{formatNumber(row.loginCount)}</td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-500">{formatDateTime(row.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
