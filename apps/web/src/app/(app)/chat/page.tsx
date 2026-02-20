'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { ApprovalBanner } from '@/components/chat/ApprovalBanner'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { ConversationList } from '@/components/chat/ConversationList'
import { useChatStore } from '@/stores/chat'
import { RefreshCw, Radio, ShieldCheck } from 'lucide-react'

function shortId(value?: string | null) {
  if (!value) return 'session'
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export default function ChatPage() {
  const searchParams = useSearchParams()
  const targetConversationId = searchParams.get('conversation')
  const autoCreatedRef = useRef(false)
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

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const gatewayConnected = gatewayStatus === 'connected'
  const statusText = gatewayConnected ? 'Gateway online' : gatewayMessage || 'Gateway offline'

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] bg-gradient-to-b from-slate-100 via-slate-50 to-white px-6 py-5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto flex h-[calc(100vh-96px)] max-w-[1580px] flex-col gap-4">
        <header className="rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-4 shadow-card backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                <Radio size={12} />
                OpenAgent Live Chat
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Control Chat</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Real-time gateway conversations with approvals, tools, and code-aware replies.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  gatewayConnected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${gatewayConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {statusText}
              </span>

              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Session {activeConversation?.title ?? shortId(activeConversationId)}
              </div>

              <button
                type="button"
                onClick={() => void loadConversations()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
                  className="ml-3 rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-200"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="min-h-0 rounded-2xl border border-slate-200/80 bg-white/90 shadow-card backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
            <ConversationList />
          </aside>

          <section className="min-h-0 flex flex-col gap-3">
            {pendingApprovals.length > 0 && (
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
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
