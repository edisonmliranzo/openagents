'use client'

import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat'
import { AgentAvatarPanel } from './AgentAvatarPanel'
import { MessageBubble } from './MessageBubble'
import { ArrowUp, BrainCircuit, PlusCircle, Sparkles } from 'lucide-react'

interface ChatWindowProps {
  gatewayConnected: boolean
  onNewSession: () => Promise<void> | void
}

function formatIntentLabel(intent: string | undefined) {
  if (!intent) return null
  const normalized = intent
    .replace(/^custom-intent-/, '')
    .replace(/-/g, ' ')
    .trim()
  if (!normalized) return null
  return normalized
}

export function ChatWindow({ gatewayConnected, onNewSession }: ChatWindowProps) {
  const { messages, sendMessage, isStreaming, activeConversationId, learnedSkill, runStatus } =
    useChatStore()
  const [input, setInput] = useState('')
  const [showAvatarPanel, setShowAvatarPanel] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const contentLayoutRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const learnedIntentLabel = formatIntentLabel(learnedSkill?.intent)

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

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming || !gatewayConnected) return
    setInput('')
    await sendMessage(text)
  }

  async function handleQuickPrompt(prompt: string) {
    if (isStreaming || !gatewayConnected) return
    await sendMessage(prompt)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const messageViewport = (
    <div
      className={
        showAvatarPanel
          ? 'min-h-0 h-full overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)]'
          : 'relative min-h-0 h-full'
      }
    >
      <div
        className={
          showAvatarPanel
            ? 'h-full overflow-y-auto bg-gradient-to-b from-[var(--surface)] via-[var(--surface)] to-[var(--surface-muted)] px-3 py-3 sm:px-5'
            : 'h-full overflow-y-auto bg-gradient-to-b from-[var(--surface)] via-[var(--surface)] to-[var(--surface-muted)] px-3 py-3 sm:px-5'
        }
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-6">
            <div className="w-full max-w-[720px] space-y-6 text-center">
              <div className="oa-brand-badge mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white">
                <Sparkles size={17} />
              </div>
              <div>
                <p className="text-[30px] font-semibold tracking-tight text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                  What do you want your assistant to do?
                </p>
                <p className="mx-auto mt-2 max-w-[580px] text-sm text-[var(--muted)] dark:text-[var(--muted)]">
                  Research, plan, write, browse, create files, and take action with approvals.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2.5">
                {[
                  'Plan my week from my tasks and calendar constraints.',
                  'Research the top competitors in my market and summarize the differences.',
                  'Draft a reply to this email and turn it into a clean response.',
                  'Create a launch checklist for my next product release.',
                ].map((prompt) => (
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
                    ? 'Pick a task above or type your own below.'
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

      <div className="relative border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-1 px-1 text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
          <p>Enter to send, Shift+Enter for a new line</p>
          <p>{isStreaming ? 'Assistant is working...' : 'Assistant ready'}</p>
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <div className="flex w-full items-end gap-2 rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 shadow-sm sm:flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={!gatewayConnected || isStreaming}
              rows={1}
              placeholder={
                gatewayConnected
                  ? 'Ask your assistant to research, write, plan, or act...'
                  : 'Reconnect the assistant runtime to start...'
              }
              className="max-h-44 min-h-[40px] w-full resize-none bg-transparent px-2 py-2 text-sm text-[var(--tone-strong)] outline-none placeholder:text-[var(--tone-soft)] disabled:cursor-not-allowed disabled:text-[var(--tone-soft)] dark:text-[var(--tone-inverse)]"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || !gatewayConnected || isStreaming}
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
              New task
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
