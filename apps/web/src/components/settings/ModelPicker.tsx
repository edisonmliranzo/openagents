'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, PenLine, Search } from 'lucide-react'
import clsx from 'clsx'

interface ModelPickerProps {
  models: string[]
  value: string
  onChange: (model: string) => void
  placeholder?: string
}

/**
 * Visible, searchable model dropdown. Shows every available model in a
 * scrollable list (unlike <datalist>, which hides options behind an
 * obscure arrow), plus a custom-id entry for models not in the catalog.
 */
export function ModelPicker({ models, value, onChange, placeholder }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [customId, setCustomId] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.toLowerCase().includes(q))
  }, [models, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open ])

  useEffect(() => {
    if (open && !customMode) {
      setQuery('')
      window.setTimeout(() => searchRef.current?.focus(), 0)
    }
    if (!open) setCustomMode(false)
  }, [open, customMode])

  const display = value.trim() || placeholder || 'Select a model'

  function applyCustom() {
    const id = customId.trim()
    if (!id) return
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={value || placeholder}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
      >
        <span className={clsx('min-w-0 flex-1 truncate text-left', !value.trim() && 'text-slate-400')}>
          {display}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            {models.length}
          </span>
          <ChevronDown size={14} className={clsx('text-slate-400 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
          {customMode ? (
            <div className="p-3">
              <p className="text-xs font-medium text-slate-500">Custom model id</p>
              <div className="mt-2 flex gap-2">
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCustom()
                  }}
                  placeholder="e.g. vendor/model-name"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                />
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!customId.trim()}
                  className="h-10 shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Use
                </button>
              </div>
              <button
                type="button"
                onClick={() => setCustomMode(false)}
                className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                ← Back to list
              </button>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 p-2">
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <Search size={13} className="shrink-0 text-slate-400" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${models.length} models...`}
                    className="w-full bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-center text-[13px] text-slate-400">
                    No models match &ldquo;{query.trim()}&rdquo;.
                  </p>
                )}
                {filtered.map((m) => {
                  const selected = m === value.trim()
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        onChange(m)
                        setOpen(false)
                      }}
                      title={m}
                      className={clsx(
                        'flex min-h-[36px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition',
                        selected
                          ? 'bg-emerald-50 font-medium text-emerald-700'
                          : 'text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{m}</span>
                      {selected && <Check size={14} className="shrink-0" />}
                    </button>
                  )
                })}
              </div>
              <div className="border-t border-slate-100 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCustomId(value)
                    setCustomMode(true)
                  }}
                  className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <PenLine size={13} />
                  Type a custom model id…
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
