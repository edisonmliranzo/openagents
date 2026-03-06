'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ApprovalBanner } from '@/components/chat/ApprovalBanner'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { ConversationList } from '@/components/chat/ConversationList'
import { LiveToolPanel } from '@/components/chat/LiveToolPanel'
import { useChatStore } from '@/stores/chat'
import { RefreshCw, ShieldCheck } from 'lucide-react'

function shortId(value?: string | null) {
  if (!value) return 'session'
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

type MobilePanel = 'sessions' | 'chat' | 'tools'

export default function ChatPage() {
  const searchParams = useSearchParams()
  const targetConversationId = searchParams.get('conversation')
  const autoCreatedRef = useRef(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('chat')
  const {
    conversations,
    activeConversationId,
    pendingApprovals,
    gatewayStatus,
    gatewayMessage,
    lastError,
    loadConversations,
    selectConversation,
    createConversation,
    clearError,
  } = useChatStore()

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    const run = async () => {
      if (targetConversationId) {
        await selectConversation(targetConversationId)
        setMobilePanel('chat')
        return
      }

      if (activeConversationId) return

      if (conversations.length > 0) {
        await selectConversation(conversations[0].id)
        return
      }

      if (!autoCreatedRef.current) {
        autoCreatedRef.current = true
        try {
          await createConversation()
        } catch {
          // keep disconnected state banner
        }
      }
    }
    void run()
  }, [
    targetConversationId,
    activeConversationId,
    conversations,
    selectConversation,
    createConversation,
  ])

  useEffect(() => {
    if (activeConversationId) {
      setMobilePanel('chat')
    }
  }, [activeConversationId])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const gatewayConnected = gatewayStatus === 'connected'
  const statusText = gatewayConnected ? 'Gateway online' : gatewayMessage || 'Gateway offline'
  const hasPendingApprovals = pendingApprovals.length > 0

  return (
    <div className="min-h-[calc(100dvh-56px)] px-0 py-1 sm:px-2 sm:py-2 lg:h-[calc(100dvh-96px)] lg:min-h-0 lg:overflow-hidden">
      <div className="mx-auto flex min-h-[calc(100dvh-72px)] max-w-[1600px] flex-col gap-3 sm:gap-4 lg:h-full lg:min-h-0">
        <header className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                OpenAgent Chat
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
                Prompt Workspace
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Manus-inspired conversation flow with approvals, tool traces, and session memory.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  gatewayConnected
                    ? 'border-[var(--border)] bg-[var(--surface-muted)] text-slate-700 dark:text-slate-200'
                    : 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${gatewayConnected ? 'bg-black dark:bg-white' : 'bg-red-500'}`} />
                {statusText}
              </span>

              <div className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                Session {activeConversation?.title ?? shortId(activeConversationId)}
              </div>

              <button
                type="button"
                onClick={() => void loadConversations()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-slate-600 transition hover:bg-[var(--surface-muted)] dark:text-slate-200"
                title="Refresh sessions"
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>
          </div>

          {(lastError || !gatewayConnected) && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {lastError ?? gatewayMessage ?? 'Gateway disconnected.'}
              {lastError && (
                <button
                  type="button"
                  onClick={clearError}
                  className="ml-0 mt-2 inline-flex rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50 sm:ml-3 sm:mt-0 dark:border-red-500/30 dark:bg-transparent dark:text-red-200"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 lg:hidden dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMobilePanel('sessions')}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                mobilePanel === 'sessions'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Sessions
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel('chat')}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                mobilePanel === 'chat'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel('tools')}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                mobilePanel === 'tools'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Tools
            </button>
          </div>
        </header>

        <div className="hidden min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[300px_1fr]">
          <aside className="min-h-0 rounded-[24px] border border-[var(--border)] bg-[var(--surface)]">
            <ConversationList />
          </aside>

          <section className="min-h-0 flex flex-col gap-3">
            {hasPendingApprovals && (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <ShieldCheck size={12} />
                  Pending approvals ({pendingApprovals.length})
                </div>
                {pendingApprovals.map((approval) => (
                  <ApprovalBanner key={approval.id} approval={approval} />
                ))}
              </div>
            )}

            <div className="grid min-h-0 flex-1 gap-3 lg:max-h-[72dvh] xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-h-0">
                <ChatWindow
                  gatewayConnected={gatewayConnected}
                  onNewSession={async () => {
                    await createConversation()
                  }}
                />
              </div>
              <div className="min-h-0">
                <LiveToolPanel />
              </div>
            </div>
          </section>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:hidden">
          {mobilePanel === 'sessions' && (
            <aside className="min-h-0 flex-1 rounded-[24px] border border-[var(--border)] bg-[var(--surface)]">
              <ConversationList />
            </aside>
          )}

          {mobilePanel === 'chat' && (
            <section className="min-h-0 flex flex-1 flex-col gap-3">
              {hasPendingApprovals && (
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    <ShieldCheck size={12} />
                    Pending approvals ({pendingApprovals.length})
                  </div>
                  {pendingApprovals.map((approval) => (
                    <ApprovalBanner key={approval.id} approval={approval} />
                  ))}
                </div>
              )}

              <div className="min-h-0 flex-1">
                <ChatWindow
                  gatewayConnected={gatewayConnected}
                  onNewSession={async () => {
                    await createConversation()
                    setMobilePanel('chat')
                  }}
                />
              </div>
            </section>
          )}

          {mobilePanel === 'tools' && (
            <section className="min-h-0 flex-1">
              <LiveToolPanel />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
