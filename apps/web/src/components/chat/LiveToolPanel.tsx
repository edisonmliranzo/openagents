'use client'

import { useMemo } from 'react'
import type { Message } from '@openagents/shared'
import { Activity, Compass, ExternalLink, Link2, MonitorSmartphone, SearchCheck } from 'lucide-react'
import { useChatStore, type ChatToolStreamEvent } from '@/stores/chat'

interface ToolRecord {
  tool: string
  success: boolean
  output: unknown
  error?: string
  createdAt: string
}

interface ComputerSessionView {
  sessionId: string
  mode: string
  status: 'active' | 'closed'
  title: string
  currentUrl: string | null
  textPreview: string
  linkCount: number
  updatedAt: string
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
  createdAt: string
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
    const raw = message as Message & { toolCallJson?: string | null; toolResultJson?: string | null }
    const call = safeParseJson<{ name?: unknown }>(raw.toolCallJson)
    const result = safeParseJson<{ success?: unknown; output?: unknown; error?: unknown }>(raw.toolResultJson)
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

function toolRecordsFromStream(events: ChatToolStreamEvent[], conversationId: string | null): ToolRecord[] {
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

function buildComputerSessions(records: ToolRecord[]) {
  const sessions = new Map<string, ComputerSessionView>()
  for (const record of records) {
    if (!record.tool.startsWith('computer_')) continue
    const output = record.output && typeof record.output === 'object'
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

    const page = output?.page && typeof output.page === 'object'
      ? (output.page as Record<string, unknown>)
      : null

    const mode = typeof output?.mode === 'string'
      ? output.mode
      : typeof output?.provider === 'string'
        ? output.provider
        : existing.mode
    const title = typeof page?.title === 'string' ? page.title : existing.title
    const currentUrl = typeof page?.currentUrl === 'string' ? page.currentUrl : existing.currentUrl
    const textPreview = typeof page?.textPreview === 'string' ? page.textPreview : existing.textPreview
    const linkCount = Number.isFinite(Number(page?.linkCount)) ? Number(page?.linkCount) : existing.linkCount
    const warning = typeof output?.warning === 'string'
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
      updatedAt: typeof page?.updatedAt === 'string' ? page.updatedAt : record.createdAt,
      status: record.tool === 'computer_session_end' ? 'closed' : existing.status,
    }
    sessions.set(sessionId, next)
  }

  return [...sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function buildDeepResearchRuns(records: ToolRecord[]) {
  const runs: DeepResearchRun[] = []
  for (const record of records) {
    if (record.tool !== 'deep_research') continue
    const output = record.output && typeof record.output === 'object'
      ? (record.output as Record<string, unknown>)
      : null
    if (!output) continue
    const summary = typeof output.summary === 'string' ? output.summary : ''
    const fetchedPages = Number.isFinite(Number(output.fetchedPages)) ? Number(output.fetchedPages) : 0
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

  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4)
}

export function LiveToolPanel() {
  const { messages, streamToolEvents, activeConversationId, runStatus, isStreaming } = useChatStore()

  const records = useMemo(() => {
    const merged = [
      ...toolRecordsFromMessages(messages),
      ...toolRecordsFromStream(streamToolEvents, activeConversationId),
    ]
    return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [messages, streamToolEvents, activeConversationId])

  const computerSessions = useMemo(() => buildComputerSessions(records), [records])
  const researchRuns = useMemo(() => buildDeepResearchRuns(records), [records])

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Live Tool Runtime</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            <Activity size={10} />
            {runStatus ?? (isStreaming ? 'running' : 'idle')}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Computer sessions and deep research citations update while tools execute.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-2">
            <MonitorSmartphone size={14} className="text-indigo-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">Computer Sessions</p>
          </div>
          <div className="mt-2 space-y-2">
            {computerSessions.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">No computer sessions yet in this conversation.</p>
            )}
            {computerSessions.map((session) => (
              <article key={session.sessionId} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {shortSessionId(session.sessionId)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-200">
                      {session.mode}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${session.status === 'active'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-[var(--surface-subtle)] text-slate-700 dark:text-slate-200'}`}>
                      {session.status}
                    </span>
                  </div>
                </div>
                {session.title && <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{session.title}</p>}
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
                  <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{session.textPreview}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  links: {session.linkCount}
                </p>
                {session.warning && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{session.warning}</p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-2">
            <SearchCheck size={14} className="text-cyan-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">Deep Research</p>
          </div>
          <div className="mt-2 space-y-3">
            {researchRuns.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">No deep research runs yet in this conversation.</p>
            )}
            {researchRuns.map((run, index) => (
              <article key={`${run.createdAt}-${index}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  Summary ({run.fetchedPages} page{run.fetchedPages === 1 ? '' : 's'} fetched)
                </p>
                <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{run.summary}</p>
                <div className="mt-2 space-y-1.5">
                  {run.citations.length === 0 && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">No citations found in output.</p>
                  )}
                  {run.citations.map((citation) => (
                    <a
                      key={`${citation.id}-${citation.url}`}
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-slate-700 transition hover:bg-[var(--surface-muted)] dark:text-slate-200"
                    >
                      <Link2 size={10} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{citation.title}</span>
                      <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${citation.status === 'fetched'
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-[var(--surface-subtle)] text-slate-700 dark:text-slate-300'}`}>
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
      </div>
    </aside>
  )
}
