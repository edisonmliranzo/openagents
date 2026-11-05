'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { LedgerEntry, LedgerTamperDemo, LedgerVerification } from '@openagents/sdk'
import { Download, Link2, Loader2, ShieldAlert, ShieldCheck, Bug } from 'lucide-react'

const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'

export default function AuditLedgerPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [total, setTotal] = useState(0)
  const [verification, setVerification] = useState<LedgerVerification | null>(null)
  const [demo, setDemo] = useState<LedgerTamperDemo | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const [list, v] = await Promise.all([sdk.governance.auditLedger.list(100, 0), sdk.governance.auditLedger.verify()])
      setEntries(list.entries)
      setTotal(list.total)
      setVerification(v)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load ledger')
    } finally {
      setBusy(false)
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  const exportJson = async () => {
    try {
      const data = await sdk.governance.auditLedger.export()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `openagents-audit-ledger-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Export failed')
    }
  }

  const runDemo = async () => {
    try { setDemo(await sdk.governance.auditLedger.tamperDemo()) }
    catch (e: any) { addToast('error', e?.message ?? 'Demo failed') }
  }

  const addNote = async () => {
    try {
      await sdk.governance.auditLedger.append({ action: 'manual.note', resource: 'ui', data: { at: new Date().toISOString() } })
      await load()
    } catch (e: any) {
      addToast('error', e?.message ?? 'Append failed')
    }
  }

  const ok = verification?.ok ?? true

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Link2 size={18} /></span>
        <div>
          <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Signed Audit Ledger</h1>
          <p className="text-xs text-[var(--muted)]">Tamper-evident SHA-256 hash chain of agent actions, HMAC-signed with a server secret.</p>
        </div>
      </header>

      <section className={`oa-float-card flex flex-wrap items-center justify-between gap-3 p-5 ${ok ? '' : 'border border-red-300'}`}>
        <div className="flex items-center gap-3">
          {ok ? <ShieldCheck className="text-emerald-600" size={28} /> : <ShieldAlert className="text-red-600" size={28} />}
          <div>
            <div className="text-sm font-semibold">{verification ? (ok ? 'Chain intact' : 'Chain BROKEN') : 'Verifying…'}</div>
            {verification && (
              <div className="text-xs text-[var(--muted)]">
                {verification.total} entries · {verification.signed ? 'HMAC-signed' : 'unsigned'}
                {!ok && ` · broken at #${verification.brokenAt}: ${verification.reason}`}
              </div>
            )}
            {verification && <div className="break-all font-mono text-[10px] text-[var(--muted)]">head {verification.headHash}</div>}
          </div>
        </div>
        <div className="flex gap-2">
          <button className={btnCls} onClick={load} disabled={busy}>{busy ? <Loader2 size={14} className="inline animate-spin" /> : 'Verify chain'}</button>
          <button className={btnCls} onClick={exportJson}><Download size={14} className="mr-1 inline" />Export JSON</button>
          <button className={btnCls} onClick={addNote}>Add note</button>
        </div>
      </section>

      <section className="oa-float-card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tone-strong)]"><Bug size={14} />Tamper-detection demo</h2>
        <p className="text-xs text-[var(--muted)]">Alters one entry in an in-memory copy of your chain and re-verifies it. Your stored ledger is never modified.</p>
        <button className={btnCls} onClick={runDemo}>Simulate tampering</button>
        {demo && !demo.available && <p className="text-xs">{demo.message}</p>}
        {demo?.available && demo.before && demo.after && (
          <div className="space-y-1 rounded-xl border border-black/5 p-3 text-xs">
            <div>Before: <b className="text-emerald-700">{demo.before.ok ? 'intact' : 'broken'}</b></div>
            <div>Edited entry #{demo.tamperedSeq}: “{demo.original}” → “{demo.original} (tampered)”</div>
            <div>After: <b className={demo.after.ok ? 'text-emerald-700' : 'text-red-700'}>{demo.after.ok ? 'intact (!)' : `DETECTED — ${demo.after.reason}`}</b></div>
          </div>
        )}
      </section>

      <section className="oa-float-card space-y-2 p-5">
        <h2 className="text-sm font-semibold text-[var(--tone-strong)]">Entries ({total}, newest first)</h2>
        {entries.length === 0 && <p className="text-xs text-[var(--muted)]">No entries yet. Tool calls, policy blocks and audit events are recorded here.</p>}
        {entries.map((e) => (
          <div key={e.seq} className="border-b border-black/5 pb-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[var(--muted)]">#{e.seq}</span>
              <span className="text-[var(--muted)]">{new Date(e.ts).toLocaleString()}</span>
              <b>{e.action}</b>
              <span className="text-[var(--muted)]">{e.resource}</span>
              <span className="text-[var(--muted)]">by {e.actor}</span>
            </div>
            <div className="break-all font-mono text-[10px] text-[var(--muted)]">{e.hash.slice(0, 32)}… ← {e.prevHash.slice(0, 16)}…{e.sig ? ' · signed' : ''}</div>
          </div>
        ))}
      </section>
    </div>
  )
}
