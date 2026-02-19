'use client'

import clsx from 'clsx'
import type { Message } from '@openagents/shared'

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function renderMessageContent(text: string) {
  const lines = text.split('\n')
  return lines.map((line, idx) => {
    const trimmed = line.trim()
    if (!trimmed) return <div key={`line-empty-${idx}`} className="h-2" />

    const looksLikeCode =
      trimmed.startsWith('curl ') ||
      trimmed.startsWith('export ') ||
      trimmed.startsWith('solana-') ||
      trimmed.includes('=') ||
      trimmed.includes('--')

    if (looksLikeCode) {
      return (
        <pre
          key={`line-code-${idx}`}
          className="my-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
        >
          {trimmed}
        </pre>
      )
    }

    return (
      <p key={`line-p-${idx}`} className="text-[14px] leading-relaxed text-slate-800">
        {line}
      </p>
    )
  })
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] rounded-2xl rounded-br-md bg-red-400 px-4 py-2.5 text-sm text-white shadow-sm">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="space-y-1">
          {message.content
            ? renderMessageContent(message.content)
            : (
              <div className="flex items-center gap-1 py-1 text-slate-400">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
              </div>
            )}
        </div>
      </article>

      <div className="flex items-center gap-2 pl-1">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-bold text-white">
          AI
        </div>
        <p className={clsx('text-xs text-slate-400')}>
          openagents {formatClock(message.createdAt)}
        </p>
      </div>
    </div>
  )
}
