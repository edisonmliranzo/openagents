'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { PlatformPlanId, PlatformSubscriptionSnapshot } from '@openagents/shared'

const PLAN_OPTIONS: Array<{ id: PlatformPlanId; label: string; price: string }> = [
  { id: 'free', label: 'Free', price: '$0/mo' },
  { id: 'pro', label: 'Pro', price: '$19/mo' },
  { id: 'team', label: 'Team', price: '$79/mo' },
]

function quotaPercent(limit: number | null, used: number) {
  if (limit === null || limit <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
}

export default function SubscriptionPage() {
  const addToast = useUIStore((state) => state.addToast)
  const [subscription, setSubscription] = useState<PlatformSubscriptionSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await sdk.platform.subscription()
      setSubscription(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load subscription')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSetPlan(planId: PlatformPlanId) {
    setIsSaving(true)
    setError('')
    try {
      const result = await sdk.platform.setPlan({ planId })
      setSubscription(result)
      addToast('success', `Plan switched to ${result.planLabel}`)
    } catch (err: any) {
      const message = err?.message ?? 'Failed to switch plan'
      setError(message)
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Subscription & Quotas</h1>
          <p className="mt-1 text-sm text-slate-500">Plan tiers, feature gates, and monthly quota utilization.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {PLAN_OPTIONS.map((plan) => {
          const active = subscription?.planId === plan.id
          return (
            <article key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{plan.label}</p>
              <p className="mt-1 text-xs text-slate-500">{plan.price}</p>
              <button
                type="button"
                onClick={() => void handleSetPlan(plan.id)}
                disabled={isSaving || active}
                className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
                  active
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-500 text-white hover:bg-rose-600'
                } disabled:opacity-50`}
              >
                {active ? 'Current Plan' : 'Switch Plan'}
              </button>
            </article>
          )
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Quota Usage</h2>
          <div className="mt-3 space-y-3">
            {(subscription?.quotas ?? []).map((quota) => {
              const percent = quotaPercent(quota.limit, quota.used)
              return (
                <div key={quota.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{quota.label}</p>
                    <p className="font-mono text-xs text-slate-600">
                      {quota.used}
                      {quota.limit === null ? '' : ` / ${quota.limit}`} {quota.unit}
                    </p>
                  </div>
                  {quota.limit !== null && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                  {quota.remaining !== null && (
                    <p className="mt-1 text-[11px] text-slate-500">remaining: {quota.remaining}</p>
                  )}
                </div>
              )
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Feature Gates</h2>
          <div className="mt-3 space-y-2">
            {(subscription?.featureGates ?? []).map((gate) => (
              <div key={gate.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{gate.label}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      gate.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {gate.enabled ? 'enabled' : 'locked'}
                  </span>
                </div>
                {!gate.enabled && gate.reason && (
                  <p className="mt-1 text-xs text-slate-500">{gate.reason}</p>
                )}
              </div>
            ))}
          </div>
        </article>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

