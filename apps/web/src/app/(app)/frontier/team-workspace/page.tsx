'use client'

import { useCallback, useEffect, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  TeamActivityEntry,
  TeamDelegation,
  TeamMemoryEntry,
  TeamMemoryScope,
  TeamOverview,
  TeamPendingApproval,
  TeamRisk,
} from '@openagents/sdk'
import { Activity, Brain, Loader2, Mail, ShieldCheck, Trash2, Users } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const areaCls = 'oa-input-surface w-full rounded-xl px-3 py-2 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const ghostCls = 'h-8 rounded-lg border border-black/10 px-3 text-xs font-semibold text-[var(--tone-strong)] transition hover:bg-black/5 disabled:opacity-50'
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

type Tab = 'members' | 'delegation' | 'memory' | 'activity'
type WsLite = { id: string; name: string }

function Card({ title, icon: Icon, children }: { title?: string; icon?: any; children: React.ReactNode }) {
  return (
    <section className="oa-float-card p-5">
      {title && <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--tone-strong)]">{Icon && <Icon size={14} />}{title}</h2>}
      {children}
    </section>
  )
}

export default function TeamWorkspacePage() {
  const addToast = useUIStore((s) => s.addToast)
  const [workspaces, setWorkspaces] = useState<WsLite[]>([])
  const [wsId, setWsId] = useState('')
  const [tab, setTab] = useState<Tab>('members')
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [delegation, setDelegation] = useState<TeamDelegation | null>(null)
  const [pending, setPending] = useState<TeamPendingApproval[]>([])
  const [scopes, setScopes] = useState<TeamMemoryScope[]>([])
  const [scopeId, setScopeId] = useState('general')
  const [entries, setEntries] = useState<TeamMemoryEntry[]>([])
  const [activity, setActivity] = useState<TeamActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [invite, setInvite] = useState({ email: '', role: 'member' as 'admin' | 'member' | 'viewer' })
  const [rule, setRule] = useState({ approverId: '', memberId: '*', tools: '', maxRisk: 'low' as TeamRisk, days: '' })
  const [entry, setEntry] = useState({ title: '', content: '' })
  const [scopeForm, setScopeForm] = useState({ name: '', readRole: 'viewer' as 'admin' | 'member' | 'viewer', writeRole: 'member' as 'admin' | 'member' | 'viewer' })

  const isAdmin = overview?.yourRole === 'owner' || overview?.yourRole === 'admin'

  useEffect(() => {
    sdk.workspaces.list()
      .then((rows) => {
        const list = rows.map((w) => ({ id: w.id, name: w.name }))
        setWorkspaces(list)
        if (list[0]) setWsId(list[0].id)
      })
      .catch((e) => addToast('error', errMsg(e)))
      .finally(() => setLoading(false))
  }, [addToast])

  const load = useCallback(async () => {
    if (!wsId) return
    try {
      const ov = await sdk.teamWorkspace.overview(wsId)
      setOverview(ov)
      const [d, p, sc, act] = await Promise.all([
        sdk.teamWorkspace.delegation(wsId),
        sdk.teamWorkspace.pendingApprovals(wsId).catch(() => []),
        sdk.teamWorkspace.scopes(wsId),
        sdk.teamWorkspace.activity(wsId, 100),
      ])
      setDelegation(d); setPending(p); setScopes(sc); setActivity(act)
      const readable = sc.find((s) => s.id === scopeId && s.canRead) ?? sc.find((s) => s.canRead)
      if (readable) {
        setScopeId(readable.id)
        setEntries(await sdk.teamWorkspace.entries(wsId, readable.id))
      } else setEntries([])
    } catch (e) {
      addToast('error', errMsg(e))
    }
  }, [wsId, scopeId, addToast])

  useEffect(() => { void load() }, [load])

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try { await fn(); addToast('success', ok); await load() } catch (e) { addToast('error', errMsg(e)) } finally { setBusy(null) }
  }

  const eligibleApprovers = overview?.members.filter((m) => m.role !== 'viewer' && m.isApprover) ?? []

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Users size={18} /></span>
          <div>
            <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Team workspaces</h1>
            <p className="text-sm text-[var(--muted)]">Roles, invitations, shared memory scopes, approval delegation and an activity feed. Roles are enforced server-side.</p>
          </div>
        </div>
        {workspaces.length > 0 && (
          <select className={`${inputCls} max-w-xs`} value={wsId} onChange={(e) => setWsId(e.target.value)}>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
      </header>

      {loading && <Loader2 className="animate-spin text-[var(--muted)]" />}
      {!loading && workspaces.length === 0 && <Card><p className="text-sm text-[var(--muted)]">You are not in a workspace yet. Create one from Workspaces first.</p></Card>}

      {overview && (
        <>
          <p className="text-xs text-[var(--muted)]">You are <b>{overview.yourRoleLabel}</b> in {overview.name}.</p>
          <nav className="flex flex-wrap gap-2">
            {([['members', 'Members & invites'], ['delegation', 'Delegation'], ['memory', 'Shared memory'], ['activity', 'Activity']] as Array<[Tab, string]>).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`h-9 rounded-xl px-4 text-sm font-semibold transition ${tab === id ? 'bg-slate-900 text-white' : 'border border-black/10 text-[var(--tone-strong)] hover:bg-black/5'}`}>{label}</button>
            ))}
          </nav>

          {tab === 'members' && (
            <div className="space-y-4">
              <Card title="Members & roles" icon={Users}>
                {overview.members.map((m) => (
                  <div key={m.userId} className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 py-2 text-sm first:border-0">
                    <span><b className="text-[var(--tone-strong)]">{m.name}</b>{m.you && ' (you)'} <span className="text-xs text-[var(--muted)]">{m.email ?? ''}</span>{m.isApprover && <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">approver</span>}</span>
                    <span className="flex items-center gap-2">
                      {isAdmin && m.role !== 'owner' && !m.you ? (
                        <>
                          <select className="oa-input-surface h-8 rounded-lg px-2 text-xs" value={m.role === 'editor' ? 'member' : m.role} onChange={(e) => act(`role-${m.userId}`, () => sdk.teamWorkspace.changeRole(wsId, m.userId, e.target.value as 'admin' | 'member' | 'viewer'), 'Role updated')}>
                            <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
                          </select>
                          <button className={ghostCls} onClick={() => act(`rm-${m.userId}`, () => sdk.teamWorkspace.removeMember(wsId, m.userId), 'Member removed')}><Trash2 size={12} /></button>
                        </>
                      ) : <span className="rounded-md bg-black/5 px-2 py-0.5 text-xs font-semibold">{m.roleLabel}</span>}
                    </span>
                  </div>
                ))}
              </Card>
              {isAdmin && (
                <Card title="Invitations" icon={Mail}>
                  <div className="flex flex-wrap gap-2">
                    <input className={`${inputCls} flex-1`} placeholder="teammate@company.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                    <select className={`${inputCls} w-36`} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as 'admin' | 'member' | 'viewer' })}>
                      <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
                    </select>
                    <button className={btnCls} disabled={!invite.email.includes('@') || busy === 'invite'} onClick={() => act('invite', async () => { await sdk.teamWorkspace.invite(wsId, invite); setInvite({ ...invite, email: '' }) }, 'Invitation sent')}>Invite</button>
                  </div>
                  {overview.invitations.length > 0 && (
                    <div className="mt-3">
                      {overview.invitations.map((i) => (
                        <div key={i.id} className="flex items-center justify-between border-t border-black/5 py-1.5 text-xs">
                          <span>{i.email} · {i.role === 'editor' ? 'member' : i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                          <button className={ghostCls} onClick={() => act(`ri-${i.id}`, () => sdk.teamWorkspace.revokeInvite(wsId, i.id), 'Invitation revoked')}>Revoke</button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}

          {tab === 'delegation' && delegation && (
            <div className="space-y-4">
              <Card title="Approval delegation" icon={ShieldCheck}>
                <p className="mb-3 text-xs text-[var(--muted)]">{delegation.explanation}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Approvers</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {overview.members.filter((m) => m.role !== 'viewer').map((m) => (
                    <button key={m.userId} disabled={!isAdmin || m.role === 'owner'} onClick={() => act(`ap-${m.userId}`, () => (m.isApprover ? sdk.teamWorkspace.removeApprover(wsId, m.userId) : sdk.teamWorkspace.addApprover(wsId, m.userId)), m.isApprover ? 'Approver removed' : 'Approver added')} className={`h-8 rounded-lg px-3 text-xs font-semibold ${m.isApprover ? 'bg-emerald-600 text-white' : 'border border-black/10'} disabled:opacity-60`}>
                      {m.name}{m.role === 'owner' ? ' (owner, implicit)' : ''}
                    </button>
                  ))}
                </div>
                {isAdmin && (
                  <div className="mt-4 grid gap-2 md:grid-cols-5">
                    <select className={inputCls} value={rule.approverId} onChange={(e) => setRule({ ...rule, approverId: e.target.value })}>
                      <option value="">Approver…</option>
                      {eligibleApprovers.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                    </select>
                    <select className={inputCls} value={rule.memberId} onChange={(e) => setRule({ ...rule, memberId: e.target.value })}>
                      <option value="*">All members</option>
                      {overview.members.filter((m) => m.userId !== rule.approverId).map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                    </select>
                    <input className={inputCls} placeholder="Tools (blank = all)" value={rule.tools} onChange={(e) => setRule({ ...rule, tools: e.target.value })} />
                    <select className={inputCls} value={rule.maxRisk} onChange={(e) => setRule({ ...rule, maxRisk: e.target.value as TeamRisk })}>
                      <option value="low">Up to low risk</option><option value="medium">Up to medium risk</option><option value="high">Up to high risk</option>
                    </select>
                    <input className={inputCls} placeholder="Expires in days" type="number" min="1" max="365" value={rule.days} onChange={(e) => setRule({ ...rule, days: e.target.value })} />
                    <button className={`${btnCls} md:col-span-5`} disabled={!rule.approverId || busy === 'rule'} onClick={() => act('rule', () => sdk.teamWorkspace.createRule(wsId, { approverId: rule.approverId, memberId: rule.memberId, tools: rule.tools.split(',').map((t) => t.trim()).filter(Boolean), maxRisk: rule.maxRisk, expiresInDays: rule.days ? Number(rule.days) : undefined }), 'Rule created')}>Add delegation rule</button>
                  </div>
                )}
                <div className="mt-4">
                  {delegation.rules.length === 0 && <p className="text-sm text-[var(--muted)]">No delegation rules.</p>}
                  {delegation.rules.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 py-2 text-xs first:border-0">
                      <span><b>{r.approverName}</b> may approve for <b>{r.memberName}</b>: {r.tools.join(', ')} up to <b>{r.maxRisk}</b> risk{r.expiresAt && ` · expires ${new Date(r.expiresAt).toLocaleDateString()}`}{r.expired && <span className="ml-1 text-red-600">(expired)</span>}</span>
                      {isAdmin && <button className={ghostCls} onClick={() => act(`dr-${r.id}`, () => sdk.teamWorkspace.deleteRule(wsId, r.id), 'Rule removed')}>Remove</button>}
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Pending approvals you can resolve on behalf of members">
                {pending.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing pending that your delegation rules cover.</p>}
                {pending.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 py-2 text-sm first:border-0">
                    <span><b>{p.toolName}</b> for {p.ownerName} <span className="text-xs text-[var(--muted)]">· {p.risk?.level ?? 'unknown'} risk</span></span>
                    <span className="flex gap-2">
                      <button className={ghostCls} onClick={() => act(`ok-${p.id}`, () => sdk.teamWorkspace.approveOnBehalf(wsId, p.id, true), 'Approved on behalf')}>Approve</button>
                      <button className={ghostCls} onClick={() => act(`no-${p.id}`, () => sdk.teamWorkspace.approveOnBehalf(wsId, p.id, false), 'Denied on behalf')}>Deny</button>
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {tab === 'memory' && (
            <div className="space-y-4">
              <Card title="Memory scopes" icon={Brain}>
                <div className="flex flex-wrap gap-2">
                  {scopes.map((s) => (
                    <button key={s.id} disabled={!s.canRead} onClick={() => setScopeId(s.id)} className={`h-8 rounded-lg px-3 text-xs font-semibold ${scopeId === s.id ? 'bg-slate-900 text-white' : 'border border-black/10'} disabled:opacity-40`} title={`read: ${s.readRole}, write: ${s.writeRole}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
                {isAdmin && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input className={`${inputCls} flex-1`} placeholder="New scope name" value={scopeForm.name} onChange={(e) => setScopeForm({ ...scopeForm, name: e.target.value })} />
                    <select className={`${inputCls} w-36`} value={scopeForm.readRole} onChange={(e) => setScopeForm({ ...scopeForm, readRole: e.target.value as 'admin' | 'member' | 'viewer' })}><option value="viewer">Read: viewer+</option><option value="member">Read: member+</option><option value="admin">Read: admin+</option></select>
                    <select className={`${inputCls} w-36`} value={scopeForm.writeRole} onChange={(e) => setScopeForm({ ...scopeForm, writeRole: e.target.value as 'admin' | 'member' | 'viewer' })}><option value="member">Write: member+</option><option value="admin">Write: admin+</option></select>
                    <button className={btnCls} disabled={scopeForm.name.trim().length < 2 || busy === 'scope'} onClick={() => act('scope', async () => { await sdk.teamWorkspace.createScope(wsId, scopeForm); setScopeForm({ ...scopeForm, name: '' }) }, 'Scope created')}>Create scope</button>
                  </div>
                )}
              </Card>
              <Card title={`Entries in ${scopes.find((s) => s.id === scopeId)?.name ?? scopeId}`}>
                {scopes.find((s) => s.id === scopeId)?.canWrite && (
                  <div className="mb-3 space-y-2">
                    <input className={inputCls} placeholder="Title" value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} />
                    <textarea className={areaCls} rows={3} placeholder="Shared knowledge for the team" value={entry.content} onChange={(e) => setEntry({ ...entry, content: e.target.value })} />
                    <button className={btnCls} disabled={!entry.title.trim() || !entry.content.trim() || busy === 'entry'} onClick={() => act('entry', async () => { await sdk.teamWorkspace.addEntry(wsId, scopeId, entry); setEntry({ title: '', content: '' }) }, 'Entry added')}>Add entry</button>
                  </div>
                )}
                {entries.length === 0 && <p className="text-sm text-[var(--muted)]">No entries in this scope.</p>}
                {entries.map((e) => (
                  <div key={e.id} className="border-t border-black/5 py-2 text-sm first:border-0">
                    <div className="flex items-center justify-between"><b className="text-[var(--tone-strong)]">{e.title}</b>
                      {scopes.find((s) => s.id === scopeId)?.canWrite && <button className={ghostCls} onClick={() => act(`de-${e.id}`, () => sdk.teamWorkspace.deleteEntry(wsId, scopeId, e.id), 'Entry deleted')}><Trash2 size={12} /></button>}
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-[var(--muted)]">{e.content}</p>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">{e.authorName} · {new Date(e.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {tab === 'activity' && (
            <Card title="Activity feed" icon={Activity}>
              {activity.length === 0 && <p className="text-sm text-[var(--muted)]">No activity recorded yet.</p>}
              {activity.map((a) => (
                <div key={a.id} className="flex flex-wrap justify-between gap-2 border-t border-black/5 py-1.5 text-xs first:border-0">
                  <span><b>{a.actorName}</b> · {a.summary} <span className="text-[var(--muted)]">({a.action})</span></span>
                  <span className="text-[var(--muted)]">{new Date(a.at).toLocaleString()}</span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
