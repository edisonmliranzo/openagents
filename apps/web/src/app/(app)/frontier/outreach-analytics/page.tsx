'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { OutreachAnalytics, OutreachChannel, OutreachItem, OutreachRateRow, OutreachStatus } from '@openagents/sdk'
import { BarChart3, Loader2, Trophy } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const CHANNELS: OutreachChannel[] = ['comment', 'reply', 'dm', 'email', 'sms', 'whatsapp']
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function RateTable({ rows, label }: { rows: OutreachRateRow[]; label: string }) {
  if (!rows.length) return <p className="text-xs text-[var(--muted)]">No data yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[var(--muted)]">
          <tr>
            <th className="py-1 pr-3">{label}</th><th className="pr-3">Sent</th><th className="pr-3">Replied</th><th className="pr-3">Booked</th>
            <th className="pr-3">Converted</th><th className="pr-3">Reply rate</th><th className="pr-3">Conv. rate</th><th className="pr-3">Revenue</th><th>Rev/sent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-black/5">
              <td className="py-1.5 pr-3 font-medium text-[var(--tone-strong)]">{r.key.replace('::', ' · ')}</td>
              <td className="pr-3">{r.sent}</td><td className="pr-3">{r.replied}</td><td className="pr-3">{r.booked}</td><td className="pr-3">{r.converted}</td>
              <td className="pr-3">{pct(r.replyRate)}</td><td className="pr-3">{pct(r.conversionRate)}</td><td className="pr-3">{r.revenue.toFixed(2)}</td><td>{r.revenuePerSent.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function OutreachAnalyticsPage() {
  const [data, setData] = useState<OutreachAnalytics | null>(null)
  const [items, setItems] = useState<OutreachItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState('')
  const [form, setForm] = useState({ channel: 'email' as OutreachChannel, hook: '', variant: 'A', recipient: '', variantText: '' })
  const [revenue, setRevenue] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const d = days ? Number(days) : undefined
      const [a, l] = await Promise.all([sdk.growthVoice.outreach.analytics(d), sdk.growthVoice.outreach.list({ limit: 50 })])
      setData(a)
      setItems(l)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load analytics')
    }
  }, [days])

  useEffect(() => { void load() }, [load])

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try { await fn(); await load() } catch (e: any) { setError(e?.message ?? 'Action failed') } finally { setBusy(null) }
  }

  const track = () =>
    run('track', async () => {
      await sdk.growthVoice.outreach.track({
        channel: form.channel, hook: form.hook, variant: form.variant || 'A', recipient: form.recipient || undefined, variantText: form.variantText || undefined,
      })
      setForm((f) => ({ ...f, recipient: '' }))
    })

  const advance = (id: string, status: OutreachStatus) =>
    run(id + status, () => sdk.growthVoice.outreach.advance(id, status, status === 'converted' && revenue[id] ? Number(revenue[id]) : undefined))

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"><BarChart3 size={16} /></span>
        <div>
          <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Closed-Loop Outreach Analytics</h1>
          <p className="text-xs text-[var(--muted)]">Track every outreach item from sent → replied → booked → converted, compare channels and hooks, and promote A/B winners.</p>
        </div>
        <select className="oa-input-surface ml-auto h-9 rounded-xl px-2 text-xs" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
        </select>
      </header>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {data && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[['Sent', data.totals.sent], ['Reply rate', pct(data.totals.replyRate)], ['Booked', data.totals.booked], ['Conversion', pct(data.totals.conversionRate)], ['Revenue', data.totals.revenue.toFixed(2)]].map(([k, v]) => (
            <div key={String(k)} className="oa-float-card p-4"><p className="text-[11px] text-[var(--muted)]">{k}</p><p className="text-xl font-semibold text-[var(--tone-strong)]">{v}</p></div>
          ))}
        </section>
      )}

      <section className="oa-float-card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-[var(--tone-strong)]">Log outreach</h2>
        <div className="grid gap-2 md:grid-cols-5">
          <select className={inputCls} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as OutreachChannel })}>
            {CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className={inputCls} placeholder="Hook / template" value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} />
          <input className={inputCls} placeholder="Variant (A, B…)" value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} />
          <input className={inputCls} placeholder="Recipient (email/phone/@handle)" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
          <button className={btnCls} disabled={!form.hook.trim() || busy === 'track'} onClick={track}>{busy === 'track' ? <Loader2 className="mx-auto animate-spin" size={14} /> : 'Log sent'}</button>
        </div>
        <input className={inputCls} placeholder="Message text for this variant (optional; used when promoting a winner)" value={form.variantText} onChange={(e) => setForm({ ...form, variantText: e.target.value })} />
      </section>

      {data && data.experiments.length > 0 && (
        <section className="oa-float-card space-y-3 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tone-strong)]"><Trophy size={14} /> A/B experiments</h2>
          {data.experiments.map((e) => (
            <div key={e.hook} className="rounded-xl border border-black/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--tone-strong)]">{e.hook}</span>
                <span className="text-xs text-[var(--muted)]">{e.verdict}</span>
                {e.promoted && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">Promoted: {e.promoted.variant}</span>}
                <button
                  className="oa-accent-button ml-auto h-8 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-40"
                  disabled={!e.winner || busy === 'p' + e.hook}
                  onClick={() => run('p' + e.hook, () => sdk.growthVoice.outreach.promote(e.hook, e.winner ?? undefined))}
                >
                  {e.winner ? `Promote ${e.winner}` : 'No winner yet'}
                </button>
              </div>
              <div className="mt-2">
                <RateTable label="Variant" rows={e.variants} />
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Leader {e.leader} · p={e.pValue} · confidence {(e.confidence * 100).toFixed(1)}%</p>
            </div>
          ))}
        </section>
      )}

      {data && (
        <div className="grid gap-5 md:grid-cols-2">
          <section className="oa-float-card p-5"><h2 className="mb-2 text-sm font-semibold text-[var(--tone-strong)]">By channel</h2><RateTable label="Channel" rows={data.byChannel} /></section>
          <section className="oa-float-card p-5"><h2 className="mb-2 text-sm font-semibold text-[var(--tone-strong)]">By hook / template</h2><RateTable label="Hook" rows={data.byHook} /></section>
        </div>
      )}

      <section className="oa-float-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-[var(--tone-strong)]">Recent outreach</h2>
        {!items.length && <p className="text-xs text-[var(--muted)]">Nothing logged yet.</p>}
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 px-3 py-2 text-xs">
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white">{i.channel}</span>
              <span className="font-medium text-[var(--tone-strong)]">{i.hook} · {i.variant}</span>
              <span className="text-[var(--muted)]">{i.recipient ?? '—'}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{i.status}{i.revenue ? ` · ${i.revenue}` : ''}</span>
              <span className="ml-auto flex items-center gap-1">
                {i.status !== 'converted' && (
                  <>
                    {i.status === 'sent' && <button className="rounded-lg border px-2 py-1" onClick={() => advance(i.id, 'replied')}>Replied</button>}
                    {(i.status === 'sent' || i.status === 'replied') && <button className="rounded-lg border px-2 py-1" onClick={() => advance(i.id, 'booked')}>Booked</button>}
                    <input className="oa-input-surface h-7 w-16 rounded-lg px-1" placeholder="$ value" value={revenue[i.id] ?? ''} onChange={(e) => setRevenue({ ...revenue, [i.id]: e.target.value })} />
                    <button className="rounded-lg border px-2 py-1" onClick={() => advance(i.id, 'converted')}>Converted</button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
