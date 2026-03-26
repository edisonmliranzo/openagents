'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, Brain, FileSearch, FileText, Search, Workflow, Zap } from 'lucide-react'

export interface SlashCommand {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  template: string
}

// Command ids as constants to avoid string scatter
const CMD = {
  SEARCH: 'search',
  SUMMARIZE: 'summarize',
  DRAFT: 'draft',
  WORKFLOW: 'workflow',
  MEMORY: 'memory',
  RESEARCH: 'research',
  SCHEDULE: 'schedule',
} as const

const BUILT_IN_COMMANDS: SlashCommand[] = [
  { id: CMD.SEARCH,    label: '/search',    description: 'Search the web for information',                    icon: <Search size={14} />,   template: '/search '    },
  { id: CMD.SUMMARIZE, label: '/summarize', description: 'Summarize the conversation or a piece of text',     icon: <FileText size={14} />, template: '/summarize ' },
  { id: CMD.DRAFT,     label: '/draft',     description: 'Draft a document, email, or message',               icon: <FileSearch size={14} />, template: '/draft '   },
  { id: CMD.WORKFLOW,  label: '/workflow',  description: 'Create or run a workflow',                          icon: <Workflow size={14} />, template: '/workflow '  },
  { id: CMD.MEMORY,    label: '/memory',    description: 'Query or update agent memory',                      icon: <Brain size={14} />,    template: '/memory '    },
  { id: CMD.RESEARCH,  label: '/research',  description: 'Deep research on a topic',                          icon: <BookOpen size={14} />, template: '/research '  },
  { id: CMD.SCHEDULE,  label: '/schedule',  description: 'Schedule a task or reminder',                       icon: <Zap size={14} />,      template: '/schedule '  },
]

// Expand a slash command input into the full prompt text sent to the agent.
// Consolidates the with-arg / without-arg cases per command.
export function expandSlashCommand(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return text

  const spaceIdx = trimmed.indexOf(' ')
  const cmd = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)
  const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

  switch (cmd) {
    case CMD.SEARCH:    return arg ? `Search the web for: ${arg}` : 'Search the web for: '
    case CMD.SUMMARIZE: return arg ? `Summarize this: ${arg}` : 'Summarize our conversation so far.'
    case CMD.DRAFT:     return arg ? `Draft ${arg}` : 'Draft '
    case CMD.WORKFLOW:  return arg ? `Create a workflow for: ${arg}` : 'List my workflows and help me create or run one.'
    case CMD.MEMORY:    return arg ? `Search my memory for: ${arg}` : 'Show me what you remember about me.'
    case CMD.RESEARCH:  return arg ? `Do deep research on: ${arg}` : 'Do deep research on: '
    case CMD.SCHEDULE:  return arg ? `Schedule this task: ${arg}` : 'Help me schedule a task or reminder.'
    default:            return text
  }
}

interface SlashCommandPaletteProps {
  query: string
  onSelect: (command: SlashCommand) => void
  onClose: () => void
  extraCommands?: SlashCommand[]
}

export function SlashCommandPalette({
  query,
  onSelect,
  onClose,
  extraCommands = [],
}: SlashCommandPaletteProps) {
  const allCommands = [...BUILT_IN_COMMANDS, ...extraCommands]
  const filtered = query
    ? allCommands.filter((cmd) => cmd.id.startsWith(query.replace('/', '').toLowerCase()))
    : allCommands

  const [activeIndex, setActiveIndex] = useState(0)

  // Reset selection when filtered list changes
  useEffect(() => { setActiveIndex(0) }, [query])

  // Keyboard nav — only attached when palette is visible (component is mounted)
  // Uses capture so it runs before the textarea's onKeyDown and can stop propagation.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const cmd = filtered[activeIndex]
        if (cmd) onSelect(cmd)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    // Capture phase so we intercept before textarea's onKeyDown
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [filtered, activeIndex, onSelect, onClose])

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
          Commands
        </p>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {filtered.map((cmd, idx) => (
          <button
            key={cmd.id}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
            className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition ${
              idx === activeIndex ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]'
            }`}
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
              {cmd.icon}
            </span>
            <div>
              <p className="text-[13px] font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                {cmd.label}
              </p>
              <p className="text-[11px] text-[var(--muted)]">{cmd.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
