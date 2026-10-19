'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { AlertTriangle, Coins, Cpu, Gauge, Loader2, RefreshCw, Route, Save, Sparkles, Wallet } from 'lucide-react'
import clsx from 'clsx'

type RouterMode = 'manual' | 'auto-cheapest' | 'balanced' | 'best'
type RouterTier = 'simple' | 'standard' | 'complex'
interface Bucket { costUsd: number; runs: number; tokens: number }
interface Summary {
  totalCostUsd: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalRuns: number
  byProvider: Record<string, Bucket>
  byModel: Record<string, Bucket & { provider: string }>
  daily: { date: string; costUsd: number; tokens: number; runs: number }[]
  monthToDateUsd: number
  todayUsd: number
  budget: { capUsd: number; alertThresholdPct: number; spentUsd: number; pct: number; alert: boolean; exceeded: boolean }
}
interface RouterSettings {
  mode: RouterMode
  tiers: Record<RouterTier, { provider: string; model: string }>
  monthlyBudgetUsd: number
  alertThresholdPct: number
}
interface RouteDecision { provider: string; model: string; tier: RouterTier; score: number; reasons: string[]; overBudget: boolean }

// Uses the raw client so this page works before `costs` is wired into createSDK.
const api = {
  summary: (days: number) => sdk.client.get<Summary>(`/api/v1/costs/summary?days=${days}`),
  getRouter: () => sdk.client.get<RouterSettings>('/api/v1/costs/router'),
  updateRouter: (s: Partial<RouterSettings>) => sdk.client.put<RouterSettings>('/api/v1/costs/router', s),
  preview: (prompt: string) => sdk.client.post<RouteDecision>('/api/v1/costs/router/preview', { prompt }),
}

const usd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`)
const num = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))

const MODES: { id: RouterMode; label: string; hint: string }[] = [
  { id: 'manual', label: 'Manual', hint: 'Always use your selected model' },
  { id: 'auto-cheapest', label: 'Cheapest', hint: 'Downgrade one tier where possible' },
  { id: 'balanced', label: 'Balanced', hint: 'Match tier to prompt complexity' },
  { id: 'best', label: 'Best quality', hint: 'Upgrade one tier where possible' },
]

function Card({ icon: Icon, label, value, sub }: { icon: typeof Coins; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-xs text-white/50"><Icon className="h-4 w-4" />{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-white/40">{sub}</div>}
    </div>
  )
}

function DailyChart({ data }: { data: Summary['daily'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.costUsd), 0.0001)
  const W = 100, H = 40
  const bw = W / Math.max(1, data.length)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-48 w-full">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="currentColor" className="text-white/5" strokeWidth={0.2} />
        ))}
        {data.map((d, i) => {
          const h = (d.costUsd / max) * (H - 2)
          return (
            <rect
              key={d.date}
              x={i * bw + bw * 0.15}
              y={H - h}
              width={bw * 0.7}
              height={Math.max(h, d.costUsd > 0 ? 0.4 : 0.15)}
              rx={0.4}
              className={clsx(hover === i ? 'fill-indigo-300' : 'fill-indigo-500/70')}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-white/30">
        <span>{data[0]?.date}</span><span>{data[data.length - 1]?.date}</span>
      </div>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-white/10 bg-black/80 px-2 py-1 text-xs text-white">
          {data[hover].date}: {usd(data[hover].costUsd)} · {num(data[hover].tokens)} tok · {data[hover].runs} calls
        </div>
      )}
    </div>
  )
}

export default function CostsPage() {
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [settings, setSettings] = useState<RouterSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testPrompt, setTestPrompt] = useState('')
  const [decision, setDecision] = useState<RouteDecision | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, r] = await Promise.all([api.summary(days), api.getRouter()])
      setSummary(s); setSettings(r)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load costs')
    } finally { setLoading(false) }
  }, [days])

  useEffect(() => { void load() }, [load])

  const models = useMemo(
    () => Object.entries(summary?.byModel ?? {}).sort((a, b) => b[1].costUsd - a[1].costUsd),
    [summary],
  )

  const save = async () => {
    if (!settings) return
    setSaving(true); setMsg(null)
    try {
      const next = await api.updateRouter(settings)
      setSettings(next); setMsg('Saved'); void load()
    } catch (e: any) { setMsg(e?.message ?? 'Save failed') } finally { setSaving(false) }
  }

  const runPreview = async () => {
    if (!testPrompt.trim()) return
    try { setDecision(await api.preview(testPrompt)) } catch (e: any) { setMsg(e?.message ?? 'Preview failed') }
  }

  const b = summary?.budget
  const pct = Math.min(100, b?.pct ?? 0)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Costs & Model Router</h1>
          <p className="text-sm text-white/50">Track OpenAgents LLM spend and route prompts to the right model.</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={clsx('rounded-lg px-3 py-1.5 text-sm', days === d ? 'bg-indigo-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10')}>
              {d}d
            </button>
          ))}
          <button onClick={() => void load()} className="rounded-lg bg-white/5 p-2 hover:bg-white/10" aria-label="Refresh">
            <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      {loading && !summary ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>
      ) : summary && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card icon={Coins} label={`Spend (${days}d)`} value={usd(summary.totalCostUsd)} sub={`${summary.totalRuns} LLM calls`} />
            <Card icon={Wallet} label="Month to date" value={usd(summary.monthToDateUsd)} sub={`Today ${usd(summary.todayUsd)}`} />
            <Card icon={Cpu} label="Tokens" value={num(summary.totalTokens)} sub={`${num(summary.totalInputTokens)} in · ${num(summary.totalOutputTokens)} out`} />
            <Card icon={Gauge} label="Avg / call" value={usd(summary.totalRuns ? summary.totalCostUsd / summary.totalRuns : 0)} sub={`${Object.keys(summary.byProvider).length} providers`} />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Monthly budget</h2>
              {b?.exceeded ? (
                <span className="flex items-center gap-1 text-xs text-red-300"><AlertTriangle className="h-3.5 w-3.5" />Cap reached</span>
              ) : b?.alert ? (
                <span className="flex items-center gap-1 text-xs text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />Above {b.alertThresholdPct}% alert</span>
              ) : null}
            </div>
            {b && b.capUsd > 0 ? (
              <>
                <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
                  <div className={clsx('h-full rounded-full', b.exceeded ? 'bg-red-500' : b.alert ? 'bg-amber-400' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                  <div className="absolute top-0 h-full w-px bg-white/60" style={{ left: `${b.alertThresholdPct}%` }} />
                </div>
                <div className="mt-2 text-xs text-white/50">{usd(b.spentUsd)} of {usd(b.capUsd)} ({b.pct.toFixed(1)}%)</div>
              </>
            ) : <div className="text-sm text-white/40">No budget cap set. Configure one below.</div>}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 font-medium">Daily spend</h2>
            <DailyChart data={summary.daily} />
          </div>

          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            <h2 className="p-4 font-medium">By model</h2>
            {models.length === 0 ? <div className="px-4 pb-4 text-sm text-white/40">No usage recorded in this period.</div> : (
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-xs text-white/50">
                  <tr><th className="px-4 py-2">Model</th><th className="px-4 py-2">Provider</th><th className="px-4 py-2 text-right">Calls</th><th className="px-4 py-2 text-right">Tokens</th><th className="px-4 py-2 text-right">Cost</th><th className="px-4 py-2">Share</th></tr>
                </thead>
                <tbody>
                  {models.map(([m, v]) => {
                    const share = summary.totalCostUsd ? (v.costUsd / summary.totalCostUsd) * 100 : 0
                    return (
                      <tr key={m} className="border-t border-white/5">
                        <td className="px-4 py-2 font-mono text-xs">{m}</td>
                        <td className="px-4 py-2 text-white/60">{v.provider}</td>
                        <td className="px-4 py-2 text-right">{v.runs}</td>
                        <td className="px-4 py-2 text-right">{num(v.tokens)}</td>
                        <td className="px-4 py-2 text-right">{usd(v.costUsd)}</td>
                        <td className="px-4 py-2"><div className="h-1.5 w-24 rounded bg-white/10"><div className="h-full rounded bg-indigo-400" style={{ width: `${share}%` }} /></div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {settings && (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="flex items-center gap-2 font-medium"><Route className="h-4 w-4" />Router settings</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => setSettings({ ...settings, mode: m.id })}
                className={clsx('rounded-lg border p-3 text-left', settings.mode === m.id ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/10 hover:bg-white/5')}>
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-xs text-white/40">{m.hint}</div>
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {(['simple', 'standard', 'complex'] as RouterTier[]).map((t) => (
              <div key={t} className="space-y-2 rounded-lg border border-white/10 p-3">
                <div className="text-xs uppercase tracking-wide text-white/50">{t} tier</div>
                <input value={settings.tiers[t].provider} placeholder="provider"
                  onChange={(e) => setSettings({ ...settings, tiers: { ...settings.tiers, [t]: { ...settings.tiers[t], provider: e.target.value } } })}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm" />
                <input value={settings.tiers[t].model} placeholder="model"
                  onChange={(e) => setSettings({ ...settings, tiers: { ...settings.tiers, [t]: { ...settings.tiers[t], model: e.target.value } } })}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs" />
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="text-white/60">Monthly budget cap (USD, 0 = none)</span>
              <input type="number" min={0} step="0.01" value={settings.monthlyBudgetUsd}
                onChange={(e) => setSettings({ ...settings, monthlyBudgetUsd: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5" />
            </label>
            <label className="text-sm">
              <span className="text-white/60">Alert threshold: {settings.alertThresholdPct}%</span>
              <input type="range" min={10} max={100} step={5} value={settings.alertThresholdPct}
                onChange={(e) => setSettings({ ...settings, alertThresholdPct: Number(e.target.value) })}
                className="mt-3 w-full accent-indigo-500" />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => void save()} disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save settings
            </button>
            {msg && <span className="text-xs text-white/50">{msg}</span>}
          </div>

          <div className="space-y-2 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2 text-sm text-white/60"><Sparkles className="h-4 w-4" />Test the router</div>
            <div className="flex gap-2">
              <input value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void runPreview()}
                placeholder="Type a prompt to see which model it would use…"
                className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm" />
              <button onClick={() => void runPreview()} className="rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15">Route</button>
            </div>
            {decision && (
              <div className="rounded-lg bg-black/30 p-3 text-xs text-white/70">
                <span className="font-medium text-white">{decision.tier}</span> (score {decision.score}) → <span className="font-mono">{decision.provider}/{decision.model}</span>
                {decision.reasons.length > 0 && <div className="mt-1 text-white/40">{decision.reasons.join(' · ')}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
