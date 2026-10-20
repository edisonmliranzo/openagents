'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, ShieldAlert, X } from 'lucide-react'
import { sdk } from '@/stores/auth'

interface PhoneTurn {
  role: 'caller' | 'agent'
  text: string
  at: string
}

interface PhoneCallRecord {
  id: string
  direction: 'outbound' | 'inbound'
  to: string
  from: string
  goal: string
  status: 'pending_approval' | 'rejected' | 'dialing' | 'in_progress' | 'completed' | 'failed'
  transcript: PhoneTurn[]
  summary?: string
  error?: string
  createdAt: string
}

export default function PhoneAgentPage() {
  const [status, setStatus] = useState<{ configured: boolean; fromNumber: string | null } | null>(null)
  const [calls, setCalls] = useState<PhoneCallRecord[]>([])
  const [selected, setSelected] = useState<PhoneCallRecord | null>(null)
  const [to, setTo] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [st, list] = await Promise.all([
        sdk.client.get<{ configured: boolean; fromNumber: string | null }>('/api/v1/phone/status'),
        sdk.client.get<PhoneCallRecord[]>('/api/v1/phone/calls'),
      ])
      setStatus(st)
      setCalls(list)
      if (selected) {
        const updated = list.find((c) => c.id === selected.id)
        if (updated) setSelected(updated)
      } else if (list.length > 0) {
        setSelected(list[0])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load phone agent')
    }
  }, [selected])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [load])

  async function handleQueueCall(e: React.FormEvent) {
    e.preventDefault()
    if (!to.trim() || !goal.trim()) return
    setBusy(true)
    setError(null)
    try {
      const created = await sdk.client.post<PhoneCallRecord>('/api/v1/phone/calls', {
        to: to.trim(),
        goal: goal.trim(),
      })
      setTo('')
      setGoal('')
      setSelected(created)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Could not queue call')
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove(id: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await sdk.client.post<PhoneCallRecord>(`/api/v1/phone/calls/${id}/approve`, {})
      setSelected(updated)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Approval failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleReject(id: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await sdk.client.post<PhoneCallRecord>(`/api/v1/phone/calls/${id}/reject`, {})
      setSelected(updated)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Reject failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Phone className="h-6 w-6 text-emerald-400" /> Voice Phone Agent
          </h1>
          <p className="text-sm text-slate-400">
            Place and receive real phone calls with your selected Fish Audio voice. Every outbound call requires your approval before dialing.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2 text-xs">
          {status?.configured ? (
            <span className="text-emerald-300">Twilio Active · {status.fromNumber}</span>
          ) : (
            <span className="text-amber-300">Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN &amp; TWILIO_PHONE_NUMBER in .env</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleQueueCall}
        className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 md:grid-cols-4"
      >
        <div>
          <label className="block text-xs text-slate-400">Phone Number (E.164)</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="+14155550123"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-400">Call Objective / Instructions</label>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Book a table for 2 at 7:00 PM this Friday under Alex"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy || !to.trim() || !goal.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <PhoneCall className="h-4 w-4" /> Queue Call (Requires Approval)
          </button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          {calls.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
              No phone calls yet.
            </div>
          ) : (
            calls.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelected(c)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  selected?.id === c.id
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {c.direction === 'inbound' ? (
                      <PhoneIncoming className="h-4 w-4 text-sky-400" />
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-emerald-400" />
                    )}
                    {c.direction === 'inbound' ? c.from : c.to}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                    {c.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">{c.goal}</p>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {selected.direction === 'inbound' ? `Inbound from ${selected.from}` : `Outbound to ${selected.to}`}
                </h2>
                <p className="text-xs text-slate-400">{selected.goal}</p>
              </div>
              {selected.status === 'pending_approval' && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <ShieldAlert className="h-4 w-4 text-amber-300" />
                  <span className="text-xs text-amber-200">Awaiting your approval to dial</span>
                  <button
                    onClick={() => handleApprove(selected.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    <Check className="h-3.5 w-3.5" /> Dial Now
                  </button>
                  <button
                    onClick={() => handleReject(selected.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div>
              )}
            </div>

            {selected.summary && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-100">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">Call Summary</div>
                {selected.summary}
              </div>
            )}

            {selected.error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {selected.error}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Live Transcript</div>
              {selected.transcript.length === 0 ? (
                <p className="text-xs text-slate-500">No speech turns recorded yet.</p>
              ) : (
                selected.transcript.map((t, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl p-3 text-sm ${
                      t.role === 'agent' ? 'bg-emerald-500/10 text-emerald-100' : 'bg-slate-950 text-slate-200'
                    }`}
                  >
                    <span className="mr-2 text-xs font-semibold uppercase text-slate-400">{t.role}:</span>
                    {t.text}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
