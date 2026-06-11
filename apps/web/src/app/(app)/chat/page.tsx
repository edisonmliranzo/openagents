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
import { storageGet, storageSet } from '@/lib/storage'
import { sdk } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'

export default function ChatPage() {
  const searchParams = useSearchParams()
  const targetConversationId = searchParams.get('conversation')
  const autoCreatedRef = useRef(false)
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('autopilot')
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
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-transparent">
      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-0 bg-transparent">
        {hasPendingApprovals && (
          <div className="space-y-2 px-3 pt-2">
            {pendingApprovals.map((approval) => (
              <ApprovalBanner key={approval.id} approval={approval} />
            ))}
          </div>
        )}

        <div className="h-full min-h-0 flex-1 overflow-hidden">
          <ChatWindow
            assistantMode={assistantMode}
            onAssistantModeChange={setAssistantMode}
            gatewayConnected={gatewayConnected}
            onNewSession={async () => {
              await createConversation()
            }}
            onRuntimeLabelChange={handleRuntimeLabelChange}
            onOpenMobileSessions={() => {
              window.dispatchEvent(new CustomEvent('openagents:open-sidebar'))
            }}
          />
        </div>
      </div>
    </div>
  )
}
