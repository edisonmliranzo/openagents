'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  AgentInstallRow,
  AgentListingRow,
  AgentMarketplaceEarnings,
  AgentMarketplaceInfo,
  AgentPermissionManifest,
} from '@openagents/sdk'
import { Coins, Download, Loader2, PackageCheck, Plus, ShieldCheck, Store, Trash2 } from 'lucide-react'

const inputCls = 'oa-input-surface h-10 w-full rounded-xl px-3 text-sm outline-none'
const areaCls = 'oa-input-surface w-full rounded-xl px-3 py-2 text-sm outline-none'
const btnCls = 'oa-accent-button h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50'
const ghostCls = 'h-9 rounded-xl border border-black/10 px-3 text-xs font-semibold text-[var(--tone-strong)] transition hover:bg-black/5 disabled:opacity-50'

const money = (cents: number, currency = 'usd') => (cents === 0 ? 'Free' : `${currency.toUpperCase() === 'USD' ? '$' : currency.toUpperCase() + ' '}${(cents / 100).toFixed(2)}`)
const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

type Tab = 'browse' | 'installed' | 'publish' | 'earnings'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`oa-float-card p-5 ${className}`}>{children}</section>
}

function ManifestList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</p>
      {items.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {items.map((i) => (
            <span key={i} className="rounded-md bg-slate-900/90 px-2 py-0.5 font-mono text-[11px] text-white">{i}</span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-[var(--muted)]">{empty}</p>
      )}
    </div>
  )
}

export default function AgentMarketplacePage() {
  const addToast = useUIStore((s) => s.addToast)
  const [tab, setTab] = useState<Tab>('browse')
  const [info, setInfo] = useState<AgentMarketplaceInfo | null>(null)
  const [listings, setListings] = useState<AgentListingRow[]>([])
  const [installs, setInstalls] = useState<AgentInstallRow[]>([])
  const [mine, setMine] = useState<AgentListingRow[]>([])
  const [earnings, setEarnings] = useState<AgentMarketplaceEarnings | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // consent dialog
  const [consent, setConsent] = useState<AgentListingRow | null>(null)
  const [grant, setGrant] = useState<AgentPermissionManifest>({ tools: [], networkDomains: [], dataScopes: [] })
  const [ack, setAck] = useState(false)
  const [payMethod, setPayMethod] = useState<'test_card' | 'test_decline'>('test_card')

  // publish form
  const [form, setForm] = useState({ title: '', description: '', kind: 'agent' as 'agent' | 'workflow', version: '1.0.0', price: '0', systemPrompt: '', tools: '', domains: '', scopes: [] as string[] })

  const load = useCallback(async () => {
    try {
      const [i, l, ins, m, e] = await Promise.all([
        sdk.agentMarketplace.info(),
        sdk.agentMarketplace.browse(query || undefined),
        sdk.agentMarketplace.installs(),
        sdk.agentMarketplace.mine(),
        sdk.agentMarketplace.earnings(),
      ])
      setInfo(i); setListings(l); setInstalls(ins); setMine(m); setEarnings(e)
    } catch (e) {
      addToast('error', errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [query, addToast])

  useEffect(() => { void load() }, [load])

  const openConsent = (l: AgentListingRow) => {
    setConsent(l)
    setGrant({ tools: [...l.manifest.tools], networkDomains: [...l.manifest.networkDomains], dataScopes: [...l.manifest.dataScopes] })
    setAck(false)
    setPayMethod('test_card')
  }

  const toggle = (key: keyof AgentPermissionManifest, value: string) =>
    setGrant((g) => ({ ...g, [key]: g[key].includes(value) ? g[key].filter((x) => x !== value) : [...g[key], value] }))

  const doInstall = async () => {
    if (!consent || !ack) return
    setBusy('install')
    try {
      await sdk.agentMarketplace.install(consent.id, { manifestHash: consent.manifestHash, grant, paymentMethod: consent.priceCents > 0 ? payMethod : undefined })
      addToast('success', `Installed ${consent.title}`)
      setConsent(null)
      await load()
    } catch (e) {
      addToast('error', errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const publish = async () => {
    setBusy('publish')
    try {
      await sdk.agentMarketplace.publish({
        kind: form.kind,
        title: form.title,
        description: form.description,
        version: form.version || '1.0.0',
        priceCents: Math.round(Number(form.price || '0') * 100),
        manifest: { tools: lines(form.tools), networkDomains: lines(form.domains), dataScopes: form.scopes },
        definition: form.systemPrompt ? { systemPrompt: form.systemPrompt } : undefined,
      })
      addToast('success', 'Listing published')
      setForm({ ...form, title: '', description: '', systemPrompt: '', tools: '', domains: '', scopes: [] })
      await load()
      setTab('earnings')
    } catch (e) {
      addToast('error', errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try { await fn(); addToast('success', ok); await load() } catch (e) { addToast('error', errMsg(e)) } finally { setBusy(null) }
  }

  const tabs: Array<[Tab, string]> = useMemo(() => [['browse', 'Browse'], ['installed', `Installed (${installs.length})`], ['publish', 'Publish'], ['earnings', 'Creator earnings']], [installs.length])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-8">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Store size={18} /></span>
        <div>
          <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Agent Marketplace</h1>
          <p className="text-sm text-[var(--muted)]">
            Publish agents and workflows with a permission manifest. Installs run only with the permissions you consent to.
            {info && <> Creators keep {info.creatorSharePct}% of every sale.</>}
          </p>
          {info?.provider.simulated && (
            <p className="mt-1 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              Payments use the simulated test provider. No real money moves.
            </p>
          )}
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-9 rounded-xl px-4 text-sm font-semibold transition ${tab === id ? 'bg-slate-900 text-white' : 'border border-black/10 text-[var(--tone-strong)] hover:bg-black/5'}`}>
            {label}
          </button>
        ))}
      </nav>

      {loading && <Loader2 className="animate-spin text-[var(--muted)]" />}

      {tab === 'browse' && (
        <div className="space-y-3">
          <input className={inputCls} placeholder="Search listings" value={query} onChange={(e) => setQuery(e.target.value)} />
          {listings.length === 0 && !loading && <Card><p className="text-sm text-[var(--muted)]">No listings yet. Publish the first one from the Publish tab.</p></Card>}
          {listings.map((l) => (
            <Card key={l.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--tone-strong)]">{l.title}</h3>
                    <span className="rounded-md bg-black/5 px-2 py-0.5 text-[11px] font-semibold uppercase">{l.kind}</span>
                    <span className="text-[11px] text-[var(--muted)]">v{l.version} · {l.installCount} installs</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{l.description}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <ManifestList title="Tools" items={l.manifest.tools} empty="No tools" />
                    <ManifestList title="Network" items={l.manifest.networkDomains} empty="No network access" />
                    <ManifestList title="Data scopes" items={l.manifest.dataScopes} empty="No data access" />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-base font-semibold text-[var(--tone-strong)]">{money(l.priceCents, l.currency)}</span>
                  <button className={btnCls} disabled={l.installed} onClick={() => openConsent(l)}>
                    {l.installed ? 'Installed' : l.mine ? 'Install (yours)' : l.priceCents ? 'Review & buy' : 'Review & install'}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'installed' && (
        <div className="space-y-3">
          {installs.length === 0 && <Card><p className="text-sm text-[var(--muted)]">Nothing installed yet.</p></Card>}
          {installs.map((i) => (
            <Card key={i.listingId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--tone-strong)]"><PackageCheck size={14} />{i.listing?.title ?? 'Removed listing'} <span className="text-[11px] font-normal text-[var(--muted)]">v{i.version}</span></h3>
                  {i.needsReconsent && <p className="mt-1 text-xs font-semibold text-amber-700">The manifest changed or the listing is gone. This install is blocked until you review and consent again.</p>}
                </div>
                <div className="flex gap-2">
                  {i.listing && i.needsReconsent && <button className={ghostCls} onClick={() => openConsent(i.listing!)}>Review changes</button>}
                  <button className={ghostCls} disabled={busy === `un-${i.listingId}`} onClick={() => act(`un-${i.listingId}`, () => sdk.agentMarketplace.uninstall(i.listingId), 'Uninstalled')}><Trash2 size={12} className="mr-1 inline" />Uninstall</button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <ManifestList title="Granted tools" items={i.granted.tools} empty="None" />
                <ManifestList title="Granted domains" items={i.granted.networkDomains} empty="None" />
                <ManifestList title="Granted data scopes" items={i.granted.dataScopes} empty="None" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'publish' && (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tone-strong)]"><Plus size={14} />New listing</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <input className={`${inputCls} md:col-span-2`} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'agent' | 'workflow' })}>
              <option value="agent">Agent</option><option value="workflow">Workflow</option>
            </select>
            <input className={inputCls} placeholder="Version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          </div>
          <textarea className={areaCls} rows={2} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea className={areaCls} rows={3} placeholder="System prompt / instructions (optional)" value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} />
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs text-[var(--muted)]">Price in USD (0 = free, min 0.50)
              <input className={inputCls} type="number" min="0" step="0.5" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </label>
            <label className="text-xs text-[var(--muted)]">Tools (comma or newline separated)
              <textarea className={areaCls} rows={2} value={form.tools} onChange={(e) => setForm({ ...form, tools: e.target.value })} />
            </label>
            <label className="text-xs text-[var(--muted)]">Network domains (e.g. api.example.com, *.github.com)
              <textarea className={areaCls} rows={2} value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} />
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs text-[var(--muted)]">Data scopes</p>
            <div className="flex flex-wrap gap-2">
              {(info?.dataScopes ?? []).map((s) => (
                <label key={s} className="flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs">
                  <input type="checkbox" checked={form.scopes.includes(s)} onChange={() => setForm({ ...form, scopes: form.scopes.includes(s) ? form.scopes.filter((x) => x !== s) : [...form.scopes, s] })} />{s}
                </label>
              ))}
            </div>
          </div>
          <button className={btnCls} disabled={busy === 'publish' || form.title.trim().length < 2 || form.description.trim().length < 2} onClick={publish}>
            {busy === 'publish' ? 'Publishing…' : 'Publish listing'}
          </button>
        </Card>
      )}

      {tab === 'earnings' && earnings && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {([
              ['Gross sales', earnings.totals.grossCents],
              [`Platform fee (${earnings.platformFeePct}%)`, earnings.totals.platformFeeCents],
              [`Your share (${earnings.creatorSharePct}%)`, earnings.totals.netCents],
              ['Payout balance', earnings.totals.payoutBalanceCents],
            ] as Array<[string, number]>).map(([label, v]) => (
              <Card key={label}><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 flex items-center gap-1 text-xl font-semibold text-[var(--tone-strong)]"><Coins size={16} />${(v / 100).toFixed(2)}</p></Card>
            ))}
          </div>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted)]">Paid out so far: ${(earnings.totals.paidOutCents / 100).toFixed(2)}. Minimum payout ${(earnings.minPayoutCents / 100).toFixed(2)}.{earnings.provider.simulated && ' Payouts are simulated.'}</p>
            <button className={btnCls} disabled={busy === 'payout' || earnings.totals.payoutBalanceCents < earnings.minPayoutCents} onClick={() => act('payout', () => sdk.agentMarketplace.requestPayout(), 'Payout recorded')}>Request payout</button>
          </Card>
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-[var(--tone-strong)]">Your listings</h2>
            {mine.length === 0 && <p className="text-sm text-[var(--muted)]">You have not published anything yet.</p>}
            {mine.map((l) => {
              const row = earnings.byListing.find((r) => r.itemId === l.id)
              return (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 py-2 text-sm first:border-0">
                  <span className="font-medium text-[var(--tone-strong)]">{l.title} <span className="text-xs text-[var(--muted)]">{money(l.priceCents, l.currency)} · {l.installCount} installs · {l.status}</span></span>
                  <span className="flex items-center gap-3 text-xs text-[var(--muted)]">
                    {row ? `${row.sales} sales · $${(row.netCents / 100).toFixed(2)} net` : 'No sales'}
                    <button className={ghostCls} onClick={() => act(`st-${l.id}`, () => sdk.agentMarketplace.update(l.id, { status: l.status === 'published' ? 'unlisted' : 'published' }), 'Updated')}>{l.status === 'published' ? 'Unlist' : 'Relist'}</button>
                  </span>
                </div>
              )
            })}
          </Card>
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--tone-strong)]"><Download size={14} />Ledger</h2>
            {earnings.entries.length === 0 && <p className="text-sm text-[var(--muted)]">No sales recorded.</p>}
            {earnings.entries.slice(0, 50).map((e) => (
              <div key={e.id} className="flex justify-between border-t border-black/5 py-1.5 text-xs first:border-0">
                <span className="text-[var(--muted)]">{new Date(e.createdAt).toLocaleString()}</span>
                <span>gross ${(e.grossCents / 100).toFixed(2)} − fee ${(e.platformFeeCents / 100).toFixed(2)} = <b>${(e.netCents / 100).toFixed(2)}</b></span>
              </div>
            ))}
            {earnings.payouts.map((p) => (
              <div key={p.id} className="flex justify-between border-t border-black/5 py-1.5 text-xs">
                <span className="text-[var(--muted)]">{new Date(p.createdAt).toLocaleString()} · payout ({p.provider})</span>
                <b>−${(p.amountCents / 100).toFixed(2)}</b>
              </div>
            ))}
          </Card>
        </div>
      )}

      {consent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="oa-float-card max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto bg-white p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--tone-strong)]"><ShieldCheck size={16} />Permissions requested by {consent.title}</h2>
            <p className="text-xs text-[var(--muted)]">Untick anything you do not want to grant. The agent will be denied everything you leave unchecked.</p>
            {([['tools', 'Tools'], ['networkDomains', 'Network domains'], ['dataScopes', 'Data scopes']] as Array<[keyof AgentPermissionManifest, string]>).map(([key, label]) => (
              <div key={key}>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
                {consent.manifest[key].length === 0 && <p className="text-xs text-[var(--muted)]">None requested</p>}
                {consent.manifest[key].map((v) => (
                  <label key={v} className="flex items-center gap-2 py-0.5 font-mono text-xs"><input type="checkbox" checked={grant[key].includes(v)} onChange={() => toggle(key, v)} />{v}</label>
                ))}
              </div>
            ))}
            {consent.priceCents > 0 && !consent.mine && (
              <label className="block text-xs text-[var(--muted)]">Test payment method ({money(consent.priceCents, consent.currency)})
                <select className={inputCls} value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'test_card' | 'test_decline')}>
                  <option value="test_card">Test card (succeeds)</option>
                  <option value="test_decline">Test card (declines)</option>
                </select>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I have reviewed these permissions and consent to install under them.</label>
            <div className="flex justify-end gap-2">
              <button className={ghostCls} onClick={() => setConsent(null)}>Cancel</button>
              <button className={btnCls} disabled={!ack || busy === 'install'} onClick={doInstall}>{busy === 'install' ? 'Installing…' : consent.priceCents > 0 && !consent.mine ? `Pay ${money(consent.priceCents, consent.currency)} & install` : 'Install'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
