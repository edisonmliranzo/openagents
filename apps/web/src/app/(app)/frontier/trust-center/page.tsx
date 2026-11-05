'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { TrustDataRequest, TrustPosture, TrustRetention, TrustSubprocessor } from '@openagents/sdk'
import { CheckCircle2, Download, FileText, Loader2, ShieldCheck, Trash2 } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const ghostCls = 'h-9 rounded-xl border border-black/10 px-3 text-xs font-semibold text-[var(--tone-strong)] transition hover:bg-black/5 disabled:opacity-50'
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="oa-float-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--tone-strong)]"><Icon size={14} />{title}</h2>
      {children}
    </section>
  )
}

function saveFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function TrustCenterPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [posture, setPosture] = useState<TrustPosture | null>(null)
  const [subs, setSubs] = useState<{ note: string; subprocessors: TrustSubprocessor[] } | null>(null)
  const [retention, setRetention] = useState<TrustRetention | null>(null)
  const [days, setDays] = useState({ conversationsDays: '', auditLogDays: '', memoriesDays: '' })
  const [requests, setRequests] = useState<TrustDataRequest[]>([])
  const [customer, setCustomer] = useState('')
  const [dpa, setDpa] = useState<{ filename: string; markdown: string } | null>(null)
  const [password, setPassword] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [p, s, r, rq] = await Promise.all([sdk.trustCenter.posture(), sdk.trustCenter.subprocessors(), sdk.trustCenter.retention(), sdk.trustCenter.requests()])
      setPosture(p); setSubs(s); setRetention(r); setRequests(rq)
      setDays({ conversationsDays: r.conversationsDays?.toString() ?? '', auditLogDays: r.auditLogDays?.toString() ?? '', memoriesDays: r.memoriesDays?.toString() ?? '' })
    } catch (e) {
      addToast('error', errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try { await fn() } catch (e) { addToast('error', errMsg(e)) } finally { setBusy(null) }
  }

  const num = (v: string) => (v.trim() ? Math.max(1, Math.round(Number(v))) : null)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-8">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><ShieldCheck size={18} /></span>
        <div>
          <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Trust Center</h1>
          <p className="text-sm text-[var(--muted)]">Security posture, subprocessors, retention, a downloadable DPA, and self-serve data requests. Only controls that exist in the code are listed.</p>
        </div>
      </header>

      {loading && <Loader2 className="animate-spin text-[var(--muted)]" />}

      {posture && (
        <Card title="Security posture" icon={ShieldCheck}>
          <div className="space-y-3">
            {posture.controls.map((c) => (
              <div key={c.id} className="flex gap-2 text-sm">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-semibold text-[var(--tone-strong)]">{c.title}</p>
                  <p className="text-xs text-[var(--muted)]">{c.scope}</p>
                  <p className="font-mono text-[10px] text-[var(--muted)]">{c.evidence}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">What we do not claim</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">{posture.notClaimed.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </Card>
      )}

      {subs && (
        <Card title="Subprocessors" icon={FileText}>
          <p className="mb-2 text-xs text-[var(--muted)]">{subs.note}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[var(--muted)]"><tr><th className="py-1 pr-3">Name</th><th className="pr-3">Purpose</th><th className="pr-3">Data</th><th>Status</th></tr></thead>
              <tbody>
                {subs.subprocessors.map((s) => (
                  <tr key={s.name} className="border-t border-black/5">
                    <td className="py-1.5 pr-3 font-semibold text-[var(--tone-strong)]">{s.name}</td><td className="pr-3">{s.purpose}</td><td className="pr-3">{s.data}</td>
                    <td><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-black/5 text-[var(--muted)]'}`}>{s.active ? 'enabled' : 'not configured'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {retention && (
        <Card title="Data retention" icon={Trash2}>
          <div className="grid gap-3 md:grid-cols-3">
            {([['conversationsDays', 'Conversations (days)'], ['auditLogDays', 'Audit log (days)'], ['memoriesDays', 'Memories (days)']] as const).map(([k, label]) => (
              <label key={k} className="text-xs text-[var(--muted)]">{label} {retention.enforced[k] ? <b className="text-emerald-700">· enforced on purge</b> : <b className="text-amber-700">· preference only</b>}
                <input className={inputCls} type="number" min="1" max="3650" placeholder="Keep indefinitely" value={days[k]} onChange={(e) => setDays({ ...days, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btnCls} disabled={busy === 'ret'} onClick={() => run('ret', async () => { setRetention(await sdk.trustCenter.setRetention({ conversationsDays: num(days.conversationsDays), auditLogDays: num(days.auditLogDays), memoriesDays: num(days.memoriesDays) })); addToast('success', 'Retention saved') })}>Save</button>
            <button className={ghostCls} disabled={busy === 'dry'} onClick={() => run('dry', async () => { const r = await sdk.trustCenter.applyRetention(false); addToast('info', `Dry run: ${r.matched} conversation(s) older than the window.`) })}>Preview purge</button>
            <button className={ghostCls} disabled={busy === 'purge'} onClick={() => { if (!window.confirm('Permanently delete conversations older than the saved retention window?')) return; void run('purge', async () => { const r = await sdk.trustCenter.applyRetention(true); addToast('success', `Deleted ${r.deleted} conversation(s).`) }) }}>Purge now</button>
          </div>
        </Card>
      )}

      <Card title="Data Processing Addendum" icon={FileText}>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} flex-1`} placeholder="Customer legal name" value={customer} maxLength={120} onChange={(e) => setCustomer(e.target.value)} />
          <button className={btnCls} disabled={!customer.trim() || busy === 'dpa'} onClick={() => run('dpa', async () => setDpa(await sdk.trustCenter.dpa(customer.trim())))}>Generate</button>
          {dpa && <button className={ghostCls} onClick={() => saveFile(dpa.filename, dpa.markdown, 'text/markdown')}><Download size={12} className="mr-1 inline" />Download .md</button>}
        </div>
        {dpa && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-black/5 p-3 text-xs">{dpa.markdown}</pre>}
      </Card>

      <Card title="Data requests" icon={Download}>
        <div className="flex flex-wrap gap-2">
          <button className={btnCls} disabled={busy === 'exp'} onClick={() => run('exp', async () => { const r = await sdk.trustCenter.createRequest('export'); const bundle = await sdk.trustCenter.downloadExport(r.id); saveFile(`openagents-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2), 'application/json'); addToast('success', 'Export downloaded'); await load() })}>Export my data</button>
          <button className={ghostCls} disabled={busy === 'del'} onClick={() => run('del', async () => { await sdk.trustCenter.createRequest('delete'); addToast('info', 'Deletion requested. Confirm it below with your password.'); await load() })}>Request deletion</button>
        </div>
        <div className="mt-3">
          {requests.length === 0 && <p className="text-sm text-[var(--muted)]">No requests yet.</p>}
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 py-2 text-xs first:border-0">
              <span><b className="uppercase">{r.type}</b> · {r.status.replace('_', ' ')} · {new Date(r.createdAt).toLocaleString()}</span>
              {r.type === 'export' && r.status === 'completed' && (
                <button className={ghostCls} onClick={() => run(`dl-${r.id}`, async () => { saveFile(`openagents-export-${r.createdAt.slice(0, 10)}.json`, JSON.stringify(await sdk.trustCenter.downloadExport(r.id), null, 2), 'application/json') })}>Download again</button>
              )}
              {r.type === 'delete' && r.status === 'pending_confirmation' && (
                <span className="flex gap-2">
                  <input type="password" className="oa-input-surface h-8 w-40 rounded-lg px-2 text-xs" placeholder="Password" value={password[r.id] ?? ''} onChange={(e) => setPassword({ ...password, [r.id]: e.target.value })} />
                  <button className="h-8 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={!password[r.id] || busy === `cf-${r.id}`} onClick={() => { if (!window.confirm('This permanently deletes your data and cannot be undone. Continue?')) return; void run(`cf-${r.id}`, async () => { await sdk.trustCenter.confirmDelete(r.id, password[r.id]); setPreview('Your data has been deleted.'); await load() }) }}>Confirm delete</button>
                </span>
              )}
            </div>
          ))}
          {preview && <p className="mt-2 text-sm font-semibold text-red-700">{preview}</p>}
        </div>
      </Card>
    </div>
  )
}
