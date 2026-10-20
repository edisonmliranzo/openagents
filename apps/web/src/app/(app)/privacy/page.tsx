'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import {
  AlertOctagon,
  Download,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  Server,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Unlock,
} from 'lucide-react'

interface PrivacySettings {
  localOnly: boolean
  localModel?: string
  sensitiveMemoryCount?: number
}

interface PrivacyMemoryRow {
  id: string
  type: string
  preview: string
  sensitive: boolean
  updatedAt: string
}

export default function PrivacyPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [settings, setSettings] = useState<PrivacySettings>({ localOnly: false, localModel: 'llama3.2' })
  const [memories, setMemories] = useState<PrivacyMemoryRow[]>([])
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        sdk.client.get<PrivacySettings>('/api/v1/privacy/settings'),
        sdk.client.get<PrivacyMemoryRow[]>('/api/v1/privacy/memories').catch(() => []),
      ])
      setSettings(s)
      setMemories(m)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to load privacy vault')
    }
  }, [addToast])

  useEffect(() => {
    void load()
  }, [load])

  const saveSettings = async (patch: Partial<PrivacySettings>) => {
    setBusy('settings')
    try {
      const updated = await sdk.client.put<PrivacySettings>('/api/v1/privacy/settings', {
        ...settings,
        ...patch,
      })
      setSettings(updated)
      addToast('success', 'Privacy settings updated')
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to update settings')
    } finally {
      setBusy(null)
    }
  }

  const toggleSensitive = async (row: PrivacyMemoryRow) => {
    setBusy(row.id)
    try {
      await sdk.client.put(`/api/v1/privacy/memories/${encodeURIComponent(row.id)}/sensitive`, {
        sensitive: !row.sensitive,
      })
      await load()
    } catch (e: any) {
      addToast('error', e?.message ?? 'Failed to toggle encryption')
    } finally {
      setBusy(null)
    }
  }

  const revealMemory = async (id: string) => {
    setBusy(`rev-${id}`)
    try {
      const res = await sdk.client.get<{ id: string; content: string | null }>(
        `/api/v1/privacy/memories/${encodeURIComponent(id)}/reveal`,
      )
      if (res.content != null) {
        setRevealed((prev) => ({ ...prev, [id]: res.content! }))
      }
    } catch (e: any) {
      addToast('error', e?.message ?? 'Reveal failed')
    } finally {
      setBusy(null)
    }
  }

  const downloadExport = async () => {
    setBusy('export')
    try {
      const bundle = await sdk.client.get<Record<string, unknown>>('/api/v1/privacy/export')
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `openagents-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      addToast('success', 'Full data archive downloaded')
    } catch (e: any) {
      addToast('error', e?.message ?? 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteAll = async () => {
    if (!password) return
    setBusy('delete')
    try {
      const res = await sdk.client.post<{ ok: boolean; featureFilesRemoved: number }>(
        '/api/v1/privacy/delete-all',
        { password },
      )
      setPassword('')
      await load()
      addToast('success', `All personal data wiped (${res.featureFilesRemoved} vault files removed)`)
    } catch (e: any) {
      addToast('error', e?.message ?? 'Data wipe failed (verify password)')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="oa-canvas h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5 pb-24">
        <header className="oa-float-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Privacy Vault & Local-Only Mode</h1>
              <p className="text-xs text-[var(--muted)]">
                Pin inference to local Ollama, encrypt sensitive memories at rest with AES-256-GCM, or export/wipe all OpenAgents data.
              </p>
            </div>
          </div>

          <button
            onClick={downloadExport}
            disabled={busy === 'export'}
            className="oa-accent-button flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === 'export' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            1-Click JSON Export
          </button>
        </header>

        <section className="oa-float-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Server size={18} className="mt-0.5 text-slate-700" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--tone-strong)]">Strict Local-Only Inference (Ollama)</h2>
                <p className="text-xs text-[var(--muted)]">
                  When enabled, OpenAgents never sends your prompts or memories to cloud LLM APIs.
                </p>
              </div>
            </div>
            <button
              onClick={() => saveSettings({ localOnly: !settings.localOnly })}
              disabled={busy === 'settings'}
              className="flex items-center gap-2 text-xs font-semibold text-[var(--tone-strong)]"
            >
              {settings.localOnly ? (
                <ToggleRight size={28} className="text-emerald-600" />
              ) : (
                <ToggleLeft size={28} className="text-slate-400" />
              )}
              {settings.localOnly ? 'Local-Only Active' : 'Cloud Allowed'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="text-xs text-[var(--muted)]">Preferred Local Ollama Model:</label>
            <input
              value={settings.localModel ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, localModel: e.target.value }))}
              placeholder="e.g. llama3.2, qwen2.5:14b"
              className="oa-input-surface h-9 rounded-xl px-3 text-xs outline-none"
            />
            <button
              onClick={() => saveSettings({ localModel: settings.localModel })}
              disabled={busy === 'settings'}
              className="h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--tone-strong)] hover:bg-slate-50"
            >
              Save Model
            </button>
          </div>
        </section>

        <section className="oa-float-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-slate-700" />
              <h2 className="text-sm font-semibold text-[var(--tone-strong)]">
                Sensitive Memory Encryption ({settings.sensitiveMemoryCount ?? memories.filter((m) => m.sensitive).length} encrypted)
              </h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
              AES-256-GCM at rest
            </span>
          </div>
          <p className="mb-4 text-xs text-[var(--muted)]">
            Mark memories as sensitive to encrypt them at rest and redact them from cloud LLM prompts unless running in Local-Only mode.
          </p>

          {memories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
              No stored memories yet.
            </div>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {memories.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white/80 px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">
                        {m.type}
                      </span>
                      {m.sensitive && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          <Lock size={10} /> Encrypted
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-[var(--tone-strong)]">
                      {revealed[m.id] ?? m.preview}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {m.sensitive && !revealed[m.id] && (
                      <button
                        onClick={() => void revealMemory(m.id)}
                        disabled={busy === `rev-${m.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-medium hover:bg-slate-50"
                      >
                        <Eye size={12} /> Reveal
                      </button>
                    )}
                    <button
                      onClick={() => void toggleSensitive(m)}
                      disabled={busy === m.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-medium hover:bg-slate-50"
                    >
                      {m.sensitive ? <Unlock size={12} /> : <Lock size={12} />}
                      {m.sensitive ? 'Decrypt' : 'Encrypt'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="oa-float-card border-2 border-rose-500/30 p-5">
          <div className="flex items-start gap-3">
            <AlertOctagon size={18} className="mt-0.5 shrink-0 text-rose-600" />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-rose-700">Nuclear Option · Delete All Personal Data</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Permanently erases all conversations, memories, artifacts, goals, knowledge graphs, and learned lessons. Confirm with your account password.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password to confirm..."
                  className="oa-input-surface h-9 w-64 rounded-xl px-3 text-xs outline-none"
                />
                <button
                  onClick={handleDeleteAll}
                  disabled={busy === 'delete' || !password}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {busy === 'delete' && <Loader2 size={13} className="animate-spin" />}
                  Permanently Wipe My Data
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
