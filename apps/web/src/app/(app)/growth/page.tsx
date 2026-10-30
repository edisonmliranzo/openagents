'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type {
  GrowthAutopilotState,
  OmnichannelPlatform,
  OmnichannelProspectDraft,
  OmnichannelTouchType,
} from '@openagents/sdk'
import {
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Filter,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  SkipForward,
  Sparkles,
  TrendingUp,
  UserCheck,
  Wand2,
} from 'lucide-react'

const TOUCH_TABS: Array<{
  id: 'all' | OmnichannelTouchType | 'skipped'
  label: string
  badgeColor: string
}> = [
  { id: 'all', label: 'All Queue', badgeColor: 'border-slate-700 bg-slate-800 text-slate-200' },
  { id: 'comment', label: '💬 Comment', badgeColor: 'border-orange-500/40 bg-orange-500/15 text-orange-300' },
  { id: 'reply', label: '↩️ Reply', badgeColor: 'border-sky-500/40 bg-sky-500/15 text-sky-300' },
  { id: 'dm', label: '✉️ DM', badgeColor: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300' },
  { id: 'email', label: '📧 Email', badgeColor: 'border-violet-500/40 bg-violet-500/15 text-violet-300' },
  { id: 'text_sms', label: '📱 Text / SMS', badgeColor: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300' },
  { id: 'whatsapp', label: '🟢 WhatsApp', badgeColor: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' },
  { id: 'skipped', label: '🚫 Skipped Noise', badgeColor: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
]

const TOUCH_TYPE_LABELS: Record<OmnichannelTouchType, { label: string; pillClass: string }> = {
  comment: { label: 'COMMENT', pillClass: 'border-orange-500/40 bg-orange-500/15 text-orange-300' },
  reply: { label: 'REPLY', pillClass: 'border-sky-500/40 bg-sky-500/15 text-sky-300' },
  dm: { label: 'DIRECT MESSAGE', pillClass: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300' },
  email: { label: 'EMAIL (SMTP)', pillClass: 'border-violet-500/40 bg-violet-500/15 text-violet-300' },
  text_sms: { label: 'TEXT / SMS', pillClass: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300' },
  whatsapp: { label: 'WHATSAPP', pillClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' },
}

const TOUCH_SCAN_PRESETS: Array<{
  label: string
  touchType: OmnichannelTouchType
  platform: OmnichannelPlatform
  prospectName: string
  prospectHandleOrContact: string
  prospectRole: string
  subjectLine?: string
  sourceContext: string
}> = [
  {
    label: '💬 Reddit Comment',
    touchType: 'comment',
    platform: 'Reddit',
    prospectName: 'u/dev_founder_99',
    prospectHandleOrContact: 'r/startups · u/dev_founder_99',
    prospectRole: 'Technical SaaS Founder',
    sourceContext:
      'Asked in r/startups: "How are solo founders handling Reddit, X, LinkedIn, Email, and WhatsApp follow-ups without hiring an SDR agency?"',
  },
  {
    label: '↩️ X Reply',
    touchType: 'reply',
    platform: 'X (Twitter)',
    prospectName: 'Devon Vance',
    prospectHandleOrContact: '@devonships',
    prospectRole: 'AI Product Builder',
    sourceContext:
      'Tweeted: "I want an AI agent that runs locally on my machine, drafts replies in my voice, and lets me approve everything before it posts."',
  },
  {
    label: '✉️ LinkedIn DM',
    touchType: 'dm',
    platform: 'LinkedIn',
    prospectName: 'Elena Rostova',
    prospectHandleOrContact: 'linkedin.com/in/elena-rostova-vp',
    prospectRole: 'VP of Growth at ScaleFlow',
    sourceContext:
      'Posted on LinkedIn: "Cold sequences are dead. Warm replies on real conversations convert 4x better for us this quarter."',
  },
  {
    label: '📧 Direct Email',
    touchType: 'email',
    platform: 'Email (SMTP/IMAP)',
    prospectName: 'Jordan Blake',
    prospectHandleOrContact: 'jordan@hyperstack.dev',
    prospectRole: 'CTO at HyperStack',
    subjectLine: 'your note on local browser automation + outbound safety',
    sourceContext:
      'Commented on Hacker News asking how teams prevent outbound follow-up emails from firing after a prospect already replied.',
  },
  {
    label: '📱 Text / SMS',
    touchType: 'text_sms',
    platform: 'SMS / Text',
    prospectName: 'Samir Patel',
    prospectHandleOrContact: '+1 (650) 442-8810',
    prospectRole: 'Founder · Requested Live Walkthrough',
    sourceContext:
      'Left mobile number on waitlist signup form: "Launching on Product Hunt Monday—need Comment + DM + SMS follow-up agents ready today."',
  },
  {
    label: '🟢 WhatsApp',
    touchType: 'whatsapp',
    platform: 'WhatsApp',
    prospectName: 'Mateo Silva',
    prospectHandleOrContact: 'WhatsApp · +34 612 889 104',
    prospectRole: 'Founder at CloudPulse',
    sourceContext:
      'Asked in SaaS Founders WhatsApp group: "Anyone have a solid tool that drafts WhatsApp + Email + X follow-ups from one queue?"',
  },
]

const BULK_COMMAND_PRESETS = [
  {
    label: '✂️ Shorten all under 50 words & drop hashtags',
    instruction: 'Shorten all pending drafts under 50 words, tighten the hook, and drop any hashtags',
    minFitScoreToApprove: undefined,
  },
  {
    label: '🤝 Make tone warmer & less corporate',
    instruction: 'Make all pending drafts warmer, less corporate, and more builder-to-builder',
    minFitScoreToApprove: undefined,
  },
  {
    label: '🎁 Mention 7-day full-access invite',
    instruction: 'Add a friendly 7-day full-access invite offer to each pending draft',
    minFitScoreToApprove: undefined,
  },
  {
    label: '✅ Rewrite + Approve ICP Fit ≥ 88',
    instruction: 'Tighten the opener on all drafts and approve prospects scoring 88 or higher',
    minFitScoreToApprove: 88,
  },
]

function fitScoreBadgeClass(score: number) {
  if (score >= 88) return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
  if (score >= 70) return 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
  return 'border-rose-500/30 bg-rose-500/10 text-rose-300'
}

export default function GrowthOmnichannelPage() {
  const addToast = useUIStore((s) => s.addToast)
  const [state, setState] = useState<GrowthAutopilotState | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Filter & UI state
  const [activeTab, setActiveTab] = useState<'all' | OmnichannelTouchType | 'skipped'>('all')
  const [expandedTraceIds, setExpandedTraceIds] = useState<Record<string, boolean>>({
    'omni-comment-1': true,
  })
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editStyleRule, setEditStyleRule] = useState('')

  // Bulk "Ask OpenAgents" rewriter state
  const [bulkInstruction, setBulkInstruction] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [sendingApproved, setSendingApproved] = useState(false)

  // New Touch / Prospect Scanner form state
  const [scanTouchType, setScanTouchType] = useState<OmnichannelTouchType>('comment')
  const [scanPlatform, setScanPlatform] = useState<OmnichannelPlatform>('Reddit')
  const [scanName, setScanName] = useState(TOUCH_SCAN_PRESETS[0].prospectName)
  const [scanContact, setScanContact] = useState(TOUCH_SCAN_PRESETS[0].prospectHandleOrContact)
  const [scanRole, setScanRole] = useState(TOUCH_SCAN_PRESETS[0].prospectRole)
  const [scanSubject, setScanSubject] = useState('')
  const [scanContext, setScanContext] = useState(TOUCH_SCAN_PRESETS[0].sourceContext)
  const [scanning, setScanning] = useState(false)

  const loadState = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sdk.agenticSuite.getGrowthState()
      setState(data)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to load Omnichannel Engagement Engine')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadState()
  }, [loadState])

  const queue = useMemo(() => state?.outreachQueue ?? [], [state?.outreachQueue])

  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      if (activeTab === 'skipped') return item.status === 'skipped'
      if (item.status === 'skipped') return false
      if (activeTab === 'all') return true
      return item.touchType === activeTab
    })
  }, [queue, activeTab])

  const approvedCount = useMemo(
    () => queue.filter((d) => d.status === 'approved').length,
    [queue],
  )

  const pendingCount = useMemo(
    () => queue.filter((d) => d.status === 'pending_review').length,
    [queue],
  )

  const countByTouch = useMemo(() => {
    const counts: Record<string, number> = {
      all: queue.filter((d) => d.status !== 'skipped').length,
      comment: 0,
      reply: 0,
      dm: 0,
      email: 0,
      text_sms: 0,
      whatsapp: 0,
      skipped: 0,
    }
    for (const item of queue) {
      if (item.status === 'skipped') {
        counts.skipped += 1
      } else {
        counts[item.touchType] = (counts[item.touchType] ?? 0) + 1
      }
    }
    return counts
  }, [queue])

  const handleDraftAction = async (
    draft: OmnichannelProspectDraft,
    action: 'approve' | 'unapprove' | 'send' | 'skip' | 'edit',
  ) => {
    setBusyId(draft.id)
    try {
      const updated = await sdk.agenticSuite.actOnOmnichannelDraft(draft.id, {
        action,
        ...(action === 'edit'
          ? {
              draftMessage: editBody,
              subjectLine: editSubject || undefined,
              styleFeedbackNote: editStyleRule || undefined,
            }
          : {}),
      })
      setState(updated)
      if (action === 'edit') {
        setEditingDraftId(null)
        setEditStyleRule('')
        addToast('success', 'Draft updated & voice profile taught from your edit')
      } else if (action === 'approve') {
        addToast('success', `${draft.touchType.toUpperCase()} approved & staged for paced delivery`)
      } else if (action === 'send') {
        addToast('success', `${draft.touchType.toUpperCase()} dispatched to ${draft.prospectName} via ${draft.platform}`)
      } else if (action === 'skip') {
        addToast('info', `Skipped ${draft.prospectName}`)
      }
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to update draft')
    } finally {
      setBusyId(null)
    }
  }

  const handleBulkRewrite = async (instructionOverride?: string, minScore?: number) => {
    const instruction = (instructionOverride ?? bulkInstruction).trim()
    if (!instruction) return
    setBulkBusy(true)
    try {
      const updated = await sdk.agenticSuite.bulkRewriteOmnichannelDrafts({
        instruction,
        touchTypeFilter: activeTab === 'all' || activeTab === 'skipped' ? 'all' : activeTab,
        minFitScoreToApprove: minScore,
      })
      setState(updated)
      setBulkInstruction('')
      addToast('success', 'Applied bulk instruction across queue & updated Voice Profile')
    } catch (err: any) {
      addToast('error', err?.message ?? 'Bulk rewrite failed')
    } finally {
      setBulkBusy(false)
    }
  }

  const handleSendAllApproved = async () => {
    if (approvedCount === 0) return
    setSendingApproved(true)
    try {
      const updated = await sdk.agenticSuite.sendApprovedOmnichannelDrafts({
        touchTypeFilter: activeTab === 'all' || activeTab === 'skipped' ? 'all' : activeTab,
      })
      setState(updated)
      addToast('success', `Dispatched ${approvedCount} approved touch(es) within daily channel caps`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to dispatch approved touches')
    } finally {
      setSendingApproved(false)
    }
  }

  const handleScanAndDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanContext.trim()) return
    setScanning(true)
    try {
      const updated = await sdk.agenticSuite.scanOmnichannelProspects({
        touchType: scanTouchType,
        platform: scanPlatform,
        prospectName: scanName.trim() || undefined,
        prospectHandleOrContact: scanContact.trim() || undefined,
        prospectRole: scanRole.trim() || undefined,
        sourceContext: scanContext.trim(),
        subjectLine: scanSubject.trim() || undefined,
      })
      setState(updated)
      if (activeTab !== 'all' && activeTab !== scanTouchType) {
        setActiveTab(scanTouchType)
      }
      addToast('success', `Scored ICP fit & drafted ${scanTouchType.toUpperCase()} in your voice`)
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to scan and draft touch')
    } finally {
      setScanning(false)
    }
  }

  const handleOwnPostAction = async (replyId: string, action: 'approve_send' | 'dismiss') => {
    setBusyId(replyId)
    try {
      const updated = await sdk.agenticSuite.actOnOwnPostReply(replyId, { action })
      setState(updated)
      addToast(
        'success',
        action === 'approve_send' ? 'Reply posted to thread commenter' : 'Comment dismissed',
      )
    } catch (err: any) {
      addToast('error', err?.message ?? 'Failed to update own-post reply')
    } finally {
      setBusyId(null)
    }
  }

  const copyToClipboard = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      addToast('success', 'Draft copied to clipboard')
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800)
    } catch {
      addToast('error', 'Failed to copy')
    }
  }

  return (
    <div className="oa-canvas min-h-full overflow-y-auto bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6 pb-24">
        {/* Hero Header */}
        <header className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-emerald-950/70 p-6 shadow-2xl">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                <Sparkles size={13} />
                Approve-First Omnichannel Engagement Engine · Local-First
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Comment, Reply, DM, Email, Text/SMS &amp; WhatsApp Autopilot
              </h1>
              <p className="max-w-3xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                Prioritizes high-fit prospects (0–100 ICP Fit Score) across Reddit, X, LinkedIn, Threads, Email (SMTP/IMAP),
                SMS/Text, and WhatsApp. Drafts every touch in your voice with full Chain-of-Thought—nothing goes out until
                you approve and send.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleSendAllApproved()}
                disabled={sendingApproved || approvedCount === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sendingApproved ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send Approved ({approvedCount} Ready)
              </button>

              <button
                type="button"
                onClick={() => void loadState()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Sync Queue
              </button>
            </div>
          </div>

          {/* 6-Stage Conversation-to-Customer Funnel Bar */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
              <div className="text-[11px] font-medium text-slate-400">1. ICP Prospects Scored</div>
              <div className="mt-1 text-2xl font-black text-white">
                {state?.funnel?.prospectsPrioritized ?? 32}
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-300">Auto-filtered noise &lt; 40</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
              <div className="text-[11px] font-medium text-slate-400">2. Drafts Waiting Review</div>
              <div className="mt-1 text-2xl font-black text-amber-300">{pendingCount}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">Approve-first safety rail</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
              <div className="text-[11px] font-medium text-slate-400">3. Approved (Staged)</div>
              <div className="mt-1 text-2xl font-black text-cyan-300">{approvedCount}</div>
              <div className="mt-0.5 text-[10px] text-cyan-200/80">Ready for paced send</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
              <div className="text-[11px] font-medium text-slate-400">4. Sent Today (Paced)</div>
              <div className="mt-1 text-2xl font-black text-indigo-300">
                {state?.funnel?.sentToday ?? 12}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">Within daily channel caps</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
              <div className="text-[11px] font-medium text-slate-400">5. Replies &amp; Visits (30d)</div>
              <div className="mt-1 text-2xl font-black text-emerald-300">
                {state?.funnel?.repliesOrVisits ?? 39}
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-400">▲ +38% qualified traffic</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
              <div className="text-[11px] font-medium text-slate-400">6. Trials → Customers</div>
              <div className="mt-1 text-2xl font-black text-white">
                {state?.funnel?.trialsStarted ?? 14} → {state?.funnel?.payingCustomers ?? 6}
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-300">
                ${(state?.mrrProjectedUsd ?? 29400).toLocaleString()} Projected MRR
              </div>
            </div>
          </div>
        </header>

        {/* "Ask OpenAgents" Bulk Plain-Language Queue Director */}
        <section className="rounded-3xl border border-indigo-500/25 bg-slate-900/85 p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                <Wand2 size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-white">
                  Ask OpenAgents · Plain-English Queue Director &amp; Voice Trainer
                </h2>
                <p className="text-xs text-slate-400">
                  Rewrite all queued Comments, Replies, DMs, Emails, SMS Texts, and WhatsApp messages in one sentence—every instruction teaches your Voice Profile ({state?.voiceProfile?.learnedEditsCount ?? 14} learned rules).
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {BULK_COMMAND_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulkRewrite(preset.instruction, preset.minFitScoreToApprove)}
                className="rounded-xl border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-indigo-400/60 hover:text-indigo-200 disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleBulkRewrite()
            }}
            className="mt-3 flex flex-col gap-2.5 sm:flex-row"
          >
            <input
              type="text"
              value={bulkInstruction}
              onChange={(e) => setBulkInstruction(e.target.value)}
              placeholder='e.g. "Reword all pending DMs, SMS, and WhatsApp messages under 45 words, sound less pitchy, and approve ICP Fit >= 88"'
              className="h-10 flex-1 rounded-xl border border-slate-700/80 bg-slate-950/90 px-3.5 text-xs text-slate-100 outline-none transition focus:border-indigo-400 sm:text-sm"
            />
            <button
              type="submit"
              disabled={bulkBusy || !bulkInstruction.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              Apply to Queue
            </button>
          </form>
        </section>

        {/* Main 2-Column Layout: Left = 6-Channel Review Queue, Right = New Touch Scanner + 72h Reply Watcher + Connectors */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT 8 COLS: Omnichannel Review Queue */}
          <div className="space-y-4 lg:col-span-8">
            {/* Touch Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/75 p-2">
              {TOUCH_TABS.map((tab) => {
                const active = activeTab === tab.id
                const count = countByTouch[tab.id] ?? 0
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        active ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Draft Cards */}
            <div className="space-y-4">
              {filteredQueue.map((draft) => {
                const touchMeta = TOUCH_TYPE_LABELS[draft.touchType]
                const traceOpen = Boolean(expandedTraceIds[draft.id])
                const isEditing = editingDraftId === draft.id
                const isBusy = busyId === draft.id

                return (
                  <article
                    key={draft.id}
                    className="rounded-3xl border border-slate-800/90 bg-slate-900/85 p-5 shadow-lg transition hover:border-slate-700"
                  >
                    {/* Card Top Metadata Row */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${touchMeta.pillClass}`}
                          >
                            {touchMeta.label}
                          </span>
                          <span className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200">
                            {draft.platform}
                          </span>
                          <span
                            className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-black ${fitScoreBadgeClass(
                              draft.icpFitScore,
                            )}`}
                          >
                            ICP Fit {draft.icpFitScore}/100
                          </span>
                          {draft.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-bold text-cyan-300">
                              <CheckCircle2 size={12} />
                              Approved · Staged
                            </span>
                          )}
                          {draft.status === 'sent' && (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                              <Check size={12} />
                              Sent
                            </span>
                          )}
                          {draft.status === 'skipped' && (
                            <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
                              Auto-Skipped Noise
                            </span>
                          )}
                        </div>

                        <div className="pt-1">
                          <span className="text-base font-bold text-white">{draft.prospectName}</span>
                          <span className="ml-2 text-xs font-mono text-emerald-300">
                            {draft.prospectHandleOrContact}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">· {draft.prospectRole}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTraceIds((prev) => ({ ...prev, [draft.id]: !prev[draft.id] }))
                        }
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-slate-600 hover:text-white"
                      >
                        <Brain size={12} className="text-indigo-400" />
                        Why They Fit &amp; Chain of Thought
                        {traceOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                    </div>

                    {/* Source Conversation / Trigger Context */}
                    <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Observed Conversation / Signal Context
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-200">{draft.sourceContext}</p>
                    </div>

                    {/* Expandable ICP Reasoning & Chain of Thought */}
                    {traceOpen && (
                      <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-950/15 p-3.5 sm:grid-cols-2">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                            Why {draft.prospectName} Fits Your ICP
                          </div>
                          <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
                            {draft.whyTheyFit.map((reason, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="mt-0.5 text-emerald-400">•</span>
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                            Agent Chain of Thought
                          </div>
                          <ol className="mt-1.5 space-y-1 text-xs text-slate-300">
                            {draft.chainOfThought.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="font-mono text-[10px] text-indigo-400">{idx + 1}.</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}

                    {/* Draft Composer / Viewer */}
                    <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-slate-950/90 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-300">
                          Drafted in Your Voice · Approve-First
                        </span>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(draft.id, draft.draftMessage)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                        >
                          {copiedId === draft.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          {copiedId === draft.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>

                      {draft.subjectLine && !isEditing && (
                        <div className="mb-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200">
                          <span className="font-semibold text-slate-400">Subject: </span>
                          {draft.subjectLine}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="space-y-2.5">
                          {draft.touchType === 'email' && (
                            <input
                              type="text"
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              placeholder="Email subject line"
                              className="h-9 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-white outline-none focus:border-emerald-400"
                            />
                          )}
                          <textarea
                            rows={4}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs leading-relaxed text-white outline-none focus:border-emerald-400 sm:text-sm"
                          />
                          <input
                            type="text"
                            value={editStyleRule}
                            onChange={(e) => setEditStyleRule(e.target.value)}
                            placeholder='Optional: Teach Voice Profile why you edited this (e.g. "Always open WhatsApp touches with a question")'
                            className="h-9 w-full rounded-xl border border-indigo-500/30 bg-slate-900 px-3 text-xs text-indigo-200 outline-none focus:border-indigo-400"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingDraftId(null)}
                              className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDraftAction(draft, 'edit')}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                            >
                              {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              Save &amp; Teach Voice
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-100 sm:text-sm">
                          {draft.draftMessage}
                        </p>
                      )}
                    </div>

                    {/* Action Bar: Skip | Edit | Approve | Send Now */}
                    {draft.status !== 'sent' && !isEditing && (
                      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDraftAction(draft, 'skip')}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-rose-500/40 hover:text-rose-200 disabled:opacity-50"
                          >
                            <SkipForward size={12} />
                            Skip
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setEditingDraftId(draft.id)
                              setEditBody(draft.draftMessage)
                              setEditSubject(draft.subjectLine ?? '')
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-400/50 hover:text-indigo-200 disabled:opacity-50"
                          >
                            <Edit3 size={12} />
                            Edit Draft
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {draft.status === 'approved' ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDraftAction(draft, 'unapprove')}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
                            >
                              Put Back in Review
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDraftAction(draft, 'approve')}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-1.5 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} />
                              Approve (Stage)
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDraftAction(draft, 'send')}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            Send {touchMeta.label} Now
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}

              {filteredQueue.length === 0 && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-400">
                  No drafts in this filter tab right now. Use the Omnichannel Scanner on the right to draft a new Comment, Reply, DM, Email, SMS, or WhatsApp touch!
                </div>
              )}
            </div>
          </div>

          {/* RIGHT 4 COLS: New Touch Scanner + 72h Own-Post Reply Watcher + Connectors + Voice Rules */}
          <div className="space-y-5 lg:col-span-4">
            {/* 1. Omnichannel Touch & Prospect Scanner */}
            <section className="rounded-3xl border border-emerald-500/25 bg-slate-900/90 p-5 shadow-xl">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                  <Plus size={16} />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Draft New Comment, Reply, DM, Email, SMS or WhatsApp
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Click a channel preset or paste any thread, phone, or email
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {TOUCH_SCAN_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setScanTouchType(preset.touchType)
                      setScanPlatform(preset.platform)
                      setScanName(preset.prospectName)
                      setScanContact(preset.prospectHandleOrContact)
                      setScanRole(preset.prospectRole)
                      setScanSubject(preset.subjectLine ?? '')
                      setScanContext(preset.sourceContext)
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      scanTouchType === preset.touchType
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                        : 'border-slate-700/80 bg-slate-800/70 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleScanAndDraft} className="mt-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                      Touch Type
                    </label>
                    <select
                      value={scanTouchType}
                      onChange={(e) => {
                        const next = e.target.value as OmnichannelTouchType
                        setScanTouchType(next)
                        if (next === 'comment') setScanPlatform('Reddit')
                        else if (next === 'reply') setScanPlatform('X (Twitter)')
                        else if (next === 'dm') setScanPlatform('LinkedIn')
                        else if (next === 'email') setScanPlatform('Email (SMTP/IMAP)')
                        else if (next === 'text_sms') setScanPlatform('SMS / Text')
                        else if (next === 'whatsapp') setScanPlatform('WhatsApp')
                      }}
                      className="h-9 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    >
                      <option value="comment">💬 Comment (Public Thread)</option>
                      <option value="reply">↩️ Reply (X / Threads / Post)</option>
                      <option value="dm">✉️ Direct Message (DM)</option>
                      <option value="email">📧 Email (Local SMTP)</option>
                      <option value="text_sms">📱 Text / SMS</option>
                      <option value="whatsapp">🟢 WhatsApp</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                      Platform / Channel
                    </label>
                    <select
                      value={scanPlatform}
                      onChange={(e) => setScanPlatform(e.target.value as OmnichannelPlatform)}
                      className="h-9 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    >
                      <option value="Reddit">Reddit</option>
                      <option value="X (Twitter)">X (Twitter)</option>
                      <option value="LinkedIn">LinkedIn</option>
                      <option value="Threads">Threads</option>
                      <option value="Hacker News">Hacker News</option>
                      <option value="Instagram">Instagram</option>
                      <option value="Email (SMTP/IMAP)">Email (SMTP/IMAP)</option>
                      <option value="SMS / Text">SMS / Text</option>
                      <option value="WhatsApp">WhatsApp</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                      Prospect Name
                    </label>
                    <input
                      type="text"
                      value={scanName}
                      onChange={(e) => setScanName(e.target.value)}
                      placeholder="e.g. Priya K."
                      className="h-9 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                      Handle / Email / Phone
                    </label>
                    <input
                      type="text"
                      value={scanContact}
                      onChange={(e) => setScanContact(e.target.value)}
                      placeholder="@handle, email, or +1..."
                      className="h-9 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                {scanTouchType === 'email' && (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                      Email Subject Line
                    </label>
                    <input
                      type="text"
                      value={scanSubject}
                      onChange={(e) => setScanSubject(e.target.value)}
                      placeholder="e.g. quick follow-up on your HN question"
                      className="h-9 w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                    What They Posted / Why You’re Reaching Out
                  </label>
                  <textarea
                    rows={3}
                    value={scanContext}
                    onChange={(e) => setScanContext(e.target.value)}
                    placeholder="Paste their post, comment, or inbound lead note..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-100 outline-none focus:border-emerald-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={scanning || !scanContext.trim()}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 text-xs font-bold text-slate-950 shadow-md transition hover:brightness-110 disabled:opacity-50"
                >
                  {scanning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Score ICP &amp; Draft {scanTouchType.toUpperCase()} in My Voice
                </button>
              </form>
            </section>

            {/* 2. 72-Hour Own-Post Reply Watcher */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} className="text-sky-400" />
                  <h2 className="text-sm font-bold text-white">72h Own-Post Reply Watcher</h2>
                </div>
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                  Live Guard
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Watches your own X, Reddit, LinkedIn &amp; Threads posts for 72h. Pricing and sensitive questions are flagged &ldquo;Waiting for you&rdquo;.
              </p>

              <div className="mt-3 space-y-3">
                {(state?.ownPostWatchers ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-white">
                        {item.platform} · {item.commenterHandle}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          item.status === 'replied'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : item.needsFounderAttention
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-sky-500/15 text-sky-300'
                        }`}
                      >
                        {item.status === 'replied'
                          ? 'Replied ✓'
                          : item.needsFounderAttention
                            ? '⚠️ Waiting for You'
                            : `${item.hoursRemaining}h watch left`}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">&ldquo;{item.incomingComment}&rdquo;</p>
                    {item.attentionReason && (
                      <p className="text-[11px] font-medium text-amber-300">{item.attentionReason}</p>
                    )}

                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-xs text-slate-200">
                      <span className="font-semibold text-emerald-300">Drafted Reply: </span>
                      {item.draftedReply}
                    </div>

                    {item.status !== 'replied' && item.status !== 'dismissed' && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void handleOwnPostAction(item.id, 'dismiss')}
                          className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void handleOwnPostAction(item.id, 'approve_send')}
                          className="rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-bold text-slate-950 hover:bg-emerald-400"
                        >
                          Approve &amp; Reply
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* 3. Local Channels, SMTP/IMAP, SMS & WhatsApp Connectors */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                <h2 className="text-sm font-bold text-white">
                  Omnichannel Bridges &amp; Daily Pacing Caps
                </h2>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Credentials stay encrypted on your machine. Daily caps &amp; inbox reply protection prevent spam.
              </p>

              <div className="mt-3 space-y-2.5">
                {(state?.connectors ?? []).map((conn) => (
                  <div
                    key={conn.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/75 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{conn.label}</span>
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        {conn.dailySent}/{conn.dailyCap} today
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-mono text-slate-300">
                      {conn.providerDetail}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">{conn.safetyNote}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* 4. Learned Voice Profile */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">Learned Voice Profile</span>
                <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-bold text-indigo-300">
                  {state?.voiceProfile?.learnedEditsCount ?? 14} Edits Learned
                </span>
              </div>
              <p className="mt-1 text-xs text-emerald-300">{state?.voiceProfile?.tone}</p>
              <ul className="mt-2.5 space-y-1.5 text-xs text-slate-300">
                {(state?.voiceProfile?.rules ?? []).map((rule, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-indigo-400">✓</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
