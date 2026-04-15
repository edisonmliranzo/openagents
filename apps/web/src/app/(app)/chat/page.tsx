'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { ApprovalBanner } from '@/components/chat/ApprovalBanner'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { useChatStore } from '@/stores/chat'
import { RefreshCw, Braces, ScanSearch } from 'lucide-react'

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

  const statusText =
    gatewayStatus === 'connected'
      ? 'connected'
      : gatewayMessage || 'disconnected (1006): no reason'

  return (
    <div className="-m-6 flex h-[calc(100vh-56px)] flex-col bg-slate-50">
      <div className="flex h-full flex-col px-6 py-4">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Chat</h1>
            <p className="mt-1 text-sm text-slate-500">
              Direct gateway chat session for quick interventions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                gatewayStatus === 'connected'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border border-red-200 bg-red-50 text-red-600'
              }`}
            >
              {statusText}
            </span>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
              {activeConversation?.title ?? shortId(activeConversationId)}
            </div>

            <button
              type="button"
              onClick={() => void loadConversations()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700"
              title="Reconnect"
            >
              <RefreshCw size={14} />
            </button>

            <div className="mx-1 h-6 w-px bg-slate-200" />

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400"
              title="JSON view"
            >
              <Braces size={14} />
            </button>

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400"
              title="Inspect"
            >
              <ScanSearch size={14} />
            </button>
          </div>
        </header>

        <div className="space-y-2">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            {gatewayStatus === 'connected'
              ? 'Connected to gateway.'
              : 'Disconnected from gateway.'}
          </div>

          {(lastError || gatewayStatus === 'disconnected') && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {lastError ?? gatewayMessage}
            </div>
          )}

          {lastError && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearError}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {pendingApprovals.length > 0 && (
          <div className="mt-3 space-y-2">
            {pendingApprovals.map((approval) => (
              <ApprovalBanner key={approval.id} approval={approval} />
            ))}
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1">
          <ChatWindow
            gatewayConnected={gatewayStatus === 'connected'}
            onNewSession={async () => {
              await createConversation()
            }}
          />
        </div>
      </div>
    </div>
  )
}
