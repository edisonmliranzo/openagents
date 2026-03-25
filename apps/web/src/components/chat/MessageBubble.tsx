'use client'

import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { DataLineageRecord, Message } from '@openagents/shared'
import { Brain, ChevronDown, ChevronRight, Copy } from 'lucide-react'

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
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-[var(--muted)] transition hover:text-[var(--tone-default)] dark:hover:text-[var(--tone-inverse)]"
      >
        <Brain size={12} className="shrink-0" />
        <span className="flex-1">Thinking</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <pre className="border-t border-[var(--border)] px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
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

interface MessageBlock {
  type: 'text' | 'code'
  content: string
  language?: string
}

function looksLikeCodeLine(trimmed: string) {
  return (
    trimmed.startsWith('$ ') ||
    trimmed.startsWith('curl ') ||
    trimmed.startsWith('export ') ||
    trimmed.startsWith('pnpm ') ||
    trimmed.startsWith('npm ') ||
    trimmed.startsWith('yarn ') ||
    trimmed.startsWith('git ') ||
    trimmed.startsWith('docker ') ||
    trimmed.startsWith('kubectl ') ||
    trimmed.startsWith('import ') ||
    trimmed.startsWith('from ') ||
    trimmed.startsWith('const ') ||
    trimmed.startsWith('let ') ||
    trimmed.startsWith('function ') ||
    trimmed.startsWith('class ') ||
    trimmed.startsWith('if ') ||
    trimmed.startsWith('for ') ||
    trimmed.startsWith('while ') ||
    trimmed.startsWith('return ') ||
    trimmed.includes('=>') ||
    trimmed.includes('--') ||
    trimmed.includes('{') ||
    trimmed.includes('}') ||
    trimmed.includes(';')
  )
}

function parsePlainTextBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = []
  const lines = text.split('\n')
  let codeBuffer: string[] = []

  const flushCode = () => {
    if (!codeBuffer.length) return
    blocks.push({ type: 'code', content: codeBuffer.join('\n') })
    codeBuffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushCode()
      blocks.push({ type: 'text', content: '' })
      continue
    }

    if (looksLikeCodeLine(trimmed)) {
      codeBuffer.push(line)
      continue
    }

    flushCode()
    blocks.push({ type: 'text', content: line })
  }

  flushCode()
  return blocks
}

function parseMessageBlocks(text: string): MessageBlock[] {
  if (!text.includes('```')) {
    return parsePlainTextBlocks(text)
  }

  const blocks: MessageBlock[] = []
  const regex = /```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) != null) {
    const before = text.slice(last, match.index)
    if (before) {
      blocks.push(...parsePlainTextBlocks(before))
    }

    blocks.push({
      type: 'code',
      language: (match[1] ?? '').trim() || undefined,
      content: match[2].replace(/\n$/, ''),
    })

    last = regex.lastIndex
  }

  const tail = text.slice(last)
  if (tail) {
    blocks.push(...parsePlainTextBlocks(tail))
  }

  return blocks.length > 0 ? blocks : parsePlainTextBlocks(text)
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

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const { thinking, visible } = useMemo(
    () => extractThinkingBlocks(message.content ?? ''),
    [message.content],
  )
  const blocks = useMemo(() => parseMessageBlocks(visible), [visible])
  const codeBlocks = useMemo(
    () => blocks.filter((block) => block.type === 'code').map((block) => block.content),
    [blocks],
  )
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [lineage, setLineage] = useState<DataLineageRecord | null>(null)
  const [lineageOpen, setLineageOpen] = useState(false)
  const [lineageLoading, setLineageLoading] = useState(false)
  const [lineageError, setLineageError] = useState('')
  const canShowLineage = message.role === 'agent' && message.status !== 'streaming'

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
      if (!result) {
        setLineageError('No lineage recorded for this response.')
      }
    } catch (error: any) {
      setLineageError(error?.message ?? 'Failed to load lineage.')
    } finally {
      setLineageLoading(false)
    }
  }, [lineage, lineageLoading, lineageOpen, message.id])

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[92%] rounded-2xl rounded-br-sm border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-[var(--tone-strong)] shadow-sm sm:max-w-[76%] dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-[var(--tone-inverse)]">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-500 dark:text-rose-300">
            {roleLabel(message.role)} · {formatClock(message.createdAt)}
          </p>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  const isTool = message.role === 'tool'
  const isSystem = message.role === 'system'

  return (
    <div className="space-y-2">
      <article
        className={clsx(
          'rounded-2xl border px-4 py-3 shadow-sm',
          isTool
            ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/10'
            : isSystem
              ? 'border-slate-200 bg-slate-50/60 dark:border-slate-500/20 dark:bg-slate-500/10'
              : 'border-[var(--border)] bg-[var(--surface)]',
        )}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
              {roleLabel(message.role)} · {formatClock(message.createdAt)} · {message.status}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {canShowLineage && (
              <button
                type="button"
                onClick={() => void handleToggleLineage()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-semibold transition hover:bg-[var(--surface-subtle)] dark:text-[var(--tone-inverse)]"
              >
                Why this answer
              </button>
            )}
            {codeBlocks.length > 0 && (
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-semibold transition hover:bg-[var(--surface-subtle)] dark:text-[var(--tone-inverse)]"
              >
                <Copy size={12} />
                {copiedAll ? 'Copied' : codeBlocks.length > 1 ? 'Copy all code' : 'Copy code'}
              </button>
            )}
          </div>
        </div>

        {thinking.map((block, idx) => (
          <ThinkingBlock key={`thinking-${idx}`} content={block} />
        ))}

        <div className="space-y-1">
          {visible ? (
            blocks.map((block, idx) => {
              if (block.type === 'text') {
                if (!block.content.trim()) return <div key={`line-empty-${idx}`} className="h-2" />
                return (
                  <p
                    key={`line-p-${idx}`}
                    className="text-[14px] leading-6 text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]"
                  >
                    {block.content}
                  </p>
                )
              }

              const lang = block.language?.trim() ?? ''
              return (
                <div
                  key={`line-code-${idx}`}
                  className="my-2 overflow-hidden rounded-xl border border-[var(--border)]"
                >
                  <div className="flex items-center justify-between bg-[var(--surface-muted)] px-3 py-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted)] dark:text-[var(--muted)]">
                      {lang || 'code'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyBlock(idx, block.content)}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold transition hover:bg-[var(--surface-subtle)] dark:text-[var(--tone-inverse)]"
                    >
                      {copiedCodeIndex === idx ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="oa-code-surface overflow-x-auto px-3 py-2 text-xs text-[var(--tone-inverse)]">
                    {block.content}
                  </pre>
                </div>
              )
            })
          ) : (
            <div className="flex items-center gap-1 py-1 text-[var(--tone-soft)]">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
            </div>
          )}
        </div>

        {lineageOpen && (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
            {lineageLoading && <p>Loading lineage...</p>}
            {!lineageLoading && lineageError && (
              <p className="text-amber-700 dark:text-amber-300">{lineageError}</p>
            )}
            {!lineageLoading && lineage && (
              <div className="space-y-2">
                <p className="font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                  Source: {lineage.source}
                </p>
                <p>
                  Memory files:{' '}
                  {lineage.memoryFiles.length > 0 ? lineage.memoryFiles.join(', ') : 'none'}
                </p>
                <p>
                  Tools:{' '}
                  {lineage.tools.length > 0
                    ? lineage.tools.map((tool) => `${tool.toolName} (${tool.status})`).join(', ')
                    : 'none'}
                </p>
                <p>
                  External sources:{' '}
                  {lineage.externalSources.length > 0 ? lineage.externalSources.join(', ') : 'none'}
                </p>
                {lineage.notes.length > 0 && <p>Notes: {lineage.notes.join(' | ')}</p>}
              </div>
            )}
          </div>
        )}
      </article>

      <p className={clsx('pl-1 text-xs text-[var(--tone-soft)] dark:text-[var(--tone-soft)]')}>
        {formatClock(message.createdAt)}
      </p>
    </div>
  )
}
