'use client'

import { useCallback, useEffect, useState } from 'react'
import { LayoutTemplate, Loader2, X } from 'lucide-react'
import { sdk } from '@/stores/auth'
import type { ConversationTemplate } from '@openagents/sdk'

interface Props {
  onPick: (template: ConversationTemplate, starter: string) => void
}

/**
 * One-click launcher for the built-in conversation kits (research, code,
 * content, business, learning, project management) plus any custom templates
 * the user has saved.
 */
export function TemplateLauncher({ onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<ConversationTemplate[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await sdk.templates.list()
      setTemplates(list ?? [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  const grouped = templates.reduce<Record<string, ConversationTemplate[]>>((acc, template) => {
    const key = template.category || 'other'
    acc[key] = acc[key] ?? []
    acc[key].push(template)
    return acc
  }, {})

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Start from a template"
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-white dark:border-[#2d3347] dark:bg-[#141824]/70 dark:text-slate-400 dark:hover:bg-[#1a1f2e]"
      >
        <LayoutTemplate size={12} />
        Templates
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute bottom-full left-0 z-40 mb-2 w-[320px] max-w-[85vw] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xl dark:border-[#2d3347] dark:bg-[#141927]">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2 dark:border-[#2d3347]">
              <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">Start from a kit</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close templates"
                className="text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X size={13} />
              </button>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-2">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-slate-400">
                  <Loader2 size={13} className="animate-spin" /> Loading templates…
                </div>
              )}

              {!loading && templates.length === 0 && (
                <p className="px-2 py-6 text-center text-[12px] text-slate-400">No templates available.</p>
              )}

              {!loading &&
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category} className="mb-2 last:mb-0">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {category}
                    </p>
                    {items.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          const starter = template.starterMessages?.[0] ?? ''
                          void sdk.templates.use(template.id).catch(() => undefined)
                          onPick(template, starter)
                          setOpen(false)
                        }}
                        className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-[#1e2433]"
                      >
                        <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">{template.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                          {template.description}
                        </p>
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
