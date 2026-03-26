'use client'

import { useRef, useState } from 'react'
import { Bookmark, Plus, Trash2, X } from 'lucide-react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { storageGet, storageSet } from '@/lib/storage'

export interface ResponsePreset {
  id: string
  name: string
  template: string
}

const STORAGE_KEY = 'oa:response-presets'

const DEFAULT_PRESETS: ResponsePreset[] = [
  { id: 'concise',      name: 'Be concise',     template: 'Please keep your response short and to the point. No filler.' },
  { id: 'step-by-step', name: 'Step by step',   template: 'Walk me through this step by step.' },
  { id: 'my-tone',      name: 'Match my tone',  template: 'Write this in a casual, direct tone — the way I write.' },
  { id: 'explain',      name: 'Explain simply', template: 'Explain this as if I have no background in the topic.' },
]

interface ResponsePresetsProps {
  onApply: (template: string) => void
}

export function ResponsePresets({ onApply }: ResponsePresetsProps) {
  // Initialize directly from storage to avoid a DEFAULT_PRESETS flash on mount
  const [presets, setPresets] = useState<ResponsePreset[]>(() =>
    storageGet(STORAGE_KEY, DEFAULT_PRESETS),
  )
  const [open, setOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTemplate, setNewTemplate] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  useClickOutside(panelRef, () => { setOpen(false); setEditMode(false) }, open)

  function persist(updated: ResponsePreset[]) {
    setPresets(updated)
    storageSet(STORAGE_KEY, updated)
  }

  function handleAdd() {
    if (!newName.trim() || !newTemplate.trim()) return
    persist([...presets, { id: `preset-${Date.now()}`, name: newName.trim(), template: newTemplate.trim() }])
    setNewName('')
    setNewTemplate('')
    setEditMode(false)
  }

  function handleRemove(id: string) {
    persist(presets.filter((p) => p.id !== id))
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="oa-soft-button inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition dark:text-[var(--tone-inverse)]"
        title="Response presets"
      >
        <Bookmark size={12} />
        Presets
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
              Response Presets
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditMode((e) => !e)}
                className="oa-soft-button rounded-md px-2 py-0.5 text-[10px] font-semibold transition dark:text-[var(--tone-inverse)]"
              >
                {editMode ? 'Done' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setEditMode(false) }}
                className="text-[var(--muted)] transition hover:text-[var(--tone-default)]"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-start gap-2 px-3 py-2 hover:bg-[var(--surface-muted)]">
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onApply(preset.template); setOpen(false) }}
                  className="flex-1 text-left"
                >
                  <p className="text-[13px] font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                    {preset.name}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted)]">
                    {preset.template}
                  </p>
                </button>
                {editMode && (
                  <button
                    type="button"
                    onClick={() => handleRemove(preset.id)}
                    className="mt-0.5 shrink-0 text-[var(--muted)] transition hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {editMode ? (
            <div className="space-y-2 border-t border-[var(--border)] p-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditMode(false) }}
                placeholder="Preset name"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-[12px] text-[var(--tone-strong)] outline-none dark:text-[var(--tone-inverse)]"
              />
              <textarea
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditMode(false) }}
                placeholder="Template text appended to your message..."
                rows={2}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-[12px] text-[var(--tone-strong)] outline-none dark:text-[var(--tone-inverse)]"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim() || !newTemplate.trim()}
                className="oa-accent-button inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition disabled:opacity-40"
              >
                <Plus size={12} />
                Add preset
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-2.5 text-[12px] font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--tone-default)] dark:hover:text-[var(--tone-inverse)]"
            >
              <Plus size={12} />
              Add preset
            </button>
          )}
        </div>
      )}
    </div>
  )
}
