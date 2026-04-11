'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { Message } from '@openagents/shared'
import {
  Activity,
  Compass,
  ExternalLink,
  Link2,
  MonitorSmartphone,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Workflow,
} from 'lucide-react'
import { useChatStore, type ChatToolStreamEvent } from '@/stores/chat'
import { getAssistantModeDefinition, type AssistantMode } from './assistantModes'

interface ToolRecord {
  tool: string
  success: boolean
  output: unknown
  error?: string
  createdAt: string | number
}

interface ComputerSessionView {
  sessionId: string
  mode: string
  status: 'active' | 'closed'
  title: string
  currentUrl: string | null
  textPreview: string
  linkCount: number
  updatedAt: string | number
  warning: string | null
}

interface DeepResearchCitation {
  id: number
  title: string
  url: string
  status: string
}

interface DeepResearchRun {
  summary: string
  citations: DeepResearchCitation[]
  fetchedPages: number
  createdAt: string | number
}

interface LiveToolPanelProps {
  assistantMode: AssistantMode
}

interface NextStep {
  title: string
  detail: string
  href: string
}

function safeParseJson<T>(value: string | null | undefined): T | null {
  if (!value || typeof value !== 'string') return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toolRecordsFromMessages(messages: Message[]): ToolRecord[] {
  const out: ToolRecord[] = []
  for (const message of messages) {
    if (message.role !== 'tool') continue
    const raw = message as Message & {
      toolCallJson?: string | null
      toolResultJson?: string | null
    }
    const call = safeParseJson<{ name?: unknown }>(raw.toolCallJson)
    const result = safeParseJson<{ success?: unknown; output?: unknown; error?: unknown }>(
      raw.toolResultJson,
    )
    const tool = typeof call?.name === 'string' ? call.name : ''
    if (!tool) continue
    out.push({
      tool,
      success: Boolean(result?.success),
      output: result?.output ?? null,
      ...(typeof result?.error === 'string' ? { error: result.error } : {}),
      createdAt: message.createdAt,
    })
  }
  return out
}

function toolRecordsFromStream(
  events: ChatToolStreamEvent[],
  conversationId: string | null,
): ToolRecord[] {
  if (!conversationId) return []
  return events
    .filter((event) => event.conversationId === conversationId)
    .map((event) => ({
      tool: event.tool,
      success: event.success,
      output: event.output,
      ...(event.error ? { error: event.error } : {}),
      createdAt: event.createdAt,
    }))
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function shortSessionId(value: string) {
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function timestampValue(value: unknown) {
  const ts = new Date(
    typeof value === 'string' || typeof value === 'number' ? value : '',
  ).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function compareTimestamps(left: unknown, right: unknown, direction: 'asc' | 'desc' = 'asc') {
  const delta = timestampValue(left) - timestampValue(right)
  return direction === 'asc' ? delta : -delta
}

function timeAgo(iso: string | number | null | undefined) {
  const ts = timestampValue(iso)
  if (!ts) return 'unknown'
  const deltaMs = Date.now() - ts
  const deltaMin = Math.max(0, Math.floor(deltaMs / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

function buildComputerSessions(records: ToolRecord[]) {
  const sessions = new Map<string, ComputerSessionView>()
  for (const record of records) {
    if (!record.tool.startsWith('computer_')) continue
    const output =
      record.output && typeof record.output === 'object'
        ? (record.output as Record<string, unknown>)
        : null
    const sessionId = typeof output?.sessionId === 'string' ? output.sessionId : ''
    if (!sessionId) continue

    const existing = sessions.get(sessionId) ?? {
      sessionId,
      mode: 'http',
      status: 'active' as const,
      title: '',
      currentUrl: null,
      textPreview: '',
      linkCount: 0,
      updatedAt: record.createdAt,
      warning: null,
    }

    const page =
      output?.page && typeof output.page === 'object'
        ? (output.page as Record<string, unknown>)
        : null

    const mode =
      typeof output?.mode === 'string'
        ? output.mode
        : typeof output?.provider === 'string'
          ? output.provider
          : existing.mode
    const title = typeof page?.title === 'string' ? page.title : existing.title
    const currentUrl = typeof page?.currentUrl === 'string' ? page.currentUrl : existing.currentUrl
    const textPreview =
      typeof page?.textPreview === 'string' ? page.textPreview : existing.textPreview
    const linkCount = Number.isFinite(Number(page?.linkCount))
      ? Number(page?.linkCount)
      : existing.linkCount
    const warning =
      typeof output?.warning === 'string'
        ? output.warning
        : typeof output?.note === 'string'
          ? output.note
          : existing.warning

    const next: ComputerSessionView = {
      ...existing,
      mode,
      title: clip(title || existing.title, 120),
      currentUrl,
      textPreview: clip(textPreview || existing.textPreview, 260),
      linkCount,
      warning,
      updatedAt:
        typeof page?.updatedAt === 'string' || typeof page?.updatedAt === 'number'
          ? page.updatedAt
          : record.createdAt,
      status: record.tool === 'computer_session_end' ? 'closed' : existing.status,
    }
    sessions.set(sessionId, next)
  }

  return [...sessions.values()].sort((a, b) => compareTimestamps(a.updatedAt, b.updatedAt, 'desc'))
}

function buildDeepResearchRuns(records: ToolRecord[]) {
  const runs: DeepResearchRun[] = []
  for (const record of records) {
    if (record.tool !== 'deep_research') continue
    const output =
      record.output && typeof record.output === 'object'
        ? (record.output as Record<string, unknown>)
        : null
    if (!output) continue
    const summary = typeof output.summary === 'string' ? output.summary : ''
    const fetchedPages = Number.isFinite(Number(output.fetchedPages))
      ? Number(output.fetchedPages)
      : 0
    const citationsRaw = Array.isArray(output.citations) ? output.citations : []
    const citations: DeepResearchCitation[] = citationsRaw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const row = entry as Record<string, unknown>
        const id = Number.isFinite(Number(row.id)) ? Number(row.id) : 0
        const title = typeof row.title === 'string' ? row.title : ''
        const url = typeof row.url === 'string' ? row.url : ''
        const status = typeof row.status === 'string' ? row.status : 'unknown'
        if (!id || !title || !url) return null
        return { id, title, url, status }
      })
      .filter((item): item is DeepResearchCitation => Boolean(item))
      .slice(0, 8)

    runs.push({
      summary: clip(summary || 'Research run completed.', 360),
      citations,
      fetchedPages,
      createdAt: record.createdAt,
    })
  }

  return runs.sort((a, b) => compareTimestamps(a.createdAt, b.createdAt, 'desc')).slice(0, 4)
}

function statusBadgeClass(status: string | null) {
  if (!status) return 'bg-[var(--surface-muted)] text-[var(--tone-default)]'
  if (status === 'done' || status === 'ready') return 'bg-emerald-100 text-emerald-700'
  if (status === 'error') return 'bg-rose-100 text-rose-700'
  if (status.includes('approval')) return 'bg-amber-100 text-amber-700'
  return 'bg-cyan-100 text-cyan-700'
}

function buildNextSteps({
  assistantMode,
  pendingApprovals,
  activeHandoffStatus,
  learnedSkillId,
}: {
  assistantMode: AssistantMode
  pendingApprovals: number
  activeHandoffStatus: string | null
  learnedSkillId: string | null
}): NextStep[] {
  const items: NextStep[] = []

  if (pendingApprovals > 0) {
    items.push({
      title: 'Review approvals',
      detail: `${pendingApprovals} tool actions are waiting on a human decision.`,
      href: '/approvals',
    })
  }

  if (activeHandoffStatus) {
    items.push({
      title: 'Open operator inbox',
      detail: `This session is currently in ${activeHandoffStatus} handoff mode.`,
      href: '/control/operator',
    })
  }

  if (assistantMode === 'plan') {
    items.push({
      title: 'Preview execution',
      detail: 'Use dry-run to test a tool plan before switching this session into execution.',
      href: '/control/dry-run',
    })
  }

  if (assistantMode === 'execute') {
    items.push({
      title: 'Keep the loop tight',
      detail: 'Operator inbox and dry-run are the fastest safety rails for execution-heavy sessions.',
      href: '/control/operator',
    })
  }

  if (assistantMode === 'autopilot') {
    items.push({
      title: 'Promote to watcher',
      detail: 'Turn repeated work into a schedule, webhook, or inbox-triggered automation.',
      href: '/control/watchers',
    })
  }

  if (learnedSkillId) {
    items.push({
      title: 'Inspect learned skill',
      detail: `The assistant inferred ${learnedSkillId}. Review it and decide if it should become a reusable pattern.`,
      href: '/agent/skills',
    })
  }

  if (items.length === 0) {
    items.push({
      title: 'Stage the next action',
      detail: 'Start with dry-run if you want a safer preview before the assistant acts.',
      href: '/control/dry-run',
    })
    items.push({
      title: 'Build a watcher',
      detail: 'If this work repeats, convert it into a reusable automation loop.',
      href: '/control/watchers',
    })
  }

  return items.slice(0, 4)
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] dark:text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">{detail}</p>
    </article>
  )
}

export function LiveToolPanel({ assistantMode }: LiveToolPanelProps) {
  const {
    messages,
    streamToolEvents,
    activeConversationId,
    runStatus,
    isStreaming,
    pendingApprovals,
    activeHandoff,
    learnedSkill,
  } = useChatStore()
  const assistantModeDefinition = useMemo(
    () => getAssistantModeDefinition(assistantMode),
    [assistantMode],
  )

  const records = useMemo(() => {
    const merged = [
      ...toolRecordsFromMessages(messages),
      ...toolRecordsFromStream(streamToolEvents, activeConversationId),
    ]
    return merged.sort((a, b) => compareTimestamps(a.createdAt, b.createdAt))
  }, [messages, streamToolEvents, activeConversationId])

  const computerSessions = useMemo(() => buildComputerSessions(records), [records])
  const researchRuns = useMemo(() => buildDeepResearchRuns(records), [records])
  const recentRecords = useMemo(() => [...records].slice(-6).reverse(), [records])
  const activeHandoffStatus =
    activeHandoff && (activeHandoff.status === 'open' || activeHandoff.status === 'claimed')
      ? activeHandoff.status
      : null
  const nextSteps = useMemo(
    () =>
      buildNextSteps({
        assistantMode,
        pendingApprovals: pendingApprovals.length,
        activeHandoffStatus,
        learnedSkillId: learnedSkill?.skillId ?? null,
      }),
    [assistantMode, pendingApprovals.length, activeHandoffStatus, learnedSkill?.skillId],
  )

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
            OpenAgents Control
          </p>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(
              runStatus ?? (isStreaming ? 'running' : 'ready'),
            )}`}
          >
            <Activity size={10} />
            {runStatus ?? (isStreaming ? 'running' : 'ready')}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)] dark:text-[var(--muted)]">
          Live OpenAgents posture, next actions, and execution telemetry for the active session.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="grid gap-2 md:grid-cols-2">
          <SummaryCard
            label="Mode"
            value={assistantModeDefinition.label}
            detail={assistantModeDefinition.caption}
          />
          <SummaryCard
            label="Approvals"
            value={String(pendingApprovals.length)}
            detail="Actions waiting on a human decision"
          />
          <SummaryCard
            label="Handoff"
            value={activeHandoffStatus ?? 'none'}
            detail={
              activeHandoffStatus ? 'Human operator is attached to this session' : 'OpenAgents owns this session'
            }
          />
          <SummaryCard
            label="Tool events"
            value={String(records.length)}
            detail="Runtime events captured in this conversation"
          />
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-indigo-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Next Best Actions
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {nextSteps.map((step) => (
              <Link
                key={`${step.title}-${step.href}`}
                href={step.href}
                className="block rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 transition hover:bg-[var(--surface)]"
              >
                <p className="text-xs font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                  {step.title}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
                  {step.detail}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <TimerReset size={14} className="text-cyan-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Execution Feed
            </p>
          </div>
          <div className="mt-2 space-y-2">
            {recentRecords.length === 0 && (
              <p className="text-xs text-[var(--muted)] dark:text-[var(--muted)]">
                No tool executions captured yet in this conversation.
              </p>
            )}
            {recentRecords.map((record, index) => (
              <article
                key={`${record.tool}-${record.createdAt}-${index}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                    {record.tool}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      record.success
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {record.success ? 'success' : 'issue'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
                  {timeAgo(record.createdAt)}
                </p>
                {record.error && (
                  <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
                    {clip(record.error, 160)}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-amber-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Control Rails
            </p>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Link
              href="/approvals"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--tone-default)] transition hover:bg-[var(--surface)] dark:text-[var(--tone-inverse)]"
            >
              Open approvals
            </Link>
            <Link
              href="/control/operator"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--tone-default)] transition hover:bg-[var(--surface)] dark:text-[var(--tone-inverse)]"
            >
              Open operator inbox
            </Link>
            <Link
              href="/control/dry-run"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--tone-default)] transition hover:bg-[var(--surface)] dark:text-[var(--tone-inverse)]"
            >
              Preview with dry-run
            </Link>
            <Link
              href="/control/watchers"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--tone-default)] transition hover:bg-[var(--surface)] dark:text-[var(--tone-inverse)]"
            >
              Open watchers
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <MonitorSmartphone size={14} className="text-blue-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Computer Sessions
            </p>
          </div>
          <div className="mt-2 space-y-2">
            {computerSessions.length === 0 && (
              <p className="text-xs text-[var(--muted)] dark:text-[var(--muted)]">
                No computer sessions yet in this conversation.
              </p>
            )}
            {computerSessions.map((session) => (
              <article
                key={session.sessionId}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                    {shortSessionId(session.sessionId)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)] dark:text-[var(--tone-inverse)]">
                      {session.mode}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        session.status === 'active'
                          ? 'oa-brand-badge text-white'
                          : 'bg-[var(--surface-subtle)] text-[var(--tone-default)] dark:text-[var(--tone-inverse)]'
                      }`}
                    >
                      {session.status}
                    </span>
                  </div>
                </div>
                {session.title && (
                  <p className="mt-1 text-xs text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                    {session.title}
                  </p>
                )}
                {session.currentUrl && (
                  <a
                    href={session.currentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex max-w-full items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
                  >
                    <Compass size={10} />
                    <span className="truncate">{session.currentUrl}</span>
                  </a>
                )}
                {session.textPreview && (
                  <p className="mt-1.5 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
                    {session.textPreview}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
                  links: {session.linkCount}
                </p>
                {session.warning && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                    {session.warning}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <SearchCheck size={14} className="text-sky-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Deep Research
            </p>
          </div>
          <div className="mt-2 space-y-3">
            {researchRuns.length === 0 && (
              <p className="text-xs text-[var(--muted)] dark:text-[var(--muted)]">
                No deep research runs yet in this conversation.
              </p>
            )}
            {researchRuns.map((run, index) => (
              <article
                key={`${run.createdAt}-${index}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5"
              >
                <p className="text-[11px] font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                  Summary ({run.fetchedPages} page{run.fetchedPages === 1 ? '' : 's'} fetched)
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
                  {run.summary}
                </p>
                <div className="mt-2 space-y-1.5">
                  {run.citations.length === 0 && (
                    <p className="text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
                      No citations found in output.
                    </p>
                  )}
                  {run.citations.map((citation) => (
                    <a
                      key={`${citation.id}-${citation.url}`}
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--tone-default)] transition hover:bg-[var(--surface-muted)] dark:text-[var(--tone-inverse)]"
                    >
                      <Link2 size={10} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{citation.title}</span>
                      <span
                        className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                          citation.status === 'fetched'
                            ? 'oa-brand-badge text-white'
                            : 'bg-[var(--surface-subtle)] text-[var(--tone-default)] dark:text-[var(--tone-inverse)]'
                        }`}
                      >
                        {citation.status}
                      </span>
                      <ExternalLink size={10} className="mt-0.5 shrink-0" />
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Workflow size={14} className="text-violet-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              OpenAgents Context
            </p>
          </div>
          <div className="mt-2 space-y-2 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
            <p>Mode: {assistantModeDefinition.label}</p>
            <p>Conversation: {activeConversationId ?? 'none selected'}</p>
            {learnedSkill && <p>Learned skill: {learnedSkill.skillId}</p>}
            {records.length > 0 && <p>Latest tool event: {timeAgo(records[records.length - 1].createdAt)}</p>}
          </div>
        </section>
      </div>
    </aside>
  )
}
