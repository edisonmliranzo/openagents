'use client'

import { useCallback, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { sdk } from '@/stores/auth'
import type { DataLineageRecord, Message } from '@openagents/shared'
import { Brain, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { BranchButton } from '@/components/branch-button'

// Strip <thinking>…</thinking> blocks out of visible content and return them separately.
function extractThinkingBlocks(raw: string): { thinking: string[]; visible: string } {
  const thinking: string[] = []
  const visible = raw.replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (_, block: string) => {
    thinking.push(block.trim())
    return ''
  }).trim()
  return { thinking, visible }
}

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)] transition hover:text-[var(--tone-default)]"
      >
        <Brain size={12} className="shrink-0" />
        <span className="flex-1">Thinking</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <pre className="border-t border-[var(--border)] px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--tone-soft)]">
          {content}
        </pre>
      )}
    </div>
  )
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function roleLabel(role: Message['role']) {
  if (role === 'tool') return 'Tool'
  if (role === 'system') return 'System'
  if (role === 'user') return 'You'
  return 'OpenAgents'
}

interface CodeBlock {
  language?: string
  content: string
}

function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const regex = /```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) != null) {
    blocks.push({
      language: (match[1] ?? '').trim() || undefined,
      content: match[2].replace(/\n$/, ''),
    })
  }
  return blocks
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  if (typeof document === 'undefined') return
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export function MessageBubble({
  message,
  conversationId,
  messageIndex,
}: {
  message: Message
  conversationId?: string
  messageIndex?: number
}) {
  const isUser = message.role === 'user'
  const { thinking, visible } = useMemo(
    () => extractThinkingBlocks(message.content ?? ''),
    [message.content],
  )
  const codeBlocks = useMemo(() => extractCodeBlocks(visible).map((b) => b.content), [visible])
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [lineage, setLineage] = useState<DataLineageRecord | null>(null)
  const [lineageOpen, setLineageOpen] = useState(false)
  const [lineageLoading, setLineageLoading] = useState(false)
  const [lineageError, setLineageError] = useState('')
  const canShowLineage = message.role === 'agent' && message.status !== 'streaming'

  const tokenInfo = useMemo(() => {
    if (!message.metadata) return null
    try {
      const meta = typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata
      return meta?.tokens ?? null
    } catch {
      return null
    }
  }, [message.metadata])

  const handleCopyBlock = useCallback(async (index: number, content: string) => {
    try {
      await copyToClipboard(content)
      setCopiedCodeIndex(index)
      window.setTimeout(
        () => setCopiedCodeIndex((current) => (current === index ? null : current)),
        1200,
      )
    } catch {
      setCopiedCodeIndex(null)
    }
  }, [])

  const handleCopyAll = useCallback(async () => {
    const combined = codeBlocks.join('\n\n')
    if (!combined.trim()) return
    try {
      await copyToClipboard(combined)
      setCopiedAll(true)
      window.setTimeout(() => setCopiedAll(false), 1200)
    } catch {
      setCopiedAll(false)
    }
  }, [codeBlocks])

  const handleToggleLineage = useCallback(async () => {
    if (lineageOpen) {
      setLineageOpen(false)
      return
    }
    setLineageOpen(true)
    if (lineage || lineageLoading) return
    setLineageLoading(true)
    setLineageError('')
    try {
      const result = await sdk.lineage.byMessage(message.id)
      setLineage(result)
      if (!result) setLineageError('No lineage recorded for this response.')
    } catch (error: any) {
      setLineageError(error?.message ?? 'Failed to load lineage.')
    } finally {
      setLineageLoading(false)
    }
  }, [lineage, lineageLoading, lineageOpen, message.id])

  // ── User bubble ──────────────────────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="oa-user-bubble max-w-[90%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm shadow-none sm:max-w-[75%] xl:max-w-[62%]">
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
        <span className="pr-1 text-[11px] text-[#98a2b3]">
          {roleLabel(message.role)} | {formatClock(message.createdAt)}
        </span>
      </div>
    )
  }

  const isTool = message.role === 'tool'
  const isSystem = message.role === 'system'

  // ── Tool / System bubble (hidden from user chat) ─────────────────────────
  if (isTool || isSystem) {
    return null
  }

  // ── Agent bubble ─────────────────────────────────────────────────────────────
  return (
    <div className="group flex flex-col items-start gap-1.5">
      <div className="w-full max-w-full xl:max-w-[92%]">
        {thinking.map((block, idx) => (
          <ThinkingBlock key={`thinking-${idx}`} content={block} />
        ))}

        <div className="rounded-[22px] border border-[#e4e7ec] bg-white px-4 py-4 text-[14px] leading-relaxed text-[#101828] shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#2d3347] dark:bg-[#141824] dark:text-white">
          {visible ? (
            (() => {
              let codeIdx = -1
              return (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-2 text-[14px] leading-6 text-[#101828] dark:text-white">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-2 ml-5 list-disc space-y-1 text-[14px] leading-6 text-[#101828] dark:text-white">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-2 ml-5 list-decimal space-y-1 text-[14px] leading-6 text-[#101828] dark:text-white">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-[14px] leading-6 text-[#101828] dark:text-white">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-[#101828] dark:text-white">{children}</strong>
                    ),
                    em: ({ children }) => <em className="italic">{children}</em>,
                    h1: ({ children }) => (
                      <h1 className="mb-2 text-lg font-bold text-[#101828] dark:text-white">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mb-2 text-base font-bold text-[#101828] dark:text-white">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mb-1 text-sm font-bold text-[#101828] dark:text-white">{children}</h3>
                    ),
                    code: ({ children, className }) => {
                      const isBlock = className?.startsWith('language-')
                      if (!isBlock) {
                        return (
                          <code className="rounded bg-[#f2f4f7] px-1 py-0.5 font-mono text-[12px] text-[#101828] dark:bg-[#1e2433] dark:text-white">
                            {children}
                          </code>
                        )
                      }
                      codeIdx++
                      const currentIdx = codeIdx
                      const lang = (className ?? '').replace('language-', '') || 'code'
                      const content = String(children).replace(/\n$/, '')
                      return (
                        <div className="my-2 overflow-hidden rounded-xl border border-[#e4e7ec] dark:border-[#2d3347]">
                          <div className="flex items-center justify-between bg-[#f9fafb] px-3 py-1.5 dark:bg-[#1a1f2e]">
                            <span className="font-mono text-[10px] uppercase tracking-wide text-[#98a2b3]">
                              {lang}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleCopyBlock(currentIdx, content)}
                              className="rounded-full border border-[#e4e7ec] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#667085] transition hover:bg-[#f2f4f7] dark:border-[#2d3347] dark:bg-[#1e2433] dark:text-[#98a2b3]"
                            >
                              {copiedCodeIndex === currentIdx ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="overflow-x-auto bg-[#f9fafb] px-3 py-2 text-xs text-[#344054] dark:bg-[#141824] dark:text-[#c9d1e0]">
                            {content}
                          </pre>
                        </div>
                      )
                    },
                    pre: ({ children }) => <>{children}</>,
                  }}
                >
                  {visible}
                </ReactMarkdown>
              )
            })()
          ) : (
            <div className="flex items-center gap-1 py-1 text-[#98a2b3]">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
            </div>
          )}
        </div>

        {/* action row */}
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          {canShowLineage && (
            <button
              type="button"
              onClick={() => void handleToggleLineage()}
              className="text-[11px] text-[#98a2b3] transition hover:text-[#667085]"
            >
              Why this answer
            </button>
          )}
          {codeBlocks.length > 0 && (
            <button
              type="button"
              onClick={() => void handleCopyAll()}
              className="inline-flex items-center gap-1 text-[11px] text-[#98a2b3] transition hover:text-[#667085]"
            >
              <Copy size={11} />
              {copiedAll ? 'Copied' : codeBlocks.length > 1 ? 'Copy all code' : 'Copy code'}
            </button>
          )}
          {conversationId && messageIndex !== undefined && (
            <BranchButton
              sessionId={conversationId}
              messageIndex={messageIndex}
            />
          )}
          {tokenInfo && (
            <span className="ml-auto text-[10px] text-[#c0c7d4] dark:text-[#4a5270]" title={`in: ${tokenInfo.inputTokens} / out: ${tokenInfo.outputTokens}${tokenInfo.durationMs ? ` / ${(tokenInfo.durationMs / 1000).toFixed(1)}s` : ''}`}>
              {tokenInfo.totalTokens >= 1000
                ? `${(tokenInfo.totalTokens / 1000).toFixed(1)}k`
                : tokenInfo.totalTokens}{' '}tokens
            </span>
          )}
        </div>

        {lineageOpen && (
          <div className="mt-2 rounded-lg border border-[#e4e7ec] bg-[#f9fafb] p-3 text-xs text-[#667085] dark:border-[#2d3347] dark:bg-[#1a1f2e] dark:text-[#98a2b3]">
            {lineageLoading && <p>Loading lineage...</p>}
            {!lineageLoading && lineageError && (
              <p className="text-amber-600 dark:text-amber-400">{lineageError}</p>
            )}
            {!lineageLoading && lineage && (
              <div className="space-y-1.5">
                <p className="font-semibold text-[#344054] dark:text-[#c9d1e0]">Source: {lineage.source}</p>
                <p>Memory files: {lineage.memoryFiles.length > 0 ? lineage.memoryFiles.join(', ') : 'none'}</p>
                <p>
                  Tools:{' '}
                  {lineage.tools.length > 0
                    ? lineage.tools.map((t) => `${t.toolName} (${t.status})`).join(', ')
                    : 'none'}
                </p>
                <p>External sources: {lineage.externalSources.length > 0 ? lineage.externalSources.join(', ') : 'none'}</p>
                {lineage.notes.length > 0 && <p>Notes: {lineage.notes.join(' | ')}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <span className="pl-0.5 text-[11px] text-[#98a2b3]">
        {roleLabel(message.role)} | {formatClock(message.createdAt)}
      </span>
    </div>
  )
}
