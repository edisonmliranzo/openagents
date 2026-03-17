'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ApprovalBanner } from '@/components/chat/ApprovalBanner'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { ConversationList } from '@/components/chat/ConversationList'
import { LiveToolPanel } from '@/components/chat/LiveToolPanel'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { PanelRight, RefreshCw, ShieldCheck } from 'lucide-react'

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
  const [showToolsPanel, setShowToolsPanel] = useState(false)
  const {
    conversations,
    conversationsLoaded,
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
      if (!conversationsLoaded) return

      if (conversations.length > 0) {
        const settings = await sdk.users.getSettings().catch(() => null)
        const preferredConversationId = settings?.lastActiveConversationId ?? null
        const resumeConversationId =
          conversations.find((conversation) => conversation.id === preferredConversationId)?.id ??
          conversations[0].id
        await selectConversation(resumeConversationId)
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
    conversationsLoaded,
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
  const statusText = gatewayConnected ? 'Assistant online' : gatewayMessage || 'Assistant offline'
  const hasPendingApprovals = pendingApprovals.length > 0

  return (
    <div className="min-h-[calc(100dvh-56px)] px-0 py-1 sm:px-2 sm:py-2 lg:h-[calc(100dvh-96px)] lg:min-h-0 lg:overflow-hidden">
      <div className="mx-auto flex min-h-[calc(100dvh-72px)] max-w-[1600px] flex-col gap-3 sm:gap-4 lg:h-full lg:min-h-0">
        <header className="oa-card-elevated rounded-2xl px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="oa-brand-badge flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-bold text-white">
                OA
              </div>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] dark:text-[var(--muted)]">
                  Personal Assistant
                </p>
                <p className="truncate text-sm font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                  {activeConversation?.title ?? 'Start a task'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                  gatewayConnected
                    ? 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--tone-default)] dark:text-[var(--tone-inverse)]'
                    : 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${gatewayConnected ? 'bg-[var(--accent)]' : 'bg-red-500'}`}
                />
                {statusText}
              </span>

              <div className="hidden rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-medium text-[var(--muted)] dark:text-[var(--muted)] sm:block">
                {shortId(activeConversationId)}
              </div>

              <button
                type="button"
                onClick={() => setShowToolsPanel((open) => !open)}
                className={`hidden h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition dark:text-[var(--tone-inverse)] lg:inline-flex ${
                  showToolsPanel
                    ? 'border border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--tone-strong)] shadow-sm'
                    : 'oa-soft-button text-[var(--tone-muted)]'
                }`}
                title={showToolsPanel ? 'Hide tool runtime panel' : 'Show tool runtime panel'}
              >
                <PanelRight size={12} />
                {showToolsPanel ? 'Hide tools' : 'Show tools'}
              </button>

              <button
                type="button"
                onClick={() => void loadConversations()}
                className="oa-soft-button inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition dark:text-[var(--tone-inverse)]"
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

          <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1 lg:hidden">
            <button
              type="button"
              onClick={() => setMobilePanel('sessions')}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                mobilePanel === 'sessions'
                  ? 'bg-[var(--surface)] text-slate-900 shadow-sm dark:text-slate-100'
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
                  ? 'bg-[var(--surface)] text-slate-900 shadow-sm dark:text-slate-100'
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
                  ? 'bg-[var(--surface)] text-slate-900 shadow-sm dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Tools
            </button>
          </div>
        </header>

        <div
          className={`hidden min-h-0 flex-1 gap-3 lg:grid ${showToolsPanel ? 'lg:grid-cols-[290px_minmax(0,1fr)_330px]' : 'lg:grid-cols-[290px_minmax(0,1fr)]'}`}
        >
          <aside className="oa-card-elevated min-h-0 overflow-hidden rounded-2xl">
            <ConversationList />
          </aside>

          <section className="min-h-0 flex flex-col gap-2.5">
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
                }}
              />
            </div>
          </section>

          {showToolsPanel && (
            <aside className="oa-card-elevated min-h-0 overflow-hidden rounded-2xl">
              <LiveToolPanel />
            </aside>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:hidden">
          {mobilePanel === 'sessions' && (
            <aside className="oa-card-elevated min-h-0 flex-1 overflow-hidden rounded-2xl">
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
            <section className="oa-card-elevated min-h-0 flex-1 overflow-hidden rounded-2xl">
              <LiveToolPanel />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
