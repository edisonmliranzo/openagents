'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat'
import {
  ASSISTANT_MODE_DEFINITIONS,
  buildAssistantModePrompt,
  getAssistantModeDefinition,
  type AssistantMode,
} from './assistantModes'
import { MessageBubble } from './MessageBubble'
import { SlashCommandPalette, expandSlashCommand } from './SlashCommandPalette'
import { PinnedContext, buildPinnedContextBlock, type PinnedItem } from './PinnedContext'
import { ResponsePresets } from './ResponsePresets'
import {
  AlertTriangle,
  ArrowUp,
  BrainCircuit,
  Command,
  PlusCircle,
  Workflow,
} from 'lucide-react'

interface ChatWindowProps {
  assistantMode: AssistantMode
  onAssistantModeChange: (mode: AssistantMode) => void
  gatewayConnected: boolean
  onNewSession: () => Promise<void> | void
}

interface QuickAction {
  label: string
  seed: string
  mode: AssistantMode
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Draft',
    mode: 'plan',
    seed: 'Draft the best first version of this and wait for approval before any external action.',
  },
  {
    label: 'Execute',
    mode: 'execute',
    seed: 'Complete this request and use available tools whenever they materially help.',
  },
  {
    label: 'Automate',
    mode: 'autopilot',
    seed: 'Turn this into a reusable workflow or watcher with a clear operating loop.',
  },
]

function formatIntentLabel(intent: string | undefined) {
  if (!intent) return null
  const normalized = intent
    .replace(/^custom-intent-/, '')
    .replace(/-/g, ' ')
    .trim()
  if (!normalized) return null
  return normalized
}

function statusChipClass(status: string | null, isStreaming: boolean) {
  const effective = status ?? (isStreaming ? 'running' : 'ready')
  if (effective === 'error') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
  if (effective.includes('approval')) return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
  if (effective === 'done' || effective === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
  return 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--tone-default)] dark:text-[var(--tone-inverse)]'
}

function modeButtonClass(active: boolean) {
  if (active) {
    return 'border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[var(--tone-strong)] shadow-sm dark:text-[var(--tone-inverse)]'
  }
  return 'border-[var(--border)] bg-[var(--surface)] text-[var(--tone-muted)] hover:bg-[var(--surface-muted)] dark:text-[var(--tone-inverse)]'
}

export function ChatWindow({
  assistantMode,
  onAssistantModeChange,
  gatewayConnected,
  onNewSession,
}: ChatWindowProps) {
  const {
    messages,
    sendMessage,
    isStreaming,
    activeConversationId,
    learnedSkill,
    runStatus,
    pendingApprovals,
    activeHandoff,
    escalateToHuman,
  } = useChatStore()
  const [input, setInput] = useState('')
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([])
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const learnedIntentLabel = formatIntentLabel(learnedSkill?.intent)
  const assistantModeDefinition = useMemo(
    () => getAssistantModeDefinition(assistantMode),
    [assistantMode],
  )
  const activeHandoffStatus =
    activeHandoff && (activeHandoff.status === 'open' || activeHandoff.status === 'claimed')
      ? activeHandoff.status
      : null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  function focusComposer() {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  async function dispatchMessage(rawText: string) {
    const displayContent = rawText.trim()
    if (!displayContent || isStreaming || !gatewayConnected) return
    setSlashQuery(null)
    setInput('')
    const expanded = expandSlashCommand(displayContent)
    const pinned = buildPinnedContextBlock(pinnedItems)
    const content = buildAssistantModePrompt(assistantMode, expanded + pinned)
    await sendMessage(content, { displayContent })
  }

  async function handleSend() {
    await dispatchMessage(input)
  }

  async function handleQuickPrompt(prompt: string) {
    await dispatchMessage(prompt)
  }

  async function handleEscalate() {
    if (!activeConversationId || isStreaming || activeHandoffStatus) return
    await escalateToHuman(`Operator requested from ${assistantModeDefinition.label.toLowerCase()} mode.`)
  }

  function handleQuickAction(action: QuickAction) {
    if (action.mode !== assistantMode) {
      onAssistantModeChange(action.mode)
    }
    setInput((current) =>
      current.trim() ? `${current.trim()}\n\n${action.seed}` : action.seed,
    )
    focusComposer()
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)
    const slashMatch = val.match(/^(\/[a-z]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1])
    } else {
      setSlashQuery(null)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape')) {
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handlePresetApply(template: string) {
    setInput((current) => current.trim() ? `${current.trim()}\n\n${template}` : template)
    focusComposer()
  }

  function handleAddPin(item: Omit<PinnedItem, 'id'>) {
    setPinnedItems((prev) => [...prev, { ...item, id: `pin-${Date.now()}` }])
  }

  function handleRemovePin(id: string) {
    setPinnedItems((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
      {learnedSkill && (
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
            <BrainCircuit size={12} />
            <span>Learned skill</span>
            <code className="font-mono text-[10px]">{learnedSkill.skillId}</code>
            {learnedIntentLabel && (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] capitalize">
                {learnedIntentLabel}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
              Session controls
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
              Compact routing, approvals, and execution posture for the active session.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusChipClass(runStatus, isStreaming)}`}>
              {runStatus ?? (isStreaming ? 'running' : 'ready')}
            </span>
            {pendingApprovals.length > 0 && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                {pendingApprovals.length} approvals waiting
              </span>
            )}
            {activeHandoffStatus && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                human handoff {activeHandoffStatus}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {ASSISTANT_MODE_DEFINITIONS.map((definition) => (
            <button
              key={definition.id}
              type="button"
              onClick={() => onAssistantModeChange(definition.id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${modeButtonClass(
                assistantMode === definition.id,
              )}`}
            >
              {definition.label}
              <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tone-soft)]">
                {definition.caption}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-muted)] px-3 py-3 sm:px-5">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-8">
            <div className="w-full max-w-[760px] rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="flex items-center gap-2 text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                <div className="oa-brand-badge flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white">
                  OA
                </div>
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                    Operator chat
                  </p>
                  <p className="text-lg font-semibold">Start with a session command or a clear outcome.</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-[var(--muted)] dark:text-[var(--muted)]">
                Keep the request concrete. This surface is tuned for session work, approvals, tool use, and repeated operational tasks.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {assistantModeDefinition.starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={!gatewayConnected || isStreaming}
                    onClick={() => void handleQuickPrompt(prompt)}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-left text-[12px] font-medium text-[var(--tone-default)] transition hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[var(--tone-inverse)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1">
                  <Command size={11} />
                  Type `/` for commands
                </span>
                <span>{gatewayConnected ? 'Runtime connected' : 'Runtime disconnected'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[980px] space-y-3 pb-3 pt-1">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <PinnedContext
        items={pinnedItems}
        onRemove={handleRemovePin}
        onAdd={handleAddPin}
      />

      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => handleQuickAction(action)}
              className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-semibold text-[var(--tone-default)] transition hover:bg-[var(--surface-subtle)] dark:text-[var(--tone-inverse)]"
            >
              {action.label}
            </button>
          ))}
          <ResponsePresets onApply={handlePresetApply} />
          <button
            type="button"
            onClick={() => void handleEscalate()}
            disabled={!activeConversationId || Boolean(activeHandoffStatus) || isStreaming}
            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Need human
            </span>
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
          <p>
            {assistantModeDefinition.label} mode. Press <kbd className="rounded border border-[var(--border)] px-1 font-mono">Enter</kbd> to send.
          </p>
          <p>
            {isStreaming
              ? 'Assistant is working...'
              : activeHandoffStatus
                ? `Waiting on a human operator (${activeHandoffStatus}).`
                : 'Assistant ready'}
          </p>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <div className="relative flex w-full items-end gap-2 rounded-[20px] border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 sm:flex-1">
            {slashQuery !== null && (
              <SlashCommandPalette
                query={slashQuery}
                onSelect={(cmd) => {
                  setInput(cmd.template)
                  setSlashQuery(null)
                  focusComposer()
                }}
                onClose={() => setSlashQuery(null)}
              />
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              disabled={!gatewayConnected || isStreaming || Boolean(activeHandoffStatus)}
              rows={1}
              placeholder={
                gatewayConnected
                  ? activeHandoffStatus
                    ? 'This session is in human handoff mode.'
                    : `${assistantModeDefinition.placeholder} (type / for commands)`
                  : 'Reconnect the assistant runtime to start...'
              }
              className="max-h-44 min-h-[42px] w-full resize-none bg-transparent px-2 py-2 text-sm text-[var(--tone-strong)] outline-none placeholder:text-[var(--tone-soft)] disabled:cursor-not-allowed disabled:text-[var(--tone-soft)] dark:text-[var(--tone-inverse)]"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || !gatewayConnected || isStreaming || Boolean(activeHandoffStatus)}
              className="oa-accent-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Send message"
            >
              <ArrowUp size={16} />
            </button>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
            <button
              type="button"
              onClick={() => void onNewSession()}
              className="oa-soft-button inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition dark:text-[var(--tone-inverse)]"
            >
              <PlusCircle size={14} />
              New session
            </button>
            <button
              type="button"
              onClick={() => {
                onAssistantModeChange('autopilot')
                setInput('Build a reusable workflow or watcher for this task and tell me how it should run.')
                focusComposer()
              }}
              className="oa-soft-button inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition dark:text-[var(--tone-inverse)]"
            >
              <Workflow size={14} />
              Build workflow
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
