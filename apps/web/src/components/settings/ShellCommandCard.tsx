'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Terminal } from 'lucide-react'

interface ShellCommandCardProps {
  title: string
  command: string
  note: string
}

export default function ShellCommandCard({ title, command, note }: ShellCommandCardProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [copied])

  async function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(command)
    setCopied(true)
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Terminal size={14} className="text-slate-500" />
            {title}
          </div>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100">
        <code>{command}</code>
      </pre>
    </article>
  )
}
