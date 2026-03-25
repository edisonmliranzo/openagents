'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ApprovalBanner } from '@/components/chat/ApprovalBanner'
import {
  ASSISTANT_MODE_STORAGE_KEY,
  getAssistantModeDefinition,
  isAssistantMode,
  type AssistantMode,
} from '@/components/chat/assistantModes'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { ConversationList } from '@/components/chat/ConversationList'
import { LiveToolPanel } from '@/components/chat/LiveToolPanel'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { storageGet, storageSet } from '@/lib/storage'
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
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('assist')
  const [runtimeLabel, setRuntimeLabel] = useState('Default runtime')
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
          // Keep disconnected state banner.
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

  useEffect(() => {
    const stored = storageGet<string>(ASSISTANT_MODE_STORAGE_KEY, '')
    if (stored && isAssistantMode(stored)) setAssistantMode(stored)
  }, [])

  useEffect(() => {
    const run = async () => {
      const settings = await sdk.users.getSettings().catch(() => null)
      if (!settings) return
      const provider = settings.preferredProvider?.trim() || 'default'
      const model = settings.preferredModel?.trim() || 'default model'
      setRuntimeLabel(`Default (${model} / ${provider})`)
    }
    void run()
  }, [])

  useEffect(() => {
    storageSet(ASSISTANT_MODE_STORAGE_KEY, assistantMode)
  }, [assistantMode])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )
  const assistantModeDefinition = useMemo(
    () => getAssistantModeDefinition(assistantMode),
    [assistantMode],
  )

  const gatewayConnected = gatewayStatus === 'connected'
  const statusText = gatewayConnected ? 'Assistant online' : gatewayMessage || 'Assistant offline'
  const hasPendingApprovals = pendingApprovals.length > 0

  return (
    <div className="min-h-[calc(100dvh-56px)] px-0 py-1 sm:px-2 sm:py-2 lg:h-[calc(100dvh-96px)] lg:min-h-0 lg:overflow-hidden">
      <div className="mx-auto flex min-h-[calc(100dvh-72px)] max-w-[1880px] flex-col gap-3 sm:gap-4 lg:h-full lg:min-h-0">
        <header className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                OpenAgents &gt; Chat
              </p>
              <p className="truncate text-sm font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                {activeConversation?.title ?? 'main'}
              </p>
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
                  className={`h-1.5 w-1.5 rounded-full ${gatewayConnected ? 'bg-emerald-500' : 'bg-red-500'}`}
                />
                {statusText}
              </span>

              <button
                type="button"
                onClick={() => setShowToolsPanel((open) => !open)}
                className={`hidden h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition dark:text-[var(--tone-inverse)] lg:inline-flex ${
                  showToolsPanel
                    ? 'border border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--tone-strong)] shadow-sm'
                    : 'oa-soft-button text-[var(--tone-muted)]'
                }`}
                title={showToolsPanel ? 'Hide control panel' : 'Show control panel'}
              >
                <PanelRight size={12} />
                {showToolsPanel ? 'Hide control' : 'Show control'}
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex min-w-[180px] items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] font-medium text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
              {activeConversation?.title ?? 'main'}
            </div>
            <div className="inline-flex min-w-[250px] items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] font-medium text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
              {runtimeLabel}
            </div>
            <div className="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
              {shortId(activeConversationId)}
            </div>
            <div className="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
              {assistantModeDefinition.label} mode
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
              Control
            </button>
          </div>
        </header>

        <div
          className={`hidden min-h-0 flex-1 gap-3 lg:grid ${showToolsPanel ? 'lg:grid-cols-[270px_minmax(0,1fr)_320px]' : 'lg:grid-cols-[270px_minmax(0,1fr)]'}`}
        >
          <aside className="min-h-0 overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
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
                assistantMode={assistantMode}
                onAssistantModeChange={setAssistantMode}
                gatewayConnected={gatewayConnected}
                onNewSession={async () => {
                  await createConversation()
                }}
              />
            </div>
          </section>

          {showToolsPanel && (
            <aside className="min-h-0 overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
              <LiveToolPanel assistantMode={assistantMode} />
            </aside>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:hidden">
          {mobilePanel === 'sessions' && (
            <aside className="min-h-0 flex-1 overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
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
                  assistantMode={assistantMode}
                  onAssistantModeChange={setAssistantMode}
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
            <section className="min-h-0 flex-1 overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
              <LiveToolPanel assistantMode={assistantMode} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
