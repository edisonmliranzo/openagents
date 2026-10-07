'use client'

import { Sparkles } from 'lucide-react'

export function SuggestionChips({
  suggestions,
  onPick,
}: {
  suggestions: string[]
  onPick: (text: string) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-wrap items-center gap-1.5 px-1 pb-2">
      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        <Sparkles size={10} /> Next
      </span>
      {suggestions.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onPick(text)}
          className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[12px] text-slate-600 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white hover:text-slate-800 active:scale-[0.98] dark:border-[#2d3347] dark:bg-[#1a2032]/80 dark:text-slate-300 dark:hover:text-white"
        >
          {text}
        </button>
      ))}
    </div>
  )
}
