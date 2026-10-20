'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

type BillingPlanId = 'free' | 'pro' | 'team'
type BillingUsageMetric = 'messages' | 'researchJobs' | 'agents' | 'voiceMinutes'

interface BillingPlanLimits {
  messages: number
  researchJobs: number
  agents: number
  voiceMinutes: number
}

interface BillingPlanDefinition {
  id: BillingPlanId
  name: string
  priceLabel: string
  limits: BillingPlanLimits
  features: string[]
  purchasable: boolean
}

interface BillingPlanState {
  configured: boolean
  plan: BillingPlanId
  unlimited: boolean
  limits: BillingPlanLimits
  subscriptionStatus: string | null
  currentPeriodEnd: string | null
  hasCustomer: boolean
  plans: BillingPlanDefinition[]
}

interface BillingUsage {
  configured: boolean
  plan: BillingPlanId
  unlimited: boolean
  metrics: Array<{
    metric: BillingUsageMetric
    period: 'day' | 'month' | 'absolute'
    used: number
    limit: number
  }>
}

const METRIC_LABELS: Record<BillingUsageMetric, { title: string; unit: string }> = {
  messages: { title: 'Messages', unit: 'messages' },
  researchJobs: { title: 'Deep Research Jobs', unit: 'jobs' },
  agents: { title: 'Active Agents', unit: 'agents' },
  voiceMinutes: { title: 'Voice Minutes', unit: 'min' },
}

export default function BillingPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [planState, setPlanState] = useState<BillingPlanState | null>(null)
  const [usage, setUsage] = useState<BillingUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadBilling = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [planRes, usageRes] = await Promise.all([
        sdk.client.get<BillingPlanState>('/api/v1/billing/plan'),
        sdk.client.get<BillingUsage>('/api/v1/billing/usage'),
      ])
      setPlanState(planRes)
      setUsage(usageRes)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load billing details')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBilling()
  }, [loadBilling])

  async function handleCheckout(plan: 'pro' | 'team') {
    setBusyAction(plan)
    try {
      const res = await sdk.client.post<{ url: string; id: string }>('/api/v1/billing/checkout', {
        plan,
      })
      if (res.url) {
        window.location.href = res.url
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Could not start Stripe checkout')
    } finally {
      setBusyAction(null)
    }
  }

  async function handlePortal() {
    setBusyAction('portal')
    try {
      const res = await sdk.client.post<{ url: string }>('/api/v1/billing/portal')
      if (res.url) {
        window.location.href = res.url
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Could not open Stripe billing portal')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <CreditCard className="h-7 w-7 text-rose-600" />
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Billing &amp; Usage
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Manage your OpenAgents plan, track real-time usage quotas, and access billing invoices.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {planState?.hasCustomer && planState.configured && (
            <button
              type="button"
              onClick={() => void handlePortal()}
              disabled={busyAction === 'portal'}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ExternalLink className="h-4 w-4" />
              {busyAction === 'portal' ? 'Opening Portal...' : 'Manage Subscription'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadBilling()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {planState && !planState.configured && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">Self-Hosted Unlimited Mode (Stripe Not Configured)</p>
            <p className="mt-0.5 text-xs text-emerald-700">
              <code>STRIPE_SECRET_KEY</code> is not set on this OpenAgents server, so all usage quotas are unlocked and unlimited. Configure Stripe environment variables to enable paid cloud tiers.
            </p>
          </div>
        </div>
      )}

      {/* Usage Progress Bars */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Current Usage</h2>
            <p className="text-xs text-slate-500">
              Active plan:{' '}
              <span className="font-semibold uppercase text-slate-800">
                {planState?.plan ?? 'free'}
              </span>
              {planState?.subscriptionStatus ? ` (${planState.subscriptionStatus})` : ''}
              {planState?.currentPeriodEnd
                ? ` • Renews ${new Date(planState.currentPeriodEnd).toLocaleDateString()}`
                : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(usage?.metrics ?? []).map((m) => {
            const meta = METRIC_LABELS[m.metric] ?? { title: m.metric, unit: '' }
            const isUnlimited = m.limit < 0 || usage?.unlimited
            const pct = isUnlimited ? 8 : Math.min(100, Math.round((m.used / Math.max(1, m.limit)) * 100))
            const nearLimit = !isUnlimited && pct >= 85
            return (
              <div key={m.metric} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{meta.title}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                    per {m.period}
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-slate-900">
                  {m.used.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    / {isUnlimited ? 'Unlimited' : `${m.limit.toLocaleString()} ${meta.unit}`}
                  </span>
                </p>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isUnlimited
                        ? 'bg-emerald-500'
                        : nearLimit
                          ? 'bg-rose-600'
                          : 'bg-slate-900'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Plan Cards */}
      <section className="grid gap-5 lg:grid-cols-3">
        {(planState?.plans ?? []).map((plan) => {
          const isCurrent = planState?.plan === plan.id
          const isPro = plan.id === 'pro'
          return (
            <div
              key={plan.id}
              className={`flex flex-col justify-between rounded-2xl border p-6 shadow-sm ${
                isPro ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                  {isCurrent && (
                    <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                      Current Plan
                    </span>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{plan.priceLabel}</p>

                <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                {plan.id === 'free' ? (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-500"
                  >
                    {isCurrent ? 'Active Free Plan' : 'Included Base Tier'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleCheckout(plan.id as 'pro' | 'team')}
                    disabled={isCurrent || !plan.purchasable || busyAction === plan.id}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-600 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {isCurrent
                      ? 'Current Plan'
                      : !planState?.configured
                        ? 'Stripe Not Configured'
                        : busyAction === plan.id
                          ? 'Redirecting to Stripe...'
                          : `Upgrade to ${plan.name}`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
