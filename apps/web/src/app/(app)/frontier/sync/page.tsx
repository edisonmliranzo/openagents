'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { SyncStateRow, SyncConflictRow } from '@openagents/sdk'
import { Laptop, Loader2, Lock, RefreshCw, Trash2 } from 'lucide-react'

const ITER = 310000
const CHECK_TEXT = 'openagents-sync-check-v1'
const enc = new TextEncoder()
const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  u.forEach((c) => { s += String.fromCharCode(c) })
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
async function seal(key: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))
  return `${b64(iv)}.${b64(ct)}`
}
async function open(key: CryptoKey, blob: string) {
  const [iv, ct] = blob.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource }, key, unb64(ct) as BufferSource)
  return new TextDecoder().decode(pt)
}

const DEVICE_KEY = 'openagents-sync-device'
const VERSIONS_KEY = 'openagents-sync-versions'
const isSyncedSetting = (k: string) => k.startsWith('openagents') && !k.startsWith('openagents-sync')

export default function SyncPage() {
  const [state, setState] = useState<SyncStateRow | null>(null)
  const [conflicts, setConflicts] = useState<SyncConflictRow[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [deviceName, setDeviceName] = useState('This browser')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [received, setReceived] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([sdk.sync.state(), sdk.sync.conflicts()])
      setState(s)
      setConflicts(c)
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Failed to load sync state' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setDeviceId(localStorage.getItem(DEVICE_KEY))
    void load()
  }, [load])

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ ok: true, text: await fn() })
      await load()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Operation failed' })
    } finally {
      setBusy(false)
    }
  }

  const unlock = () => run(async () => {
    if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters')
    const { keyring } = await sdk.sync.keyring()
    if (!keyring) {
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const k = await deriveKey(passphrase, salt, ITER)
      await sdk.sync.setKeyring({ salt: b64(salt), iterations: ITER, check: await seal(k, CHECK_TEXT) })
      setKey(k)
      return 'Passphrase set. Keep it safe — the server cannot recover it.'
    }
    const k = await deriveKey(passphrase, unb64(keyring.salt), keyring.iterations)
    try {
      if ((await open(k, keyring.check)) !== CHECK_TEXT) throw new Error()
    } catch {
      throw new Error('Wrong passphrase')
    }
    setKey(k)
    return 'Unlocked on this device.'
  })

  const register = () => run(async () => {
    const d = await sdk.sync.registerDevice(deviceName.trim() || 'Browser', 'web')
    localStorage.setItem(DEVICE_KEY, d.id)
    setDeviceId(d.id)
    return `Registered “${d.name}”.`
  })

  const syncNow = () => run(async () => {
    if (!key || !deviceId) throw new Error('Unlock and register this device first')
    const versions: Record<string, number> = JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? '{}')
    // 1. pull remote changes
    const pulled = await sdk.sync.pull(deviceId)
    const got: string[] = []
    for (const r of pulled.records) {
      try {
        const plain = await open(key, r.blob)
        versions[r.key] = r.version
        if (r.key === 'settings') {
          if (!r.deleted) for (const [k, v] of Object.entries(JSON.parse(plain) as Record<string, string>)) if (isSyncedSetting(k)) localStorage.setItem(k, v)
          got.push('settings')
        } else if (r.key.startsWith('memory:')) {
          const m = JSON.parse(plain) as { content: string }
          got.push(`${r.key}: ${m.content.slice(0, 80)}`)
        }
      } catch {
        got.push(`${r.key}: could not decrypt (different passphrase?)`)
      }
    }
    setReceived(got)
    // 2. push local state
    const settings: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (isSyncedSetting(k)) settings[k] = localStorage.getItem(k) ?? ''
    }
    const records = [{ key: 'settings', baseVersion: versions.settings ?? 0, blob: await seal(key, JSON.stringify(settings)) }]
    try {
      for (const m of (await sdk.memory.list()).slice(0, 90)) {
        const rk = `memory:${m.id}`
        records.push({ key: rk, baseVersion: versions[rk] ?? 0, blob: await seal(key, JSON.stringify({ content: m.content, tags: (m as any).tags ?? [] })) })
      }
    } catch { /* memory optional */ }
    const res = await sdk.sync.push(deviceId, records)
    for (const a of res.accepted) versions[a.key] = a.version
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions))
    return `Pulled ${pulled.records.length}, pushed ${res.accepted.length}, ${res.conflicts.length} conflict(s).`
  })

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"><RefreshCw size={16} /></span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Local-First Sync</h1>
          <p className="text-sm text-slate-500">End-to-end encrypted memory &amp; settings sync. Data is encrypted in your browser (AES-GCM, PBKDF2 key); the server only sees ciphertext.</p>
        </div>
      </div>

      {msg && <div className={`rounded-xl border px-4 py-2 text-sm ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <section className="oa-float-card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Lock size={15} /> Passphrase</h2>
        <p className="text-xs text-slate-500">{state?.configured ? 'Enter your sync passphrase to unlock this device.' : 'Choose a sync passphrase (not stored anywhere; losing it means synced data is unrecoverable).'}</p>
        <div className="flex gap-2">
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="Passphrase" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <button disabled={busy || !!key} onClick={unlock} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">{key ? 'Unlocked' : state?.configured ? 'Unlock' : 'Set passphrase'}</button>
        </div>
      </section>

      <section className="oa-float-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Laptop size={15} /> Devices</h2>
          <button disabled={busy || !key || !deviceId} onClick={syncNow} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync now
          </button>
        </div>
        {!deviceId && (
          <div className="flex gap-2">
            <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            <button disabled={busy} onClick={register} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">Register this device</button>
          </div>
        )}
        {loading ? <Loader2 className="animate-spin text-slate-400" size={18} /> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(state?.devices ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-medium">{d.name}</span> {d.id === deviceId && <span className="rounded bg-slate-100 px-1.5 text-xs">this device</span>} {d.revokedAt && <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">revoked</span>}
                  <div className="text-xs text-slate-500">{d.platform} · last seen {new Date(d.lastSeenAt).toLocaleString()} · cursor {d.cursor}</div>
                </div>
                {!d.revokedAt && (
                  <button disabled={busy} onClick={() => run(async () => { await sdk.sync.revokeDevice(d.id); if (d.id === deviceId) { localStorage.removeItem(DEVICE_KEY); setDeviceId(null) } return 'Device revoked.' })} className="flex items-center gap-1 text-xs text-red-600"><Trash2 size={13} /> Revoke</button>
                )}
              </li>
            ))}
            {(state?.devices ?? []).length === 0 && <li className="py-2 text-slate-500">No devices registered.</li>}
          </ul>
        )}
        {state && <p className="text-xs text-slate-500">{state.recordCount} encrypted record(s) on server · seq {state.latestSeq}</p>}
        {received.length > 0 && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>Received:</b><ul className="mt-1 list-disc pl-4">{received.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
      </section>

      <section className="oa-float-card space-y-2 p-5">
        <h2 className="text-sm font-semibold">Conflicts ({conflicts.length})</h2>
        <p className="text-xs text-slate-500">Last writer wins; the overwritten version is kept here so nothing is lost silently.</p>
        {conflicts.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
            <div>
              <code>{c.key}</code>
              <div className="text-xs text-slate-500">v{c.lostVersion} overwritten by v{c.winnerVersion} · {new Date(c.at).toLocaleString()}</div>
            </div>
            <div className="flex gap-2">
              <button disabled={!key} onClick={async () => { try { setMsg({ ok: true, text: `Overwritten value: ${(await open(key!, c.lostBlob)).slice(0, 300)}` }) } catch { setMsg({ ok: false, text: 'Could not decrypt (wrong passphrase)' }) } }} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-40">View</button>
              <button disabled={busy} onClick={() => run(async () => { await sdk.sync.resolveConflict(c.id); return 'Conflict dismissed.' })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">Dismiss</button>
            </div>
          </div>
        ))}
        {conflicts.length === 0 && <p className="text-sm text-slate-500">No unresolved conflicts.</p>}
      </section>
    </div>
  )
}
