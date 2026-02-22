'use client'

import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import { sdk } from '@/stores/auth'
import type { DataLineageRecord, Message } from '@openagents/shared'
import { Copy } from 'lucide-react'

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
  const blocks = useMemo(() => parseMessageBlocks(message.content ?? ''), [message.content])
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

  const handleCopyBlock = useCallback(async (index: number, content: string) => {
    try {
      await copyToClipboard(content)
      setCopiedCodeIndex(index)
      window.setTimeout(() => setCopiedCodeIndex((current) => (current === index ? null : current)), 1200)
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
        <div className="max-w-[78%] rounded-2xl rounded-br-md bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-3 text-sm text-white shadow-card">
          <p className="whitespace-pre-wrap">{message.content}</p>
          <p className="mt-2 text-right text-[11px] font-medium text-indigo-100">{formatClock(message.createdAt)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-card dark:border-slate-700 dark:bg-slate-900/90">
        <div className="mb-2 flex items-center justify-between">
          <div className="inline-flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-[10px] font-bold text-white">
              OA
            </div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">OpenAgent</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleToggleLineage()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Why this answer
            </button>
            {codeBlocks.length > 0 && (
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Copy size={12} />
                {copiedAll ? 'Copied' : codeBlocks.length > 1 ? 'Copy all code' : 'Copy code'}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          {message.content ? (
            blocks.map((block, idx) => {
              if (block.type === 'text') {
                if (!block.content.trim()) return <div key={`line-empty-${idx}`} className="h-2" />
                return (
                  <p key={`line-p-${idx}`} className="text-[14px] leading-relaxed text-slate-800 dark:text-slate-200">
                    {block.content}
                  </p>
                )
              }

              const lang = block.language?.trim() ?? ''
              return (
                <div key={`line-code-${idx}`} className="my-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {lang || 'code'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyBlock(idx, block.content)}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                    >
                      {copiedCodeIndex === idx ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="overflow-x-auto bg-slate-950 px-3 py-2 text-xs text-slate-100">
                    {block.content}
                  </pre>
                </div>
              )
            })
          ) : (
            <div className="flex items-center gap-1 py-1 text-slate-400">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
            </div>
          )}
        </div>

        {lineageOpen && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {lineageLoading && <p>Loading lineage...</p>}
            {!lineageLoading && lineageError && <p className="text-amber-700 dark:text-amber-300">{lineageError}</p>}
            {!lineageLoading && lineage && (
              <div className="space-y-2">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Source: {lineage.source}</p>
                <p>Memory files: {lineage.memoryFiles.length > 0 ? lineage.memoryFiles.join(', ') : 'none'}</p>
                <p>Tools: {lineage.tools.length > 0 ? lineage.tools.map((tool) => `${tool.toolName} (${tool.status})`).join(', ') : 'none'}</p>
                <p>External sources: {lineage.externalSources.length > 0 ? lineage.externalSources.join(', ') : 'none'}</p>
                {lineage.notes.length > 0 && <p>Notes: {lineage.notes.join(' | ')}</p>}
              </div>
            )}
          </div>
        )}
      </article>

      <p className={clsx('pl-1 text-xs text-slate-400 dark:text-slate-500')}>
        {formatClock(message.createdAt)}
      </p>
    </div>
  )
}
