import { create } from 'zustand'
import { sdk } from './auth'
import type { Conversation, Message, Approval } from '@openagents/shared'

function formatAgentError(raw: string) {
  const value = raw.trim()
  if (!value) return 'Agent request failed.'

  const lower = value.toLowerCase()
  if (lower.includes('invalid x-api-key') || lower.includes('authentication_error')) {
    return 'LLM authentication failed. Add a valid provider key in Settings > Config and retry.'
  }
  if (lower.includes('api key') && lower.includes('not configured')) {
    return value
  }
  return value
}

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Message[]
  pendingApprovals: Approval[]
  isStreaming: boolean
  gatewayStatus: 'connecting' | 'connected' | 'disconnected'
  gatewayMessage: string
  lastError: string | null

  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  createConversation: () => Promise<string>
  sendMessage: (content: string) => Promise<void>
  approveAction: (approvalId: string) => Promise<void>
  denyAction: (approvalId: string) => Promise<void>
  clearError: () => void
  appendStreamChunk: (chunk: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  pendingApprovals: [],
  isStreaming: false,
  gatewayStatus: 'connecting',
  gatewayMessage: 'connecting...',
  lastError: null,

  async loadConversations() {
    try {
      const conversations = await sdk.conversations.list()
      set({
        conversations,
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: null,
      })
    } catch (err: any) {
      const message = err?.message ?? 'Disconnected from gateway.'
      set({
        gatewayStatus: 'disconnected',
        gatewayMessage: 'disconnected (1006): no reason',
        lastError: message,
      })
    }
  },

  async selectConversation(id) {
    try {
      const messages = await sdk.conversations.messages(id)
      set({
        activeConversationId: id,
        messages,
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: null,
      })
    } catch (err: any) {
      const message = err?.message ?? 'Failed to load conversation'
      set({
        gatewayStatus: 'disconnected',
        gatewayMessage: 'disconnected (1006): no reason',
        lastError: message,
      })
    }
  },

  async createConversation() {
    try {
      const conv = await sdk.conversations.create()
      set((s) => ({
        conversations: [conv, ...s.conversations],
        activeConversationId: conv.id,
        messages: [],
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: null,
      }))
      return conv.id
    } catch (err: any) {
      const message = err?.message ?? 'Failed to create conversation'
      set({
        gatewayStatus: 'disconnected',
        gatewayMessage: 'disconnected (1006): no reason',
        lastError: message,
      })
      throw err
    }
  },

  async sendMessage(content) {
    const { activeConversationId } = get()
    if (!activeConversationId) {
      set({ lastError: 'No active conversation selected.' })
      return
    }

    // Optimistically add user message
    const tempId = `temp-${Date.now()}`
    set((s) => ({
      messages: [
        ...s.messages,
        { id: tempId, conversationId: activeConversationId, role: 'user', content, status: 'done', createdAt: new Date().toISOString() } as Message,
      ],
      isStreaming: true,
      gatewayStatus: 'connected',
      gatewayMessage: 'connected',
      lastError: null,
    }))

    // Add placeholder agent message for streaming
    const agentTempId = `agent-${Date.now()}`
    set((s) => ({
      messages: [
        ...s.messages,
        { id: agentTempId, conversationId: activeConversationId, role: 'agent', content: '', status: 'streaming', createdAt: new Date().toISOString() } as Message,
      ],
    }))

    let streamError: string | null = null
    let sawAgentMessage = false
    let sawApprovalRequest = false

    try {
      await sdk.conversations.sendMessage(activeConversationId, content, (chunk) => {
        try {
          const data = JSON.parse(chunk)
          if (data.event === 'error') {
            const rawMessage =
              typeof data.data?.message === 'string'
                ? data.data.message
                : typeof data.data === 'string'
                  ? data.data
                  : 'Agent request failed.'
            const friendlyMessage = formatAgentError(rawMessage)
            streamError = friendlyMessage

            set((s) => ({
              lastError: friendlyMessage,
              messages: s.messages.map((m) =>
                m.id === agentTempId ? { ...m, content: friendlyMessage, status: 'error' } : m,
              ),
            }))
            return
          }

          if (data.event === 'message' && data.data?.role === 'agent') {
            sawAgentMessage = true
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === agentTempId ? { ...m, content: data.data.content, status: 'done' } : m,
              ),
            }))
          }
          if (data.event === 'approval_required') {
            sawApprovalRequest = true
            set((s) => ({ pendingApprovals: [...s.pendingApprovals, data.data.approval] }))
          }
        } catch {}
      })

      // Reload messages to get server-side IDs
      const messages = await sdk.conversations.messages(activeConversationId)

      let nextMessages = messages
      if (streamError) {
        const latestUser = [...messages].reverse().find((m) => m.role === 'user')
        const latestAgentAfterUser = [...messages]
          .reverse()
          .find((m) => m.role === 'agent' && (!latestUser || m.createdAt >= latestUser.createdAt))

        if (!latestAgentAfterUser) {
          nextMessages = [
            ...messages,
            {
              id: `agent-error-${Date.now()}`,
              conversationId: activeConversationId,
              role: 'agent',
              content: streamError,
              status: 'error',
              createdAt: new Date().toISOString(),
            } as Message,
          ]
        }
      } else if (!sawAgentMessage && !sawApprovalRequest) {
        streamError = 'Agent returned no reply. Check provider settings and try again.'
      }

      set({
        messages: nextMessages,
        isStreaming: false,
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: streamError,
      })
    } catch (err: any) {
      const message = err?.message ?? 'disconnected (1006): no reason'
      set((s) => ({
        isStreaming: false,
        gatewayStatus: 'disconnected',
        gatewayMessage: 'disconnected (1006): no reason',
        lastError: message,
        messages: s.messages.map((m) =>
          m.id === agentTempId
            ? { ...m, content: message, status: 'error' }
            : m,
        ),
      }))
    }
  },

  appendStreamChunk(chunk) {
    set((s) => {
      const last = s.messages[s.messages.length - 1]
      if (!last || last.role !== 'agent') return s
      return {
        messages: s.messages.map((m, i) =>
          i === s.messages.length - 1 ? { ...m, content: m.content + chunk } : m,
        ),
      }
    })
  },

  async approveAction(approvalId) {
    try {
      await sdk.approvals.approve(approvalId)
      set((s) => ({ pendingApprovals: s.pendingApprovals.filter((a) => a.id !== approvalId), lastError: null }))
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to approve action' })
    }
  },

  async denyAction(approvalId) {
    try {
      await sdk.approvals.deny(approvalId)
      set((s) => ({ pendingApprovals: s.pendingApprovals.filter((a) => a.id !== approvalId), lastError: null }))
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to deny action' })
    }
  },

  clearError() {
    set({ lastError: null })
  },
}))
