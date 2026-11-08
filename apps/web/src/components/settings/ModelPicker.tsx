'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, PenLine, Search, X } from 'lucide-react'
import clsx from 'clsx'

interface ModelPickerProps {
  models: string[]
  value: string
  onChange: (model: string) => void
  placeholder?: string
}

/**
 * Visible, searchable model dropdown rendered via React portal so it is never
 * clipped by parent overflow-hidden or backdrop-filter stacking contexts on mobile.
 */
export function ModelPicker({ models, value, onChange, placeholder }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [customId, setCustomId] = useState('')
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.toLowerCase().includes(q))
  }, [models, query])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const mobile = window.innerWidth < 640
      setIsMobile(mobile)
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setAnchorRect({
          top: rect.bottom + 8,
          left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 320) - 12)),
          width: Math.max(rect.width, 320),
        })
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open && !customMode) {
      setQuery('')
      // Only autofocus search on desktop so mobile virtual keyboard doesn't jump over the list
      if (typeof window !== 'undefined' && window.innerWidth >= 640) {
        window.setTimeout(() => searchRef.current?.focus(), 0)
      }
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
    <div className="relative w-full">
      <button
        ref={buttonRef}
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

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-[2px] sm:block sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false)
            }}
          >
            <div
              style={
                !isMobile && anchorRect
                  ? {
                      position: 'fixed',
                      top: `${Math.min(anchorRect.top, window.innerHeight - 440)}px`,
                      left: `${anchorRect.left}px`,
                      width: `${anchorRect.width}px`,
                    }
                  : undefined
              }
              className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.25)] sm:max-h-[420px] sm:rounded-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 sm:hidden">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Select AI Model ({models.length})
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                  aria-label="Close model picker"
                >
                  <X size={14} />
                </button>
              </div>

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
                      <Search size={14} className="shrink-0 text-slate-400" />
                      <input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Search ${models.length} models...`}
                        className="w-full bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
                      />
                      {query && (
                        <button
                          type="button"
                          onClick={() => setQuery('')}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
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
                            'flex min-h-[42px] sm:min-h-[36px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition active:scale-[0.99]',
                            selected
                              ? 'bg-emerald-50 font-semibold text-emerald-700'
                              : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{m}</span>
                          {selected && <Check size={15} className="shrink-0 text-emerald-600" />}
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
                      className="flex min-h-[40px] sm:min-h-[36px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <PenLine size={13} />
                      Type a custom model id…
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
