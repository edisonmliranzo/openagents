'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { ContactBrief, ContactInteraction, ContactStage, GrowthContact } from '@openagents/sdk'
import { BookUser, GitMerge, Loader2, Plus } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const STAGES: ContactStage[] = ['lead', 'contacted', 'engaged', 'meeting', 'customer', 'lost']

export default function ContactMemoryPage() {
  const [contacts, setContacts] = useState<GrowthContact[]>([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ contact: GrowthContact; timeline: ContactInteraction[] } | null>(null)
  const [brief, setBrief] = useState<ContactBrief | null>(null)
  const [dupes, setDupes] = useState<{ contacts: GrowthContact[] }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nc, setNc] = useState({ name: '', email: '', phone: '', handle: '' })
  const [note, setNote] = useState({ channel: 'note', direction: 'note' as 'inbound' | 'outbound' | 'note', text: '' })
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [mergeIds, setMergeIds] = useState<string[]>([])

  const loadList = useCallback(async () => {
    try {
      const [l, d] = await Promise.all([sdk.growthVoice.contacts.list({ q }), sdk.growthVoice.contacts.duplicates()])
      setContacts(l)
      setDupes(d)
      setError(null)
    } catch (e: any) { setError(e?.message ?? 'Failed to load contacts') }
  }, [q])

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await sdk.growthVoice.contacts.get(id)
      setDetail(d)
      setTags(d.contact.tags.join(', '))
      setNotes(d.contact.notes)
      setBrief(null)
    } catch (e: any) { setError(e?.message ?? 'Failed to load contact') }
  }, [])

  useEffect(() => { void loadList() }, [loadList])
  useEffect(() => { if (selected) void loadDetail(selected); else setDetail(null) }, [selected, loadDetail])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); await loadList(); if (selected) await loadDetail(selected) } catch (e: any) { setError(e?.message ?? 'Action failed') } finally { setBusy(false) }
  }

  const create = () => act(async () => {
    const c = await sdk.growthVoice.contacts.create({ name: nc.name || undefined, email: nc.email || undefined, phone: nc.phone || undefined, handle: nc.handle || undefined })
    setNc({ name: '', email: '', phone: '', handle: '' })
    setSelected(c.id)
  })

  const doMerge = (primaryId: string, ids: string[]) => act(async () => {
    const merged = await sdk.growthVoice.contacts.merge(primaryId, ids)
    setMergeIds([])
    setSelected(merged.id)
  })

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-6 md:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <header className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"><BookUser size={16} /></span>
          <div>
            <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Unified Contact Memory</h1>
            <p className="text-xs text-[var(--muted)]">One record per person across email, phone and social handles.</p>
          </div>
        </header>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <input className={inputCls} placeholder="Search contacts…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="oa-float-card space-y-2 p-3">
          <p className="text-xs font-semibold text-[var(--tone-strong)]">New contact</p>
          {(['name', 'email', 'phone', 'handle'] as const).map((k) => (
            <input key={k} className={inputCls} placeholder={k} value={nc[k]} onChange={(e) => setNc({ ...nc, [k]: e.target.value })} />
          ))}
          <button className={btnCls + ' w-full'} disabled={busy || !(nc.name || nc.email || nc.phone || nc.handle)} onClick={create}><Plus size={14} className="mr-1 inline" />Add</button>
        </div>
        <div className="oa-float-card max-h-[420px] divide-y divide-black/5 overflow-y-auto">
          {!contacts.length && <p className="p-3 text-xs text-[var(--muted)]">No contacts yet.</p>}
          {contacts.map((c) => (
            <div key={c.id} className={`flex items-start gap-2 p-3 text-xs ${selected === c.id ? 'bg-slate-100' : ''}`}>
              <input type="checkbox" className="mt-1" checked={mergeIds.includes(c.id)} onChange={(e) => setMergeIds(e.target.checked ? [...mergeIds, c.id] : mergeIds.filter((x) => x !== c.id))} />
              <button className="flex-1 text-left" onClick={() => setSelected(c.id)}>
                <p className="font-medium text-[var(--tone-strong)]">{c.name}</p>
                <p className="text-[var(--muted)]">{[...c.emails, ...c.phones, ...c.handles.map((h) => '@' + h.handle)].slice(0, 2).join(' · ') || '—'}</p>
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px]">{c.stage}</span>
              </button>
            </div>
          ))}
        </div>
        {mergeIds.length >= 2 && (
          <button className={btnCls + ' w-full'} disabled={busy} onClick={() => doMerge(mergeIds[0], mergeIds.slice(1))}>
            <GitMerge size={14} className="mr-1 inline" />Merge {mergeIds.length} selected into first
          </button>
        )}
        {dupes.length > 0 && (
          <div className="oa-float-card space-y-2 p-3">
            <p className="text-xs font-semibold text-[var(--tone-strong)]">Possible duplicates</p>
            {dupes.map((g, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1">{g.contacts.map((c) => c.name).join(' = ')}</span>
                <button className="rounded-lg border px-2 py-1" disabled={busy} onClick={() => doMerge(g.contacts[0].id, g.contacts.slice(1).map((c) => c.id))}>Merge</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {!detail && <p className="oa-float-card p-6 text-sm text-[var(--muted)]">Select a contact to see their cross-channel timeline.</p>}
        {detail && (
          <>
            <section className="oa-float-card space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--tone-strong)]">{detail.contact.name}</h2>
                <select className="oa-input-surface h-8 rounded-lg px-2 text-xs" value={detail.contact.stage} onChange={(e) => act(() => sdk.growthVoice.contacts.update(detail.contact.id, { stage: e.target.value as ContactStage }))}>
                  {STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <button className="ml-auto rounded-lg border px-3 py-1.5 text-xs" onClick={() => act(async () => setBrief(await sdk.growthVoice.contacts.brief(detail.contact.id)))}>Context brief</button>
                <button className="rounded-lg border px-3 py-1.5 text-xs text-red-600" onClick={() => act(async () => { await sdk.growthVoice.contacts.remove(detail.contact.id); setSelected(null) })}>Delete</button>
              </div>
              <p className="text-xs text-[var(--muted)]">{[...detail.contact.emails, ...detail.contact.phones, ...detail.contact.handles.map((h) => (h.platform ? h.platform + ':' : '') + '@' + h.handle)].join(' · ') || 'No identifiers'}</p>
              <div className="grid gap-2 md:grid-cols-2">
                <input className={inputCls} placeholder="tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
                <button className={btnCls} disabled={busy} onClick={() => act(() => sdk.growthVoice.contacts.update(detail.contact.id, { tags: tags.split(',').map((t) => t.trim()).filter(Boolean), notes }))}>Save tags & notes</button>
              </div>
              <textarea className="oa-input-surface min-h-[70px] w-full rounded-xl p-3 text-sm outline-none" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </section>

            {brief && (
              <section className="oa-float-card p-5">
                <h3 className="mb-2 text-sm font-semibold text-[var(--tone-strong)]">Agent context brief</h3>
                <pre className="whitespace-pre-wrap text-xs text-[var(--tone-strong)]">{brief.summary}</pre>
                {brief.recentInteractions.length > 0 && <pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--muted)]">{brief.recentInteractions.join('\n')}</pre>}
              </section>
            )}

            <section className="oa-float-card space-y-3 p-5">
              <h3 className="text-sm font-semibold text-[var(--tone-strong)]">Timeline</h3>
              <div className="flex flex-wrap gap-2">
                <input className="oa-input-surface h-9 w-28 rounded-xl px-2 text-xs" placeholder="channel" value={note.channel} onChange={(e) => setNote({ ...note, channel: e.target.value })} />
                <select className="oa-input-surface h-9 rounded-xl px-2 text-xs" value={note.direction} onChange={(e) => setNote({ ...note, direction: e.target.value as any })}>
                  <option>note</option><option>inbound</option><option>outbound</option>
                </select>
                <input className="oa-input-surface h-9 min-w-[200px] flex-1 rounded-xl px-3 text-xs" placeholder="Log an interaction…" value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
                <button className="oa-accent-button h-9 rounded-xl px-3 text-xs font-semibold text-white" disabled={busy || !note.text.trim() || !note.channel.trim()} onClick={() => act(async () => { await sdk.growthVoice.contacts.addInteraction(detail.contact.id, note); setNote({ ...note, text: '' }) })}>
                  {busy ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
                </button>
              </div>
              {!detail.timeline.length && <p className="text-xs text-[var(--muted)]">No interactions yet.</p>}
              <ol className="space-y-2 border-l border-black/10 pl-4">
                {[...detail.timeline].reverse().map((t) => (
                  <li key={t.id} className="text-xs">
                    <p className="text-[var(--muted)]">{new Date(t.at).toLocaleString()} · <span className="font-medium">{t.channel}</span> · {t.direction}</p>
                    <p className="text-[var(--tone-strong)]">{t.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
