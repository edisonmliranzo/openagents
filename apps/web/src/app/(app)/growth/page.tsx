'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sdk } from '@/stores/auth'
import type {
  GrowthAutopilotState,
  OmnichannelPlatform,
  OmnichannelProspectDraft,
  OmnichannelTouchType,
} from '@openagents/sdk'

type MainViewTab = 'queue' | 'compose' | 'replies' | 'channels'

const TOUCH_LABELS: Record<
  OmnichannelTouchType,
  { label: string; icon: string; badgeClass: string; defaultPlatform: OmnichannelPlatform }
> = {
  comment: {
    label: 'Comment',
    icon: '💬',
    badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30',
    defaultPlatform: 'Reddit',
  },
  reply: {
    label: 'Reply',
    icon: '↩️',
    badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
    defaultPlatform: 'X',
  },
  dm: {
    label: 'DM',
    icon: '✉️',
    badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
    defaultPlatform: 'LinkedIn',
  },
  email: {
    label: 'Email',
    icon: '📧',
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
    defaultPlatform: 'Email (SMTP/IMAP)',
  },
  text_sms: {
    label: 'SMS / Text',
    icon: '📱',
    badgeClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30',
    defaultPlatform: 'SMS / Text',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: '🟢',
    badgeClass: 'bg-green-500/15 text-green-600 dark:text-green-300 border-green-500/30',
    defaultPlatform: 'WhatsApp',
  },
}

const ALL_PLATFORMS: OmnichannelPlatform[] = [
  'Reddit',
  'X',
  'LinkedIn',
  'Email (SMTP/IMAP)',
  'SMS / Text',
  'WhatsApp',
  'Hacker News',
]

export default function GrowthAutopilotPage() {
  const [state, setState] = useState<GrowthAutopilotState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Clean 4-tab view switcher
  const [viewTab, setViewTab] = useState<MainViewTab>('queue')

  // Channel filter inside Queue
  const [activeChannel, setActiveChannel] = useState<'all' | OmnichannelTouchType | 'skipped'>('all')

  // Collapsible details per card (hidden by default so cards stay clean)
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null)

  // Inline Edit state
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editSubject, setEditSubject] = useState('')

  // Quick 1-line rewrite instruction
  const [instruction, setInstruction] = useState('')
  const [rewriting, setRewriting] = useState(false)
  const [sendingApproved, setSendingApproved] = useState(false)

  // New Draft Composer state
  const [scanTouchType, setScanTouchType] = useState<OmnichannelTouchType>('comment')
  const [scanPlatform, setScanPlatform] = useState<OmnichannelPlatform>('Reddit')
  const [scanHandle, setScanHandle] = useState('')
  const [scanContext, setScanContext] = useState('')
  const [scanAngle, setScanAngle] = useState('')
  const [scanning, setScanning] = useState(false)

  const notify = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((prev) => (prev === msg ? null : prev)), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await sdk.agenticSuite.getGrowth()
      setState(res)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load Outreach queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const drafts = useMemo(() => state?.omnichannelDrafts ?? [], [state])
  const ownReplies = useMemo(() => state?.ownPostReplies ?? [], [state])
  const connectors = useMemo(() => state?.connectors ?? [], [state])

  const filteredDrafts = useMemo(() => {
    if (activeChannel === 'skipped') {
      return drafts.filter((d) => d.status === 'skipped_low_fit')
    }
    const nonSkipped = drafts.filter((d) => d.status !== 'skipped_low_fit')
    if (activeChannel === 'all') return nonSkipped
    return nonSkipped.filter((d) => d.touchType === activeChannel)
  }, [drafts, activeChannel])

  const counts = useMemo(() => {
    const active = drafts.filter((d) => d.status !== 'skipped_low_fit')
    const countByTouch = (t: OmnichannelTouchType) => active.filter((d) => d.touchType === t).length
    return {
      all: active.length,
      approved: drafts.filter((d) => d.status === 'approved').length,
      waitingReplies: ownReplies.filter((r) => r.status !== 'replied').length,
      comment: countByTouch('comment'),
      reply: countByTouch('reply'),
      dm: countByTouch('dm'),
      email: countByTouch('email'),
      text_sms: countByTouch('text_sms'),
      whatsapp: countByTouch('whatsapp'),
      skipped: drafts.filter((d) => d.status === 'skipped_low_fit').length,
    }
  }, [drafts, ownReplies])

  async function handleDraftAction(
    draft: OmnichannelProspectDraft,
    action: 'approve' | 'skip' | 'edit' | 'send_now',
  ) {
    setBusyId(draft.id)
    setError(null)
    try {
      const next = await sdk.agenticSuite.actOnOmnichannelDraft(draft.id, {
        action,
        editedDraft: action === 'edit' ? editBody : undefined,
        subjectLine: action === 'edit' && draft.touchType === 'email' ? editSubject : undefined,
      })
      setState(next)
      if (action === 'edit') {
        setEditingDraftId(null)
        notify('Saved edit, taught voice, and approved.')
      } else if (action === 'approve') {
        notify(`Approved ${TOUCH_LABELS[draft.touchType].label} for ${draft.prospectHandle}.`)
      } else if (action === 'send_now') {
        notify(`Sent ${TOUCH_LABELS[draft.touchType].label} to ${draft.prospectHandle}.`)
      } else if (action === 'skip') {
        notify(`Skipped ${draft.prospectHandle}.`)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSendAllApproved() {
    setSendingApproved(true)
    setError(null)
    try {
      const res = await sdk.agenticSuite.sendApprovedOmnichannelDrafts()
      setState(res.state)
      notify(`Sent ${res.sentCount} approved message(s).`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send approved drafts')
    } finally {
      setSendingApproved(false)
    }
  }

  async function handleQuickRewrite(e: React.FormEvent) {
    e.preventDefault()
    if (!instruction.trim()) return
    setRewriting(true)
    setError(null)
    try {
      const filterTouch =
        activeChannel !== 'all' && activeChannel !== 'skipped' ? activeChannel : 'all'
      const next = await sdk.agenticSuite.bulkRewriteOmnichannelDrafts({
        instruction: instruction.trim(),
        touchTypeFilter: filterTouch,
      })
      setState(next)
      notify(`Updated queue: "${instruction.trim()}"`)
      setInstruction('')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update drafts')
    } finally {
      setRewriting(false)
    }
  }

  async function handleGenerateDraft(e: React.FormEvent) {
    e.preventDefault()
    if (!scanHandle.trim() || !scanContext.trim()) return
    setScanning(true)
    setError(null)
    try {
      const next = await sdk.agenticSuite.scanOmnichannelProspects({
        touchType: scanTouchType,
        platform: scanPlatform,
        prospectHandle: scanHandle.trim(),
        sourceContext: scanContext.trim(),
        customAngle: scanAngle.trim() || undefined,
      })
      setState(next)
      setScanHandle('')
      setScanContext('')
      setScanAngle('')
      setActiveChannel(scanTouchType)
      setViewTab('queue')
      notify(`Created new ${TOUCH_LABELS[scanTouchType].label} draft.`)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to generate draft')
    } finally {
      setScanning(false)
    }
  }

  async function handleOwnReplyAction(replyId: string, action: 'approve_reply' | 'dismiss') {
    setBusyId(replyId)
    setError(null)
    try {
      const next = await sdk.agenticSuite.actOnOwnPostReply(replyId, { action })
      setState(next)
      notify(action === 'approve_reply' ? 'Reply sent.' : 'Dismissed.')
    } catch (err: any) {
      setError(err?.message ?? 'Reply action failed')
    } finally {
      setBusyId(null)
    }
  }

  function startEdit(draft: OmnichannelProspectDraft) {
    setEditingDraftId(draft.id)
    setEditBody(draft.draftMessage)
    setEditSubject(draft.subjectLine ?? '')
  }

  function selectChannelPreset(type: OmnichannelTouchType) {
    setScanTouchType(type)
    setScanPlatform(TOUCH_LABELS[type].defaultPlatform)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      {/* Simple Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
            Outreach
          </h1>
          <p className="text-xs text-[var(--muted)]">
            Comment · Reply · DM · Email · SMS · WhatsApp — nothing sends until you approve
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewTab(viewTab === 'compose' ? 'queue' : 'compose')}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--tone-strong)] transition hover:bg-[var(--surface-subtle)] dark:text-[var(--tone-inverse)]"
          >
            {viewTab === 'compose' ? '← Back to Queue' : '+ New Draft'}
          </button>

          <button
            type="button"
            onClick={() => void handleSendAllApproved()}
            disabled={sendingApproved || counts.approved === 0}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {sendingApproved ? 'Sending...' : `Send Approved (${counts.approved})`}
          </button>
        </div>
      </div>

      {/* Toast & Error */}
      {toast && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Clean 4-Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] pb-3">
        <button
          type="button"
          onClick={() => setViewTab('queue')}
          className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
            viewTab === 'queue'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-[var(--muted)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          Outreach Queue ({counts.all})
        </button>

        <button
          type="button"
          onClick={() => setViewTab('compose')}
          className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
            viewTab === 'compose'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-[var(--muted)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          + New Draft
        </button>

        <button
          type="button"
          onClick={() => setViewTab('replies')}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
            viewTab === 'replies'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-[var(--muted)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          <span>Incoming Replies</span>
          {counts.waitingReplies > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {counts.waitingReplies}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setViewTab('channels')}
          className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
            viewTab === 'channels'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-[var(--muted)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          Channels & Voice
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: OUTREACH QUEUE (CLEAN, SINGLE-COLUMN)                        */}
      {/* =================================================================== */}
      {viewTab === 'queue' && (
        <div className="space-y-4">
          {/* Channel Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${counts.all})` },
                { id: 'comment', label: `💬 Comment (${counts.comment})` },
                { id: 'reply', label: `↩️ Reply (${counts.reply})` },
                { id: 'dm', label: `✉️ DM (${counts.dm})` },
                { id: 'email', label: `📧 Email (${counts.email})` },
                { id: 'text_sms', label: `📱 SMS (${counts.text_sms})` },
                { id: 'whatsapp', label: `🟢 WhatsApp (${counts.whatsapp})` },
                { id: 'skipped', label: `Skipped (${counts.skipped})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveChannel(tab.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  activeChannel === tab.id
                    ? 'border-emerald-500/50 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--tone-strong)] dark:hover:text-[var(--tone-inverse)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Compact 1-Line Quick Instruction Bar */}
          <form onSubmit={handleQuickRewrite} className="flex gap-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Tell agent to adjust drafts (e.g. 'make shorter and more casual' or 'approve fit >= 90')..."
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs text-[var(--tone-strong)] outline-none focus:border-emerald-500 dark:text-[var(--tone-inverse)]"
            />
            <button
              type="submit"
              disabled={rewriting || !instruction.trim()}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--tone-strong)] transition hover:bg-[var(--surface-subtle)] disabled:opacity-40 dark:text-[var(--tone-inverse)]"
            >
              {rewriting ? 'Updating...' : 'Apply'}
            </button>
          </form>

          {/* Queue Cards */}
          {loading ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-xs text-[var(--muted)]">
              Loading outreach queue...
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
              <p className="text-sm font-medium text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                No drafts in this filter
              </p>
              <button
                type="button"
                onClick={() => setViewTab('compose')}
                className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                + Create a Draft
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDrafts.map((draft) => {
                const meta = TOUCH_LABELS[draft.touchType]
                const isEditing = editingDraftId === draft.id
                const isExpanded = expandedDetailsId === draft.id

                return (
                  <div
                    key={draft.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition"
                  >
                    {/* Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                          <span className="opacity-70">· {draft.platform}</span>
                        </span>

                        <span className="text-sm font-bold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                          {draft.prospectName}
                        </span>
                        <span className="font-mono text-xs text-[var(--muted)]">
                          {draft.prospectHandle}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {draft.icpFitScore}% Fit
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                            draft.status === 'approved'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                              : draft.status === 'sent'
                                ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                                : draft.status === 'skipped_low_fit'
                                  ? 'bg-slate-500/15 text-slate-500'
                                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                          }`}
                        >
                          {draft.status === 'pending_review'
                            ? 'Needs Review'
                            : draft.status === 'approved'
                              ? 'Approved'
                              : draft.status === 'sent'
                                ? 'Sent'
                                : 'Skipped'}
                        </span>
                      </div>
                    </div>

                    {/* Context Line */}
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      <span className="font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                        Context:{' '}
                      </span>
                      {draft.sourceContext}
                    </p>

                    {/* Draft Message or Inline Editor */}
                    {isEditing ? (
                      <div className="mt-3 space-y-2 rounded-xl border border-emerald-500/40 bg-[var(--surface-subtle)] p-3">
                        {draft.touchType === 'email' && (
                          <div>
                            <label className="block text-[10px] font-semibold uppercase text-[var(--muted)]">
                              Subject Line
                            </label>
                            <input
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--tone-strong)] outline-none dark:text-[var(--tone-inverse)]"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-[10px] font-semibold uppercase text-[var(--muted)]">
                            Message (Saving also teaches your voice style)
                          </label>
                          <textarea
                            rows={4}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs leading-relaxed text-[var(--tone-strong)] outline-none dark:text-[var(--tone-inverse)]"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyId === draft.id}
                            onClick={() => void handleDraftAction(draft, 'edit')}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            Save & Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDraftId(null)}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        {draft.touchType === 'email' && draft.subjectLine && (
                          <p className="mb-1.5 border-b border-[var(--border)] pb-1.5 text-xs font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                            Subject: {draft.subjectLine}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                          {draft.draftMessage}
                        </p>
                      </div>
                    )}

                    {/* Collapsible Reasoning (Hidden by default to keep UI clean) */}
                    {isExpanded && (
                      <div className="mt-2.5 space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--muted)]">
                        <p>
                          <strong className="text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                            Why they fit:{' '}
                          </strong>
                          {draft.whyTheyFit}
                        </p>
                        <p>
                          <strong className="text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                            Agent reasoning:{' '}
                          </strong>
                          {draft.chainOfThought}
                        </p>
                      </div>
                    )}

                    {/* Action Bar */}
                    {!isEditing && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {draft.status !== 'approved' && draft.status !== 'sent' && (
                            <button
                              type="button"
                              disabled={busyId === draft.id}
                              onClick={() => void handleDraftAction(draft, 'approve')}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                            >
                              ✓ Approve
                            </button>
                          )}

                          {draft.status !== 'sent' && (
                            <button
                              type="button"
                              disabled={busyId === draft.id}
                              onClick={() => void handleDraftAction(draft, 'send_now')}
                              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                            >
                              ⚡ Send Now
                            </button>
                          )}

                          {draft.status !== 'sent' && (
                            <button
                              type="button"
                              onClick={() => startEdit(draft)}
                              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--tone-default)] hover:bg-[var(--surface-subtle)] dark:text-[var(--tone-inverse)]"
                            >
                              ✏️ Edit
                            </button>
                          )}

                          {draft.status !== 'skipped_low_fit' && draft.status !== 'sent' && (
                            <button
                              type="button"
                              disabled={busyId === draft.id}
                              onClick={() => void handleDraftAction(draft, 'skip')}
                              className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-rose-500"
                            >
                              Skip
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDetailsId(isExpanded ? null : draft.id)
                          }
                          className="text-[11px] font-medium text-[var(--muted)] hover:underline"
                        >
                          {isExpanded ? 'Hide why they fit ▲' : 'Why they fit ▼'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: + NEW DRAFT COMPOSER                                         */}
      {/* =================================================================== */}
      {viewTab === 'compose' && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="text-base font-bold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
            Create a New Outreach Draft
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Pick a channel, paste who you want to reach and what they posted, and the agent will draft a message in your voice.
          </p>

          {/* 6 Channel Buttons */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
            {(['comment', 'reply', 'dm', 'email', 'text_sms', 'whatsapp'] as OmnichannelTouchType[]).map(
              (t) => {
                const active = scanTouchType === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => selectChannelPreset(t)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-xs font-semibold transition ${
                      active
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)] hover:text-[var(--tone-strong)] dark:hover:text-[var(--tone-inverse)]'
                    }`}
                  >
                    <span className="text-base">{TOUCH_LABELS[t].icon}</span>
                    <span>{TOUCH_LABELS[t].label}</span>
                  </button>
                )
              },
            )}
          </div>

          <form onSubmit={handleGenerateDraft} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                  Platform
                </label>
                <select
                  value={scanPlatform}
                  onChange={(e) => setScanPlatform(e.target.value as OmnichannelPlatform)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--tone-strong)] outline-none dark:text-[var(--tone-inverse)]"
                >
                  {ALL_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                  Who (Handle, Email, or Phone Number)
                </label>
                <input
                  value={scanHandle}
                  onChange={(e) => setScanHandle(e.target.value)}
                  placeholder="e.g. @sarah_ai, alex@acme.io, or +1 (415) 890-4419"
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--tone-strong)] outline-none dark:text-[var(--tone-inverse)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                What did they post or ask? (Context)
              </label>
              <textarea
                rows={3}
                value={scanContext}
                onChange={(e) => setScanContext(e.target.value)}
                placeholder="Paste their post, tweet, comment, email topic, or WhatsApp message..."
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--tone-strong)] outline-none dark:text-[var(--tone-inverse)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                Optional Note / Angle
              </label>
              <input
                value={scanAngle}
                onChange={(e) => setScanAngle(e.target.value)}
                placeholder="e.g. Keep it under 2 sentences, invite them to try the local Docker build"
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--tone-strong)] outline-none dark:text-[var(--tone-inverse)]"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={scanning || !scanHandle.trim() || !scanContext.trim()}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {scanning
                  ? 'Drafting...'
                  : `Generate ${TOUCH_LABELS[scanTouchType].label} Draft`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: INCOMING REPLIES TO YOUR POSTS                               */}
      {/* =================================================================== */}
      {viewTab === 'replies' && (
        <div className="space-y-3">
          {ownReplies.map((reply) => (
            <div
              key={reply.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                    {reply.platform}
                  </span>
                  <span className="text-sm font-bold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                    {reply.replierHandle}
                  </span>
                  <span className="text-xs text-[var(--muted)]">on "{reply.postTitle}"</span>
                </div>

                {reply.status === 'waiting_for_you' ? (
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-300">
                    Needs Your Input ({reply.escalationReason})
                  </span>
                ) : reply.status === 'replied' ? (
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
                    ✓ Replied
                  </span>
                ) : (
                  <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-600 dark:text-sky-300">
                    Ready to Reply
                  </span>
                )}
              </div>

              <p className="mt-2.5 text-xs text-[var(--muted)]">
                <strong>Their reply:</strong> "{reply.incomingReply}"
              </p>

              <div className="mt-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                <p className="mb-1 text-[10px] font-semibold uppercase text-[var(--muted)]">
                  Suggested Response
                </p>
                {reply.suggestedResponse}
              </div>

              {reply.status !== 'replied' && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === reply.id}
                    onClick={() => void handleOwnReplyAction(reply.id, 'approve_reply')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    ✓ Approve & Send Reply
                  </button>
                  <button
                    type="button"
                    disabled={busyId === reply.id}
                    onClick={() => void handleOwnReplyAction(reply.id, 'dismiss')}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-rose-500"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: CHANNELS & VOICE                                             */}
      {/* =================================================================== */}
      {viewTab === 'channels' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                  Connected Outreach Channels
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Daily pacing limits protect your accounts from rate-limits.
                </p>
              </div>
              <Link
                href="/control/channels"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--tone-strong)] hover:bg-[var(--surface)] dark:text-[var(--tone-inverse)]"
              >
                Configure Accounts →
              </Link>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {connectors.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                      {c.label}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {c.dailySent}/{c.dailyCap} today
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{c.transport}</p>
                </div>
              ))}
            </div>
          </div>

          {state?.voiceProfile && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                  Your Learned Voice Rules
                </h3>
                <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                  {state.voiceProfile.learnedEditsCount} edits learned
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Tone: {state.voiceProfile.toneSummary}
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                {state.voiceProfile.rules.map((rule, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-500">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
