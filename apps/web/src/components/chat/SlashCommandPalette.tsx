'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  BadgeInfo,
  BookOpen,
  Brain,
  Cpu,
  FileSearch,
  FileText,
  PlusCircle,
  Search,
  ShieldCheck,
  Tag,
  UserRound,
  Workflow,
  Zap,
} from 'lucide-react'

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
  NEW: 'new',
  RESET: 'reset',
  STATUS: 'status',
  MODEL: 'model',
  THINK: 'think',
  VERBOSE: 'verbose',
  REASONING: 'reasoning',
  LABEL: 'label',
  APPROVALS: 'approvals',
  HUMAN: 'human',
  HELP: 'help',
} as const

const AGENT_COMMANDS: SlashCommand[] = [
  { id: CMD.SEARCH,    label: '/search',    description: 'Search the web for information',                    icon: <Search size={14} />,   template: '/search '    },
  { id: CMD.SUMMARIZE, label: '/summarize', description: 'Summarize the conversation or a piece of text',     icon: <FileText size={14} />, template: '/summarize ' },
  { id: CMD.DRAFT,     label: '/draft',     description: 'Draft a document, email, or message',               icon: <FileSearch size={14} />, template: '/draft '   },
  { id: CMD.WORKFLOW,  label: '/workflow',  description: 'Create or run a workflow',                          icon: <Workflow size={14} />, template: '/workflow '  },
  { id: CMD.MEMORY,    label: '/memory',    description: 'Query or update agent memory',                      icon: <Brain size={14} />,    template: '/memory '    },
  { id: CMD.RESEARCH,  label: '/research',  description: 'Deep research on a topic',                          icon: <BookOpen size={14} />, template: '/research '  },
  { id: CMD.SCHEDULE,  label: '/schedule',  description: 'Schedule a task or reminder',                       icon: <Zap size={14} />,      template: '/schedule '  },
]

export const OPERATOR_COMMANDS: SlashCommand[] = [
  { id: CMD.NEW,        label: '/new',        description: 'Start a fresh session',                                 icon: <PlusCircle size={14} />, template: '/new' },
  { id: CMD.STATUS,     label: '/status',     description: 'Show runtime, session, and approval status',           icon: <Activity size={14} />,   template: '/status' },
  { id: CMD.MODEL,      label: '/model',      description: 'Set provider/model, for example /model openai gpt-5.1', icon: <Cpu size={14} />,        template: '/model ' },
  { id: CMD.THINK,      label: '/think',      description: 'Set session thinking level',                           icon: <Brain size={14} />,      template: '/think ' },
  { id: CMD.VERBOSE,    label: '/verbose',    description: 'Set session verbosity',                                icon: <FileText size={14} />,   template: '/verbose ' },
  { id: CMD.REASONING,  label: '/reasoning',  description: 'Set reasoning visibility for the current session',     icon: <Workflow size={14} />,   template: '/reasoning ' },
  { id: CMD.LABEL,      label: '/label',      description: 'Rename the current session label',                     icon: <Tag size={14} />,        template: '/label ' },
  { id: CMD.APPROVALS,  label: '/approvals',  description: 'Summarize pending approvals',                          icon: <ShieldCheck size={14} />, template: '/approvals' },
  { id: CMD.HUMAN,      label: '/human',      description: 'Escalate the current session to a human',             icon: <UserRound size={14} />,  template: '/human ' },
  { id: CMD.HELP,       label: '/help',       description: 'Show operator command help',                           icon: <BadgeInfo size={14} />,  template: '/help' },
]

const BUILT_IN_COMMANDS: SlashCommand[] = [...AGENT_COMMANDS, ...OPERATOR_COMMANDS]

const OPERATOR_COMMAND_ALIASES: Record<string, string> = {
  [CMD.RESET]: CMD.NEW,
  reason: CMD.REASONING,
}

const OPERATOR_COMMAND_IDS = new Set(OPERATOR_COMMANDS.map((command) => command.id))

export interface ParsedSlashCommand {
  id: string
  arg: string
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  const spaceIdx = trimmed.indexOf(' ')
  const rawId = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase()
  const id = OPERATOR_COMMAND_ALIASES[rawId] ?? rawId
  const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()
  return { id, arg }
}

export function isOperatorCommandId(id: string) {
  return OPERATOR_COMMAND_IDS.has(id)
}

export function buildOperatorCommandHelpText() {
  return [
    'Operator commands',
    '/new: start a fresh session',
    '/status: show runtime, session, approvals, and handoff state',
    '/model [provider] <model>: update the default provider/model',
    '/think <inherit|off|minimal|low|medium|high|xhigh|on>: set per-session thinking',
    '/verbose <inherit|off|on|full>: set per-session verbosity',
    '/reasoning <inherit|off|on|stream>: set per-session reasoning visibility',
    '/label <name|clear>: update the current session label',
    '/approvals: summarize pending approvals for this session',
    '/human [reason]: escalate the active session to a human operator',
    '/help: show this command list',
  ].join('\n')
}

// Expand a slash command input into the full prompt text sent to the agent.
// Consolidates the with-arg / without-arg cases per command.
export function expandSlashCommand(text: string): string {
  const parsed = parseSlashCommand(text)
  if (!parsed) return text
  const cmd = parsed.id
  const arg = parsed.arg

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
