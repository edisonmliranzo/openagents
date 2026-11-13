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
          <div className="max-h-[420px] overflow-x-auto overflow-y-auto">
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

      <PayPalPanel />
    </div>
  )
}

function PayPalPanel() {
  const [status, setStatus] = useState<{
    configured: boolean
    mode: 'live' | 'sandbox'
    currency: string
    periodDays: number
    webhookConfigured: boolean
    plans: { id: string; name: string; amount: string; currency: string }[]
  } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void sdk.client
      .get<{
        configured: boolean
        mode: 'live' | 'sandbox'
        currency: string
        periodDays: number
        webhookConfigured: boolean
        plans: { id: string; name: string; amount: string; currency: string }[]
      }>('/api/v1/billing/paypal/status')
      .then((data) => {
        if (!cancelled) setStatus(data)
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? 'Could not load PayPal status')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Payments &amp; PayPal</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            One-time payment grants a plan for {status?.periodDays ?? 30} days. Credentials are Worker secrets and never reach the browser.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
            status?.configured
              ? status.mode === 'live'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {status?.configured ? `${status.mode} mode` : 'Not configured'}
        </span>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Client ID', value: status?.configured ? 'Configured' : 'Missing' },
          { label: 'Secret', value: status?.configured ? 'Configured' : 'Missing' },
          { label: 'Webhook', value: status?.webhookConfigured ? 'Verified' : 'Not set' },
          { label: 'Currency', value: status?.currency ?? 'USD' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      {status?.plans?.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Plan</th>
                <th className="px-4 py-2 font-semibold">Price</th>
                <th className="px-4 py-2 font-semibold">Period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {status.plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">{plan.name}</td>
                  <td className="px-4 py-2 font-mono text-slate-700">
                    {plan.currency} {plan.amount}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{status.periodDays} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-700">Where the API keys go (PowerShell)</p>
        <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-slate-600">
{`npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_WEBHOOK_ID   # optional

# wrangler.toml
PAYPAL_ENV = "sandbox"   # then "live"
PAYPAL_PRICE_PRO_USD = "20"
PAYPAL_PRICE_TEAM_USD = "50"
PAYPAL_PERIOD_DAYS = "30"`}
        </pre>
        <p className="mt-2 text-[11px] text-slate-500">
          Webhook URL: <span className="font-mono">https://openagents.us/api/v1/paypal/webhook</span> · events:{' '}
          <span className="font-mono">PAYMENT.CAPTURE.COMPLETED</span>
        </p>
      </div>
    </section>
  )
}
