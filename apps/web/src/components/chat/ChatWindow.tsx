'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat'
import {
  ASSISTANT_MODE_DEFINITIONS,
  buildAssistantModePrompt,
  getAssistantModeDefinition,
  type AssistantMode,
} from './assistantModes'
import { AgentAvatarPanel } from './AgentAvatarPanel'
import { MessageBubble } from './MessageBubble'
import { SlashCommandPalette, expandSlashCommand } from './SlashCommandPalette'
import { PinnedContext, buildPinnedContextBlock, type PinnedItem } from './PinnedContext'
import { ResponsePresets } from './ResponsePresets'
import {
  AlertTriangle,
  ArrowUp,
  BrainCircuit,
  PlusCircle,
  Rocket,
  Sparkles,
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
    label: 'Draft first',
    mode: 'plan',
    seed: 'Draft the best first version of this and wait for approval before any external action.',
  },
  {
    label: 'Run it',
    mode: 'execute',
    seed: 'Complete this request and use available tools whenever they materially help.',
  },
  {
    label: 'Schedule it',
    mode: 'autopilot',
    seed: 'Turn this into a reusable scheduled workflow with a clear trigger and operating summary.',
  },
  {
    label: 'Watch it',
    mode: 'autopilot',
    seed: 'Monitor this and tell me when it changes or needs intervention.',
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

function modeCardClass(active: boolean) {
  if (active) return 'border-indigo-300 bg-indigo-50 shadow-sm'
  return 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]'
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
  const [showAvatarPanel, setShowAvatarPanel] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([])
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const contentLayoutRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const el = contentLayoutRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const syncLayout = (width: number) => {
      setShowAvatarPanel(width >= 980)
    }

    syncLayout(el.clientWidth)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      syncLayout(entry?.contentRect.width ?? el.clientWidth)
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
    const withPinned = expanded + pinned
    const content = buildAssistantModePrompt(assistantMode, withPinned)
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
    // Detect slash command: starts with / and no space yet (still typing command name)
    const slashMatch = val.match(/^(\/[a-z]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1])
    } else {
      setSlashQuery(null)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    // When palette is open, arrow/enter/escape are handled by the palette itself
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

  const messageViewport = (
    <div
      className={
        showAvatarPanel
          ? 'min-h-0 h-full overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)]'
          : 'relative min-h-0 h-full'
      }
    >
      <div className="h-full overflow-y-auto bg-gradient-to-b from-[var(--surface)] via-[var(--surface)] to-[var(--surface-muted)] px-3 py-3 sm:px-5">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-6">
            <div className="w-full max-w-[820px] space-y-6 text-center">
              <div className="oa-brand-badge mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white">
                <Sparkles size={17} />
              </div>

              <div>
                <p className="text-[30px] font-semibold tracking-tight text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                  Tell the assistant the outcome you want.
                </p>
                <p className="mx-auto mt-2 max-w-[620px] text-sm text-[var(--muted)] dark:text-[var(--muted)]">
                  In `Execute` and `Autopilot`, it will do real work. In `Plan`, it will think first
                  and hold execution until the path is clear.
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {ASSISTANT_MODE_DEFINITIONS.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() => onAssistantModeChange(definition.id)}
                    className={`rounded-2xl border p-4 text-left transition ${modeCardClass(
                      assistantMode === definition.id,
                    )}`}
                  >
                    <p className="text-sm font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                      {definition.label}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                      {definition.caption}
                    </p>
                    <p className="mt-2 text-xs text-[var(--muted)] dark:text-[var(--muted)]">
                      {definition.description}
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-2.5">
                {assistantModeDefinition.starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={!gatewayConnected || isStreaming}
                    onClick={() => void handleQuickPrompt(prompt)}
                    className="oa-soft-button max-w-full rounded-full px-4 py-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-50 dark:text-[var(--tone-inverse)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <p className="text-xs text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                {gatewayConnected
                  ? activeConversationId
                    ? `${assistantModeDefinition.label} mode is active. Pick a starter or type your own request below.`
                    : 'Create a task to begin.'
                  : 'Reconnect the assistant runtime to begin.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[920px] space-y-4 pb-3 pt-2">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
      {learnedSkill && (
        <div className="relative border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 sm:px-5">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
            <BrainCircuit size={12} />
            <span>Auto-learned skill active</span>
            <code className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
              {learnedSkill.skillId}
            </code>
            {learnedIntentLabel && (
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium capitalize text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                {learnedIntentLabel}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] dark:text-[var(--muted)]">
              Assistant posture
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
              {assistantModeDefinition.description}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
              {assistantModeDefinition.label} mode
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
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

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {ASSISTANT_MODE_DEFINITIONS.map((definition) => (
            <button
              key={definition.id}
              type="button"
              onClick={() => onAssistantModeChange(definition.id)}
              className={`rounded-2xl border px-3 py-3 text-left transition ${modeCardClass(
                assistantMode === definition.id,
              )}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                  {definition.label}
                </p>
                {assistantMode === definition.id && <Rocket size={14} className="text-indigo-500" />}
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                {definition.caption}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)] dark:text-[var(--muted)]">
                {definition.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div
        ref={contentLayoutRef}
        className={
          showAvatarPanel
            ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-3 p-3 sm:p-4'
            : 'min-h-0 flex flex-1 flex-col'
        }
      >
        {messageViewport}

        {showAvatarPanel && (
          <AgentAvatarPanel
            gatewayConnected={gatewayConnected}
            isStreaming={isStreaming}
            messages={messages}
            runStatus={runStatus}
          />
        )}
      </div>

      <PinnedContext
        items={pinnedItems}
        onRemove={handleRemovePin}
        onAdd={handleAddPin}
      />

      <div className="relative border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
        <div className="mb-3 flex flex-wrap gap-2 px-1">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => handleQuickAction(action)}
              className="oa-soft-button rounded-full px-3 py-1.5 text-[11px] font-semibold transition dark:text-[var(--tone-inverse)]"
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

        <div className="mb-2 flex flex-wrap items-center justify-between gap-1 px-1 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
          <p>
            {assistantModeDefinition.label} mode. Type <kbd className="rounded border border-[var(--border)] px-1">/</kbd> for commands. Enter to send.
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
          <div className="relative flex w-full items-end gap-2 rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 shadow-sm sm:flex-1">
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
                    ? 'This conversation is in human handoff mode.'
                    : `${assistantModeDefinition.placeholder} (type / for commands)`
                  : 'Reconnect the assistant runtime to start...'
              }
              className="max-h-44 min-h-[40px] w-full resize-none bg-transparent px-2 py-2 text-sm text-[var(--tone-strong)] outline-none placeholder:text-[var(--tone-soft)] disabled:cursor-not-allowed disabled:text-[var(--tone-soft)] dark:text-[var(--tone-inverse)]"
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
              New thread
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
