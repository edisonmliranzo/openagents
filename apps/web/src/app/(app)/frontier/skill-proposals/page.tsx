'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { SkillProposalRow } from '@openagents/sdk'
import { Check, Loader2, Pickaxe, Sparkles, X } from 'lucide-react'

export default function SkillProposalsPage() {
  const [rows, setRows] = useState<SkillProposalRow[]>([])
  const [filter, setFilter] = useState<SkillProposalRow['status']>('pending')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [edits, setEdits] = useState<Record<string, { name: string; description: string }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows((await sdk.skillProposals.list()).proposals)
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Failed to load proposals' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (id: string, fn: () => Promise<unknown>, okText: string) => {
    setBusy(id)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: okText })
      await load()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Action failed' })
    } finally {
      setBusy(null)
    }
  }

  const mine = async () => {
    setBusy('mine')
    setMsg(null)
    try {
      const r = await sdk.skillProposals.mine()
      setMsg({ ok: true, text: `Scanned ${r.scanned.messages} messages and ${r.scanned.tasks} tasks; ${r.created} new proposal(s), ${r.updated} updated (patterns need ≥${r.minOccurrences} repeats).` })
      await load()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Mining failed' })
    } finally {
      setBusy(null)
    }
  }

  const visible = rows.filter((r) => r.status === filter)

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"><Sparkles size={16} /></span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Self-Improving Skills</h1>
            <p className="text-sm text-slate-500">Repeated successful tool sequences become skill proposals. Approve to register them in your skill registry.</p>
          </div>
        </div>
        <button onClick={mine} disabled={busy === 'mine'} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {busy === 'mine' ? <Loader2 size={14} className="animate-spin" /> : <Pickaxe size={14} />} Mine patterns
        </button>
      </div>

      {msg && <div className={`rounded-xl border px-4 py-2 text-sm ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <div className="flex gap-2 text-sm">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1 capitalize ${filter === s ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'}`}>
            {s} ({rows.filter((r) => r.status === s).length})
          </button>
        ))}
      </div>

      {loading ? (
        <Loader2 className="animate-spin text-slate-400" size={18} />
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing here. {filter === 'pending' ? 'Run “Mine patterns” after more runs accumulate.' : ''}</p>
      ) : (
        visible.map((p) => {
          const e = edits[p.id] ?? { name: p.name, description: p.description }
          return (
            <section key={p.id} className="oa-float-card space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  {p.status === 'pending' ? (
                    <>
                      <input className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold" value={e.name} maxLength={80} onChange={(ev) => setEdits({ ...edits, [p.id]: { ...e, name: ev.target.value } })} />
                      <textarea className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" rows={2} maxLength={280} value={e.description} onChange={(ev) => setEdits({ ...edits, [p.id]: { ...e, description: ev.target.value } })} />
                    </>
                  ) : (
                    <>
                      <h2 className="text-sm font-semibold">{p.name}</h2>
                      <p className="text-sm text-slate-600">{p.description}</p>
                    </>
                  )}
                  <p className="text-xs text-slate-500">
                    Seen {p.occurrences}× ({p.sources.conversations} sources) · id <code>{p.skillId}</code>
                    {p.registeredVersion ? ` · registered v${p.registeredVersion}` : ''}
                  </p>
                </div>
                {p.status === 'pending' && (
                  <div className="flex shrink-0 gap-2">
                    <button disabled={busy === p.id} onClick={() => act(p.id, () => sdk.skillProposals.approve(p.id, { name: e.name, description: e.description }), 'Approved and registered in the skill registry.')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"><Check size={14} /> Approve</button>
                    <button disabled={busy === p.id} onClick={() => act(p.id, () => sdk.skillProposals.reject(p.id), 'Rejected.')} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"><X size={14} /> Reject</button>
                  </div>
                )}
              </div>
              <ol className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                {p.steps.map((s, i) => (
                  <li key={i} className="flex gap-2"><span className="text-slate-400">{i + 1}.</span><code className="font-medium">{s.tool}</code><span className="text-slate-500">{s.description}</span></li>
                ))}
              </ol>
              {p.examples.length > 0 && <p className="text-xs text-slate-500">Examples: {p.examples.join(' · ')}</p>}
            </section>
          )
        })
      )}
    </div>
  )
}
