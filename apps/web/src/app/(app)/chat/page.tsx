'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ASSISTANT_MODE_STORAGE_KEY,
  getAssistantModeDefinition,
  isAssistantMode,
  type AssistantMode,
} from '@/components/chat/assistantModes'
import { ApprovalBanner } from '@/components/chat/ApprovalBanner'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { ConversationList } from '@/components/chat/ConversationList'
import { LiveToolPanel } from '@/components/chat/LiveToolPanel'
import { storageGet, storageSet } from '@/lib/storage'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'

export default function ChatPage() {
  const searchParams = useSearchParams()
  const targetConversationId = searchParams.get('conversation')
  const autoCreatedRef = useRef(false)
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('assist')
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
  const conversationRows = useMemo(
    () => (Array.isArray(conversations) ? conversations : []),
    [conversations],
  )

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
      if (!conversationsLoaded) return

      if (conversationRows.length > 0) {
        const settings = await sdk.users.getSettings().catch(() => null)
        const preferredConversationId = settings?.lastActiveConversationId ?? null
        const resumeConversationId =
          conversationRows.find((conversation) => conversation.id === preferredConversationId)?.id ??
          conversationRows[0].id
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
    conversationRows,
    selectConversation,
    createConversation,
  ])

  useEffect(() => {
    void activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    const stored = storageGet<string>(ASSISTANT_MODE_STORAGE_KEY, '')
    if (stored && isAssistantMode(stored)) setAssistantMode(stored)
  }, [])

  useEffect(() => {
    storageSet(ASSISTANT_MODE_STORAGE_KEY, assistantMode)
  }, [assistantMode])

  const activeConversation = useMemo(
    () => conversationRows.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversationRows, activeConversationId],
  )
  const assistantModeDefinition = useMemo(
    () => getAssistantModeDefinition(assistantMode),
    [assistantMode],
  )

  const gatewayConnected = gatewayStatus === 'connected'
  const hasPendingApprovals = pendingApprovals.length > 0
  const handleRuntimeLabelChange = useCallback((_label: string) => {}, [])

  return (
    <div className="mx-auto flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden">
      {(lastError || !gatewayConnected || hasPendingApprovals) && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {!gatewayConnected && (
            <div className="rounded-full border border-[#f3c8c5] bg-[#fff3f2] px-3 py-1.5 text-xs font-semibold text-[#d92d20]">
              {gatewayMessage ?? 'Assistant offline'}
            </div>
          )}
          {lastError && (
            <button
              type="button"
              onClick={clearError}
              className="rounded-full border border-[#f3c8c5] bg-[#fff8f7] px-3 py-1.5 text-xs font-semibold text-[#d92d20]"
            >
              {lastError} | Dismiss
            </button>
          )}
          {hasPendingApprovals && (
            <div className="rounded-full border border-[#f2d18b] bg-[#fff8e8] px-3 py-1.5 text-xs font-semibold text-[#b54708]">
              {pendingApprovals.length} approval{pendingApprovals.length === 1 ? '' : 's'} waiting
            </div>
          )}
          <div className="rounded-full border border-[#e4e7ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#475467]">
            {assistantModeDefinition.label}
          </div>
          {activeConversation && (
            <div className="rounded-full border border-[#e4e7ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#475467]">
              {activeConversation.title ?? 'main'}
            </div>
          )}
          <button
            type="button"
            onClick={() => void loadConversations()}
            className="rounded-full border border-[#e4e7ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#475467]"
          >
            Refresh sessions
          </button>
        </div>
      )}

      {hasPendingApprovals && (
        <div className="space-y-2 px-1">
          {pendingApprovals.map((approval) => (
            <ApprovalBanner key={approval.id} approval={approval} />
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)] min-[1760px]:grid-cols-[220px_minmax(0,1fr)_272px]">
        <aside className="hidden min-h-0 overflow-hidden rounded-[22px] border border-[#e6e8ef] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)] xl:block">
          <ConversationList />
        </aside>

        <div className="min-h-0 overflow-hidden">
          <ChatWindow
            assistantMode={assistantMode}
            onAssistantModeChange={setAssistantMode}
            gatewayConnected={gatewayConnected}
            onNewSession={async () => {
              await createConversation()
            }}
            onRuntimeLabelChange={handleRuntimeLabelChange}
          />
        </div>

        <aside className="hidden min-h-0 overflow-hidden rounded-[22px] border border-[#e6e8ef] bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)] min-[1760px]:block">
          <LiveToolPanel assistantMode={assistantMode} />
        </aside>
      </div>
    </div>
  )
}
