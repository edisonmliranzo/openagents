'use client'

import { useState } from 'react'
import { Download, MessageSquare, Brain, Workflow } from 'lucide-react'

interface ExportOption {
  id: string
  label: string
  description: string
  icon: React.ElementType
  formats: Array<{ label: string; url: string; ext: string }>
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'conversations',
    label: 'Conversations',
    description: 'All your chat sessions and message history',
    icon: MessageSquare,
    formats: [
      { label: 'JSON', url: '/api/export/conversations?format=json', ext: 'json' },
      { label: 'Markdown', url: '/api/export/conversations?format=markdown', ext: 'md' },
    ],
  },
  {
    id: 'memory',
    label: 'Memory Entries',
    description: 'All stored facts and personal context',
    icon: Brain,
    formats: [
      { label: 'JSON', url: '/api/export/memory', ext: 'json' },
    ],
  },
  {
    id: 'workflows',
    label: 'Workflows',
    description: 'All automated workflows and pipelines',
    icon: Workflow,
    formats: [
      { label: 'YAML', url: '/api/export/workflows', ext: 'yaml' },
    ],
  },
]

export default function ExportPage() {
  const [downloading, setDownloading] = useState<string | null>(null)

  async function handleDownload(url: string, filename: string) {
    const key = `${url}`
    setDownloading(key)
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      alert('Export failed. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Download size={22} className="text-indigo-400" />
          Export Everything
        </h1>
        <p className="text-sm text-white/50 mt-0.5">Download all your data in portable formats</p>
      </div>

      <div className="space-y-4">
        {EXPORT_OPTIONS.map((opt) => {
          const Icon = opt.icon
          return (
            <div
              key={opt.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex items-start gap-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-900/60 text-indigo-300">
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{opt.label}</p>
                <p className="text-sm text-white/50 mt-0.5">{opt.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {opt.formats.map((fmt) => {
                  const key = fmt.url
                  const ts = Date.now()
                  const filename = `openagents_${opt.id}_${ts}.${fmt.ext}`
                  return (
                    <button
                      key={fmt.label}
                      onClick={() => handleDownload(fmt.url, filename)}
                      disabled={downloading === key}
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-3 py-2 text-sm font-medium text-white transition-colors"
                    >
                      <Download size={13} />
                      {downloading === key ? 'Downloading…' : fmt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-white/30">
        Exports are generated server-side and downloaded directly to your device. No data is shared externally.
      </p>
    </div>
  )
}
