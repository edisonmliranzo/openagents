'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { KeyStatus, KeyRotationEvent } from '@openagents/sdk'
import { KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'

export default function KeysPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [history, setHistory] = useState<KeyRotationEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [rotateData, setRotateData] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [selfTest, setSelfTest] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, h] = await Promise.all([sdk.keys.status(), sdk.keys.history()])
      setStatus(s)
      setHistory(h)
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Failed to load key status' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const rotate = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const ev = await sdk.keys.rotate(rotateData)
      setMsg({ ok: true, text: `Master key v${ev.fromMasterVersion} → v${ev.toMasterVersion}; re-wrapped ${ev.rewrappedKeys} data key(s) for ${ev.rewrappedUsers} user(s).` })
      setConfirming(false)
      await load()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Rotation failed (owner role required)' })
    } finally {
      setBusy(false)
    }
  }

  const runSelfTest = async () => {
    try {
      const sample = `openagents-selftest-${Date.now()}`
      const { value: enc } = await sdk.keys.encrypt(sample)
      const { value: dec } = await sdk.keys.decrypt(enc)
      setSelfTest(dec === sample ? `OK — ${enc.slice(0, 24)}… round-tripped` : 'Mismatch!')
    } catch (e: any) {
      setSelfTest(e?.message ?? 'Self-test failed')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"><KeyRound size={16} /></span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Encryption Keys</h1>
          <p className="text-sm text-slate-500">Per-user envelope encryption (BYOK/KMS-ready). Rotating re-wraps keys; existing encrypted data keeps decrypting.</p>
        </div>
      </div>

      {msg && <div className={`rounded-xl border px-4 py-2 text-sm ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <section className="oa-float-card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck size={15} /> Key status</h2>
        {loading || !status ? (
          <Loader2 className="animate-spin text-slate-400" size={18} />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div><dt className="text-slate-500">Provider</dt><dd className="font-medium">{status.provider.id}{status.provider.byok ? ' (BYOK)' : ''}</dd></div>
              <div><dt className="text-slate-500">Master key</dt><dd className="font-medium">v{status.masterKeyVersion}</dd></div>
              <div><dt className="text-slate-500">Your data key</dt><dd className="font-medium">v{status.dataKeyVersion}</dd></div>
              <div><dt className="text-slate-500">Format</dt><dd className="font-medium">{status.format.current} (+{status.format.legacy.join(', ')})</dd></div>
            </dl>
            <p className="text-xs text-slate-500">Key source: {status.provider.source}. Available providers: {status.availableProviders.join(', ')}.</p>
            <div className="flex items-center gap-3">
              <button onClick={runSelfTest} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">Run encrypt/decrypt self-test</button>
              {selfTest && <span className="text-xs text-slate-600">{selfTest}</span>}
            </div>
          </>
        )}
      </section>

      <section className="oa-float-card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><RefreshCw size={15} /> Rotate keys <span className="text-xs font-normal text-slate-500">(owner only)</span></h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={rotateData} onChange={(e) => setRotateData(e.target.checked)} />
          Also create a new data-key version (new writes use it; old versions are kept for decryption)
        </label>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">Rotate…</button>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span>This re-wraps every user&apos;s data keys under a new master key version. Continue?</span>
            <button disabled={busy} onClick={rotate} className="rounded-lg bg-amber-600 px-3 py-1.5 text-white disabled:opacity-50">{busy ? 'Rotating…' : 'Confirm rotate'}</button>
            <button disabled={busy} onClick={() => setConfirming(false)} className="rounded-lg border border-amber-300 px-3 py-1.5">Cancel</button>
          </div>
        )}
      </section>

      <section className="oa-float-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Rotation history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No rotations yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-1">When</th><th>Master</th><th>Keys re-wrapped</th><th>Users</th><th>New data keys</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="py-1.5">{new Date(h.at).toLocaleString()}</td>
                  <td>v{h.fromMasterVersion} → v{h.toMasterVersion}</td>
                  <td>{h.rewrappedKeys}</td>
                  <td>{h.rewrappedUsers}</td>
                  <td>{h.newDataKeys ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  )
}
