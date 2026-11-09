'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ASSISTANT_MODE_STORAGE_KEY,
  isAssistantMode,
  type AssistantMode,
} from '@/components/chat/assistantModes'
import { ApprovalBanner } from '@/components/chat/ApprovalBanner'
import { ChatWindow } from '@/components/chat/ChatWindow'
import CanvasPanel from '@/components/chat/CanvasPanel'
import { MuseChatLayout } from '@/components/muse/MuseChatLayout'
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
    messages,
    isStreaming,
    pendingApprovals,
    gatewayStatus,
    loadConversations,
    selectConversation,
    createConversation,
  } = useChatStore()
  const conversationRows = useMemo(
    () => (Array.isArray(conversations) ? conversations : []),
    [conversations],
  )

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  // Cross-device synchronization: keep sessions and active conversation synced across Mobile, Web, and PC
  useEffect(() => {
    const syncAcrossDevices = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (useChatStore.getState().isStreaming) return

      await loadConversations()
      const state = useChatStore.getState()
      const currentRows = Array.isArray(state.conversations) ? state.conversations : []
      if (currentRows.length === 0) return

      const settings = await sdk.users.getSettings().catch(() => null)
      const remotePreferredId = settings?.lastActiveConversationId ?? null
      const currentActiveId = state.activeConversationId
      const currentHasNoMessages = state.messages.length === 0

      if (
        remotePreferredId &&
        remotePreferredId !== currentActiveId &&
        currentHasNoMessages &&
        currentRows.some((c) => c.id === remotePreferredId)
      ) {
        await selectConversation(remotePreferredId)
        return
      }

      if (currentActiveId && currentRows.some((c) => c.id === currentActiveId)) {
        try {
          const latestMessages = await sdk.conversations.messages(currentActiveId)
          if (
            Array.isArray(latestMessages) &&
            latestMessages.length !== useChatStore.getState().messages.length &&
            !useChatStore.getState().isStreaming
          ) {
            useChatStore.setState({ messages: latestMessages })
          }
        } catch {
          // ignore transient poll errors
        }
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncAcrossDevices()
      }
    }
    const onFocus = () => void syncAcrossDevices()
    const interval = window.setInterval(() => {
      void syncAcrossDevices()
    }, 25000)

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadConversations, selectConversation])

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
    const stored = storageGet<string>(ASSISTANT_MODE_STORAGE_KEY, '')
    if (stored && isAssistantMode(stored)) setAssistantMode(stored)
  }, [])

  useEffect(() => {
    storageSet(ASSISTANT_MODE_STORAGE_KEY, assistantMode)
  }, [assistantMode])

  const gatewayConnected = gatewayStatus === 'connected'
  const hasPendingApprovals = pendingApprovals.length > 0
  const handleRuntimeLabelChange = useCallback((_label: string) => {}, [])

  return (
    <MuseChatLayout>
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-transparent">
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
        <CanvasPanel />
      </div>
    </MuseChatLayout>
  )
}
