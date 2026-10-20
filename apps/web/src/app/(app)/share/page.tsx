'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, Code2, Copy, ExternalLink, Globe, Plus, Trash2 } from 'lucide-react'
import { sdk } from '@/stores/auth'

interface PublicAgentRecord {
  id: string
  slug: string
  name: string
  avatar: string
  description: string
  greeting: string
  systemPrompt: string
  tools: string[]
  libraryDocumentIds: string[]
  published: boolean
  allowedOrigins: string[]
  dailyMessageCap: number
  monthlyCostCapUsd: number
  usage: {
    day: string
    messagesToday: number
    month: string
    costThisMonthUsd: number
    totalMessages: number
  }
}

export default function ShareableAgentsPage() {
  const [agents, setAgents] = useState<PublicAgentRecord[]>([])
  const [selected, setSelected] = useState<PublicAgentRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: 'Support Assistant',
    slug: '',
    avatar: '🤖',
    description: 'Public assistant powered by OpenAgents',
    greeting: 'Hi! How can I help you today?',
    systemPrompt: 'You are a helpful, concise assistant.',
    tools: ['web_search'] as string[],
    published: true,
    allowedOrigins: '',
    dailyMessageCap: 200,
    monthlyCostCapUsd: 10,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await sdk.client.get<PublicAgentRecord[]>('/api/v1/public-agents')
      setAgents(list)
      if (list.length > 0 && !selected) {
        selectAgent(list[0])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load public agents')
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => {
    void load()
  }, [load])

  function selectAgent(a: PublicAgentRecord) {
    setSelected(a)
    setForm({
      name: a.name,
      slug: a.slug,
      avatar: a.avatar,
      description: a.description,
      greeting: a.greeting,
      systemPrompt: a.systemPrompt,
      tools: a.tools,
      published: a.published,
      allowedOrigins: a.allowedOrigins.join(', '),
      dailyMessageCap: a.dailyMessageCap,
      monthlyCostCapUsd: a.monthlyCostCapUsd,
    })
  }

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      const created = await sdk.client.post<PublicAgentRecord>('/api/v1/public-agents', {
        name: 'New Public Agent',
        slug: `agent-${Math.random().toString(36).slice(2, 7)}`,
        avatar: '🤖',
        description: 'Public assistant powered by OpenAgents',
        greeting: 'Hello! Ask me anything.',
        systemPrompt: 'You are a helpful assistant.',
        tools: ['web_search'],
        published: true,
        dailyMessageCap: 200,
        monthlyCostCapUsd: 10,
      })
      await load()
      selectAgent(created)
    } catch (e: any) {
      setError(e?.message || 'Could not create agent')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const updated = await sdk.client.patch<PublicAgentRecord>(`/api/v1/public-agents/${selected.id}`, {
        name: form.name,
        slug: form.slug,
        avatar: form.avatar,
        description: form.description,
        greeting: form.greeting,
        systemPrompt: form.systemPrompt,
        tools: form.tools,
        published: form.published,
        allowedOrigins: form.allowedOrigins
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        dailyMessageCap: Number(form.dailyMessageCap) || 200,
        monthlyCostCapUsd: Number(form.monthlyCostCapUsd) || 10,
      })
      setSelected(updated)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await sdk.client.delete(`/api/v1/public-agents/${id}`)
      setSelected(null)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'
  const embedSnippet = selected
    ? `<script src="${origin}/widget.js" data-openagents-slug="${selected.slug}" defer></script>`
    : ''

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Globe className="h-6 w-6 text-emerald-400" /> Shareable Public Agents
          </h1>
          <p className="text-sm text-slate-400">
            Publish safe, rate-limited agents as public links or website chat widgets.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New Public Agent
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
              Loading agents…
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
              <Bot className="mx-auto mb-2 h-8 w-8 text-slate-500" />
              No public agents yet. Click &ldquo;New Public Agent&rdquo; to publish one.
            </div>
          ) : (
            agents.map((a) => (
              <div
                key={a.id}
                onClick={() => selectAgent(a)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  selected?.id === a.id
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{a.avatar || '🤖'}</span>
                    <div>
                      <div className="font-semibold">{a.name}</div>
                      <div className="text-xs text-slate-400">/a/{a.slug}</div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      a.published ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {a.published ? 'Live' : 'Draft'}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>Today: {a.usage.messagesToday}/{a.dailyMessageCap} msgs</span>
                  <span>Month: ${a.usage.costThisMonthUsd.toFixed(2)}/${a.monthlyCostCapUsd}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div className="space-y-6 lg:col-span-2">
            <form
              onSubmit={handleSave}
              className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Agent Configuration</h2>
                <div className="flex items-center gap-2">
                  <a
                    href={`/a/${selected.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Public Link
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(selected.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-slate-400">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">Slug (/a/slug)</label>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">Avatar Emoji</label>
                  <input
                    value={form.avatar}
                    onChange={(e) => setForm({ ...form, avatar: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400">Description</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">Greeting Message</label>
                  <input
                    value={form.greeting}
                    onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400">System Instructions</label>
                <textarea
                  rows={4}
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-slate-400">Daily Message Cap</label>
                  <input
                    type="number"
                    value={form.dailyMessageCap}
                    onChange={(e) => setForm({ ...form, dailyMessageCap: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">Monthly Cost Cap ($ USD)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.monthlyCostCapUsd}
                    onChange={(e) => setForm({ ...form, monthlyCostCapUsd: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">Allowed Embed Origins (CSV)</label>
                  <input
                    value={form.allowedOrigins}
                    onChange={(e) => setForm({ ...form, allowedOrigins: e.target.value })}
                    placeholder="https://example.com"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  />
                  Published (accessible at /a/{form.slug})
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Code2 className="h-4 w-4 text-emerald-400" /> Embeddable Website Chat Widget
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(embedSnippet)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs hover:bg-slate-800"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy Snippet'}
                </button>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-emerald-300">
                {embedSnippet}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
