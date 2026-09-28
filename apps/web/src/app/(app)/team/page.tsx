'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { SpecialistAgentRow } from '@openagents/sdk'
import { Bot, Plus, Trash2, Power } from 'lucide-react'
import clsx from 'clsx'

const ROLES = ['researcher', 'coder', 'writer', 'analyst', 'ops', 'custom']

export default function TeamPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [agents, setAgents] = useState<SpecialistAgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [role, setRole] = useState('researcher')
  const [persona, setPersona] = useState('')
  const [budget, setBudget] = useState('1')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setAgents(await sdk.specialists.list())
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load specialists')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  async function handleCreate() {
    if (!name.trim()) { addToast('warning', 'Name your specialist first.'); return }
    setCreating(true)
    try {
      await sdk.specialists.create({ name: name.trim(), role, personaPrompt: persona.trim(), monthlyBudgetUsd: Number(budget) || 1 })
      setName(''); setPersona('')
      addToast('success', `@${name.trim()} joined the team.`)
      await load()
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to create specialist')
    } finally {
      setCreating(false)
    }
  }

  async function toggle(agent: SpecialistAgentRow) {
    await sdk.specialists.update(agent.id, { enabled: !agent.enabled }).then(load).catch((err: any) => addToast('error', err?.message))
  }

  async function remove(agent: SpecialistAgentRow) {
    if (!confirm(`Remove @${agent.name}?`)) return
    await sdk.specialists.remove(agent.id).then(load).catch((err: any) => addToast('error', err?.message))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="oa-gradient-text text-2xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-slate-500">Named specialist agents with their own persona and monthly budget. Ask your main agent to delegate to them.</p>
      </div>

      <div className="oa-card-elevated rounded-2xl p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Aria)" className="oa-input-surface h-10 rounded-lg px-3 text-sm outline-none" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="oa-input-surface h-10 rounded-lg px-3 text-sm outline-none">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" min={0.1} step={0.1} placeholder="Budget $" className="oa-input-surface h-10 rounded-lg px-3 text-sm outline-none" />
          <button type="button" onClick={() => void handleCreate()} disabled={creating} className="oa-send-button h-10 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold">
            <Plus size={15} /> {creating ? 'Hiring…' : 'Add specialist'}
          </button>
        </div>
        <textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={2} placeholder={'Persona prompt — how should this agent behave? (e.g. "Deep-dive researcher. Always cite sources.")'} className="oa-input-surface mt-3 w-full rounded-lg px-3 py-2 text-sm outline-none" />
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading team…</p>
      ) : agents.length === 0 ? (
        <div className="oa-card-elevated rounded-2xl p-10 text-center">
          <Bot className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No specialists yet. Hire your first teammate above.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((agent) => {
            const pct = Math.min(100, Math.round((agent.spentUsd / Math.max(0.01, agent.monthlyBudgetUsd)) * 100))
            return (
              <div key={agent.id} className="oa-hover-card oa-card-elevated rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">@{agent.name}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-400">{agent.role}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => void toggle(agent)} title={agent.enabled ? 'Disable' : 'Enable'} className={clsx('inline-flex h-8 w-8 items-center justify-center rounded-lg transition', agent.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100')}>
                      <Power size={14} />
                    </button>
                    <button type="button" onClick={() => void remove(agent)} title="Remove" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {agent.personaPrompt && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{agent.personaPrompt}</p>}
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={clsx('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">${agent.spentUsd.toFixed(3)} / ${agent.monthlyBudgetUsd} this month{agent.emailAlias ? ` · ${agent.emailAlias}` : ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
