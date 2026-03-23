'use client'

import { useState } from 'react'
import { Link, Paperclip, X } from 'lucide-react'

export interface PinnedItem {
  id: string
  type: 'url' | 'text'
  label: string
  content: string
}

interface PinnedContextProps {
  items: PinnedItem[]
  onRemove: (id: string) => void
  onAdd: (item: Omit<PinnedItem, 'id'>) => void
}

export function buildPinnedContextBlock(items: PinnedItem[]): string {
  if (items.length === 0) return ''
  const lines = items.map((item) => {
    const prefix = item.type === 'url' ? `URL: ${item.label}` : item.label
    return `[Pinned] ${prefix}\n${item.content}`
  })
  return `\n\n---\nPINNED CONTEXT (always included):\n${lines.join('\n\n')}\n---`
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname || url.slice(0, 40)
  } catch {
    return url.slice(0, 40)
  }
}

export function PinnedContext({ items, onRemove, onAdd }: PinnedContextProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [inputType, setInputType] = useState<'url' | 'text'>('url')

  function handleAdd() {
    const val = inputValue.trim()
    if (!val) return
    const isUrl = val.startsWith('http://') || val.startsWith('https://')
    onAdd({
      type: isUrl ? 'url' : inputType,
      label: isUrl ? safeHostname(val) : val.slice(0, 40),
      content: val,
    })
    closeAdd()
  }

  function closeAdd() {
    setInputValue('')
    setInputType('url')
    setShowAdd(false)
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
          <Paperclip size={10} />
          Pinned
        </span>

        {items.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]"
          >
            {item.type === 'url' ? <Link size={10} /> : <Paperclip size={10} />}
            {item.label}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="ml-0.5 text-[var(--muted)] transition hover:text-red-500"
              aria-label={`Remove ${item.label}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}

        {showAdd ? (
          <div className="flex items-center gap-1.5">
            <select
              value={inputType}
              onChange={(e) => setInputType(e.target.value as 'url' | 'text')}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--tone-default)] outline-none dark:text-[var(--tone-inverse)]"
            >
              <option value="url">URL</option>
              <option value="text">Text</option>
            </select>
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') closeAdd()
              }}
              placeholder={inputType === 'url' ? 'https://...' : 'Context text...'}
              className="w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--tone-default)] outline-none dark:text-[var(--tone-inverse)]"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold text-[var(--tone-default)] transition hover:bg-[var(--surface-muted)] dark:text-[var(--tone-inverse)]"
            >
              Pin
            </button>
            <button type="button" onClick={closeAdd} className="text-[var(--muted)] transition hover:text-[var(--tone-default)]">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--tone-default)] dark:hover:text-[var(--tone-inverse)]"
          >
            <Paperclip size={10} />
            Pin context
          </button>
        )}
      </div>
    </div>
  )
}
