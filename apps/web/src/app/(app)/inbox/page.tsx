'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  Edit3,
  Inbox,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

type TriageCategory = 'urgent' | 'reply_needed' | 'fyi' | 'newsletter' | 'invoice'
type RuleAction = 'label' | 'archive' | 'draft' | 'forward'
type DraftStatus = 'pending' | 'approved' | 'sent' | 'rejected' | 'failed'

interface TriagedEmail {
  id: string
  threadId: string
  from: string
  fromEmail: string
  subject: string
  snippet: string
  date: string
  category: TriageCategory
  reason: string
  unread: boolean
}

interface TriageSummary {
  lastRunAt: string | null
  counts: Record<TriageCategory, number>
  items: TriagedEmail[]
}

interface EmailDraft {
  id: string
  kind: 'reply' | 'forward'
  messageId: string
  threadId: string
  to: string
  subject: string
  body: string
  status: DraftStatus
  ruleId?: string
  error?: string
  createdAt: string
  updatedAt: string
}

interface PendingAction {
  id: string
  ruleId: string
  action: RuleAction
  value?: string
  messageId: string
  subject: string
  from: string
  status: 'pending' | 'approved' | 'rejected' | 'done' | 'failed'
  createdAt: string
}

interface EmailRule {
  id: string
  match: string
  action: RuleAction
  value?: string
  enabled: boolean
  requireApproval: boolean
  createdAt: string
}

interface StyleProfile {
  summary: string
  greeting: string
  signOff: string
  avgLength: number
  tone: string
  samples: number
  updatedAt: string
}

const CATEGORY_META: Record<TriageCategory, { label: string; badgeClass: string }> = {
  urgent: { label: 'Urgent', badgeClass: 'bg-rose-100 text-rose-700 border-rose-200' },
  reply_needed: { label: 'Reply Needed', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  fyi: { label: 'FYI', badgeClass: 'bg-sky-100 text-sky-700 border-sky-200' },
  newsletter: { label: 'Newsletter', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  invoice: { label: 'Invoice', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const CATEGORIES: TriageCategory[] = ['urgent', 'reply_needed', 'fyi', 'newsletter', 'invoice']

export default function InboxAutopilotPage() {
  const addToast = useUIStore((s) => s.addToast)

  const [triage, setTriage] = useState<TriageSummary>({
    lastRunAt: null,
    counts: { urgent: 0, reply_needed: 0, fyi: 0, newsletter: 0, invoice: 0 },
    items: [],
  })
  const [drafts, setDrafts] = useState<EmailDraft[]>([])
  const [actions, setActions] = useState<PendingAction[]>([])
  const [rules, setRules] = useState<EmailRule[]>([])
  const [style, setStyle] = useState<StyleProfile | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<TriageCategory | 'all'>('all')

  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [learningStyle, setLearningStyle] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Draft editing state
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editTo, setEditTo] = useState('')
  const [editBody, setEditBody] = useState('')

  // New rule state
  const [ruleMatch, setRuleMatch] = useState('')
  const [ruleAction, setRuleAction] = useState<RuleAction>('draft')
  const [ruleValue, setRuleValue] = useState('')
  const [ruleRequireApproval, setRuleRequireApproval] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [triageRes, draftsRes, actionsRes, rulesRes, styleRes] = await Promise.all([
        sdk.client.get<TriageSummary>('/api/v1/email-autopilot/triage'),
        sdk.client.get<EmailDraft[]>('/api/v1/email-autopilot/drafts'),
        sdk.client.get<PendingAction[]>('/api/v1/email-autopilot/actions'),
        sdk.client.get<EmailRule[]>('/api/v1/email-autopilot/rules'),
        sdk.client.get<{ profile: StyleProfile | null }>('/api/v1/email-autopilot/style'),
      ])
      setTriage(triageRes)
      setDrafts(draftsRes)
      setActions(actionsRes)
      setRules(rulesRes)
      setStyle(styleRes.profile)
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to load Email Autopilot data'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return triage.items
    return triage.items.filter((item) => item.category === selectedCategory)
  }, [triage.items, selectedCategory])

  async function handleRunTriage() {
    setRunning(true)
    setError('')
    try {
      const res = await sdk.client.post<{
        triaged: number
        newMessages: number
        drafted: number
        ruleHits: number
        pendingApprovals: number
      }>('/api/v1/email-autopilot/run')
      addToast(
        'success',
        `Triaged ${res.triaged} emails (${res.newMessages} new, ${res.drafted} drafts created).`,
      )
      await loadAll()
    } catch (err: any) {
      const msg = err?.message ?? 'Triage run failed'
      setError(msg)
      addToast('error', msg)
    } finally {
      setRunning(false)
    }
  }

  async function handleLearnStyle() {
    setLearningStyle(true)
    setError('')
    try {
      const profile = await sdk.client.post<StyleProfile>('/api/v1/email-autopilot/style/learn')
      setStyle(profile)
      addToast('success', 'Updated writing style profile from your sent messages.')
    } catch (err: any) {
      const msg = err?.message ?? 'Could not learn writing style'
      setError(msg)
      addToast('error', msg)
    } finally {
      setLearningStyle(false)
    }
  }

  function startEditDraft(d: EmailDraft) {
    setEditingDraftId(d.id)
    setEditTo(d.to)
    setEditSubject(d.subject)
    setEditBody(d.body)
  }

  async function handleSaveDraft(id: string) {
    setBusyId(id)
    try {
      const updated = await sdk.client.patch<EmailDraft>(
        `/api/v1/email-autopilot/drafts/${encodeURIComponent(id)}`,
        { to: editTo, subject: editSubject, body: editBody },
      )
      setDrafts((cur) => cur.map((d) => (d.id === id ? updated : d)))
      setEditingDraftId(null)
      addToast('success', 'Draft saved.')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to save draft')
    } finally {
      setBusyId(null)
    }
  }

  async function handleApproveDraft(id: string) {
    setBusyId(id)
    try {
      const updated = await sdk.client.post<EmailDraft>(
        `/api/v1/email-autopilot/drafts/${encodeURIComponent(id)}/approve`,
      )
      setDrafts((cur) => cur.map((d) => (d.id === id ? updated : d)))
      addToast(
        updated.status === 'sent' ? 'success' : 'warning',
        updated.status === 'sent' ? 'Reply approved and sent!' : updated.error ?? 'Draft status updated',
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to approve draft')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRejectDraft(id: string) {
    setBusyId(id)
    try {
      const updated = await sdk.client.post<EmailDraft>(
        `/api/v1/email-autopilot/drafts/${encodeURIComponent(id)}/reject`,
      )
      setDrafts((cur) => cur.map((d) => (d.id === id ? updated : d)))
      addToast('info', 'Draft rejected.')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to reject draft')
    } finally {
      setBusyId(null)
    }
  }

  async function handleResolveAction(id: string, approve: boolean) {
    setBusyId(id)
    try {
      const updated = await sdk.client.post<PendingAction>(
        `/api/v1/email-autopilot/actions/${encodeURIComponent(id)}/${approve ? 'approve' : 'reject'}`,
      )
      setActions((cur) => cur.map((a) => (a.id === id ? updated : a)))
      addToast('success', approve ? 'Action approved and executed.' : 'Action rejected.')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to resolve action')
    } finally {
      setBusyId(null)
    }
  }

  async function handleCreateRule() {
    if (!ruleMatch.trim()) {
      addToast('warning', 'Rule match expression is required.')
      return
    }
    setBusyId('new-rule')
    try {
      const created = await sdk.client.post<EmailRule>('/api/v1/email-autopilot/rules', {
        match: ruleMatch.trim(),
        action: ruleAction,
        value: ruleValue.trim() || undefined,
        requireApproval: ruleRequireApproval,
        enabled: true,
      })
      setRules((cur) => [...cur, created])
      setRuleMatch('')
      setRuleValue('')
      addToast('success', 'Automation rule added.')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to create rule')
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleRule(rule: EmailRule) {
    setBusyId(rule.id)
    try {
      const updated = await sdk.client.patch<EmailRule>(
        `/api/v1/email-autopilot/rules/${encodeURIComponent(rule.id)}`,
        { enabled: !rule.enabled },
      )
      setRules((cur) => cur.map((r) => (r.id === rule.id ? updated : r)))
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to update rule')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeleteRule(id: string) {
    setBusyId(id)
    try {
      await sdk.client.delete(`/api/v1/email-autopilot/rules/${encodeURIComponent(id)}`)
      setRules((cur) => cur.filter((r) => r.id !== id))
      addToast('info', 'Rule deleted.')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to delete rule')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Inbox className="h-7 w-7 text-rose-600" />
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Email Autopilot</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            OpenAgents triages your inbox, learns your writing style, and prepares reply drafts for your approval.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleRunTriage()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {running ? 'Triaging Inbox...' : 'Triage Inbox Now'}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Style Profile Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Personal Writing Style Profile</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Learned from your sent Gmail messages so AI drafts sound like you.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLearnStyle()}
            disabled={learningStyle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-rose-600" />
            {learningStyle ? 'Analyzing Sent Mail...' : style ? 'Re-learn Style' : 'Learn My Style'}
          </button>
        </div>
        {style ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Summary</p>
              <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{style.summary}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Greeting & Sign-off</p>
              <p className="mt-1 text-xs font-medium text-slate-800">
                “{style.greeting}” / “{style.signOff}”
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Tone: {style.tone}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Metrics</p>
              <p className="mt-1 text-xs font-medium text-slate-800">~{style.avgLength} words avg</p>
              <p className="mt-1 text-[11px] text-slate-500">{style.samples} sent samples analyzed</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            No style profile learned yet. Click &ldquo;Learn My Style&rdquo; after connecting Gmail.
          </p>
        )}
      </section>

      {/* AI Reply Drafts & Pending Rule Approvals */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">AI Reply Drafts</h2>
              <p className="text-xs text-slate-500">Review, edit, and approve before any email is sent.</p>
            </div>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
              {drafts.filter((d) => d.status === 'pending').length} pending
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {drafts.map((d) => {
              const isEditing = editingDraftId === d.id
              return (
                <article key={d.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{d.subject}</p>
                      <p className="text-[11px] text-slate-500">To: {d.to}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        d.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : d.status === 'sent'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.status === 'rejected'
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="mt-3 space-y-2">
                      <input
                        value={editTo}
                        onChange={(e) => setEditTo(e.target.value)}
                        placeholder="Recipient"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                      />
                      <input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        placeholder="Subject"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                      />
                      <textarea
                        rows={5}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingDraftId(null)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveDraft(d.id)}
                          disabled={busyId === d.id}
                          className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-line rounded-lg border border-slate-200/80 bg-white p-3 text-xs text-slate-700">
                      {d.body}
                    </p>
                  )}

                  {d.error && <p className="mt-2 text-xs text-red-600">{d.error}</p>}

                  {d.status === 'pending' && !isEditing && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApproveDraft(d.id)}
                        disabled={busyId === d.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Approve &amp; Send
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditDraft(d)}
                        disabled={busyId === d.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRejectDraft(d.id)}
                        disabled={busyId === d.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
            {drafts.length === 0 && (
              <p className="text-xs text-slate-500">No reply drafts yet. Run inbox triage to generate drafts.</p>
            )}
          </div>
        </section>

        {/* Automation Rules CRUD + Pending Actions */}
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Automation Rules</h2>
            <p className="text-xs text-slate-500">
              Match incoming emails (e.g. <code>from:*@stripe.com subject:invoice</code>) and trigger actions.
            </p>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <input
                value={ruleMatch}
                onChange={(e) => setRuleMatch(e.target.value)}
                placeholder="Match query (e.g. from:boss@company.com category:urgent)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 sm:col-span-2"
              />
              <select
                value={ruleAction}
                onChange={(e) => setRuleAction(e.target.value as RuleAction)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800"
              >
                <option value="draft">Auto-Draft Reply</option>
                <option value="label">Apply Gmail Label</option>
                <option value="archive">Archive (Requires Approval)</option>
                <option value="forward">Forward Email (Requires Approval)</option>
              </select>
              <input
                value={ruleValue}
                onChange={(e) => setRuleValue(e.target.value)}
                placeholder={
                  ruleAction === 'label'
                    ? 'Label name (e.g. Receipts)'
                    : ruleAction === 'forward'
                      ? 'Forward to email@domain.com'
                      : 'Optional parameter'
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800"
              />
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={ruleRequireApproval || ruleAction === 'archive' || ruleAction === 'forward'}
                  disabled={ruleAction === 'archive' || ruleAction === 'forward'}
                  onChange={(e) => setRuleRequireApproval(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600"
                />
                Require manual approval before executing
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleCreateRule()}
                  disabled={busyId === 'new-rule'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Rule
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold text-slate-800">{rule.match}</p>
                    <p className="text-[11px] text-slate-500">
                      Action: <span className="font-semibold text-slate-700">{rule.action}</span>
                      {rule.value ? ` (${rule.value})` : ''}
                      {rule.requireApproval ? ' • Approval required' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleRule(rule)}
                      disabled={busyId === rule.id}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        rule.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRule(rule.id)}
                      disabled={busyId === rule.id}
                      className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {rules.length === 0 && <p className="text-xs text-slate-500">No automation rules configured.</p>}
            </div>
          </div>

          {actions.filter((a) => a.status === 'pending').length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-amber-800">
                <ShieldAlert className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Pending Rule Approvals</h3>
              </div>
              <div className="mt-3 space-y-2">
                {actions
                  .filter((a) => a.status === 'pending')
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white p-3"
                    >
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          {a.action.toUpperCase()} {a.value ? `→ ${a.value}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {a.subject} • From: {a.from}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleResolveAction(a.id, true)}
                          disabled={busyId === a.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResolveAction(a.id, false)}
                          disabled={busyId === a.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Categorized Inbox Triage List */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Triaged Inbox</h2>
            <p className="text-xs text-slate-500">
              {triage.lastRunAt
                ? `Last triaged ${new Date(triage.lastRunAt).toLocaleString()}`
                : 'Not triaged yet — click Triage Inbox Now above.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({triage.items.length})
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {CATEGORY_META[cat].label} ({triage.counts?.[cat] ?? 0})
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {filteredItems.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-900">{item.subject}</span>
                  {item.unread && (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      NEW
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      CATEGORY_META[item.category]?.badgeClass ?? 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {CATEGORY_META[item.category]?.label ?? item.category}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  <span className="font-medium text-slate-800">{item.from}</span> &lt;{item.fromEmail}&gt; •{' '}
                  {item.snippet}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">Reason: {item.reason}</p>
              </div>
              <span className="text-xs text-slate-400">
                {item.date ? new Date(item.date).toLocaleDateString() : ''}
              </span>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              {loading ? 'Loading triaged emails...' : 'No emails in this category.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
