import { create } from 'zustand'
import { sdk } from './auth'
import type { Conversation, Message, Approval, HumanHandoffTicket } from '@openagents/shared'

type GatewayStatus = 'connecting' | 'connected' | 'disconnected'

function formatAgentError(raw: string) {
  const value = raw.trim()
  if (!value) return 'Agent request failed.'

  const lower = value.toLowerCase()
  if (lower === 'network error' || lower.includes('network error')) {
    return 'Model provider network error. Verify your internet/proxy, then retry or switch provider in Settings > Config.'
  }
  if (lower.includes('invalid x-api-key') || lower.includes('authentication_error')) {
    return 'LLM authentication failed. Add a valid provider key in Settings > Config and retry.'
  }
  if (lower.includes('does not support tools')) {
    return 'Selected model does not support tools. Pick a tools-capable model in Settings > Config and retry.'
  }
  if (lower.includes('no local ollama models found') || lower.includes('no ollama models found')) {
    return 'No Ollama models were found at the configured server URL. Run `ollama pull <model>` and refresh models in Settings > Config.'
  }
  if (lower.includes('api key') && lower.includes('not configured')) {
    return value
  }
  return value
}

function extractErrorMessage(message: unknown, fallback: string) {
  if (typeof message !== 'string') return fallback
  const trimmed = message.trim()
  if (!trimmed) return fallback

  try {
    const parsed = JSON.parse(trimmed) as { message?: string | string[] }
    if (Array.isArray(parsed.message) && parsed.message.length > 0) {
      return String(parsed.message[0] ?? fallback)
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // Not JSON; use the original message.
  }

  return trimmed
}

function deriveGatewayFailure(err: unknown, fallback: string): {
  gatewayStatus: GatewayStatus
  gatewayMessage: string
  lastError: string
} {
  const maybeError = err as { status?: unknown; message?: unknown } | null
  const status = typeof maybeError?.status === 'number' ? maybeError.status : null
  const message = extractErrorMessage(maybeError?.message, fallback)
  const offline =
    status === 0 ||
    /failed to reach api/i.test(message) ||
    /network request failed/i.test(message) ||
    /failed to fetch/i.test(message)

  return {
    gatewayStatus: offline ? 'disconnected' : 'connected',
    gatewayMessage: offline ? 'gateway offline (API unreachable)' : 'connected',
    lastError: message,
  }
}

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Message[]
  pendingApprovals: Approval[]
  activeHandoff: HumanHandoffTicket | null
  isStreaming: boolean
  gatewayStatus: GatewayStatus
  gatewayMessage: string
  lastError: string | null

  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  createConversation: () => Promise<string>
  sendMessage: (content: string) => Promise<void>
  approveAction: (approvalId: string) => Promise<void>
  denyAction: (approvalId: string) => Promise<void>
  refreshActiveHandoff: () => Promise<void>
  escalateToHuman: (reason?: string) => Promise<void>
  clearError: () => void
  appendStreamChunk: (chunk: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  pendingApprovals: [],
  activeHandoff: null,
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
    } catch (err: unknown) {
      set(deriveGatewayFailure(err, 'Failed to load conversations.'))
    }
  },

  async selectConversation(id) {
    try {
      const messages = await sdk.conversations.messages(id)
      set({
        activeConversationId: id,
        messages,
        activeHandoff: await sdk.handoffs.getActive(id),
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: null,
      })
    } catch (err: unknown) {
      set(deriveGatewayFailure(err, 'Failed to load conversation.'))
    }
  },

  async createConversation() {
    try {
      const conv = await sdk.conversations.create()
      set((s) => ({
        conversations: [conv, ...s.conversations],
        activeConversationId: conv.id,
        messages: [],
        activeHandoff: null,
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: null,
      }))
      return conv.id
    } catch (err: unknown) {
      set(deriveGatewayFailure(err, 'Failed to create conversation.'))
      throw err
    }
  },

  async sendMessage(content) {
    const { activeConversationId, activeHandoff } = get()
    if (!activeConversationId) {
      set({ lastError: 'No active conversation selected.' })
      return
    }
    if (activeHandoff && (activeHandoff.status === 'open' || activeHandoff.status === 'claimed')) {
      set({ lastError: `Conversation is in human handoff mode (${activeHandoff.status}).` })
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
      const activeHandoff = await sdk.handoffs.getActive(activeConversationId)

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
        activeHandoff,
        isStreaming: false,
        gatewayStatus: 'connected',
        gatewayMessage: 'connected',
        lastError: streamError,
      })
    } catch (err: unknown) {
      const failure = deriveGatewayFailure(err, 'Failed while streaming agent response.')
      set((s) => ({
        isStreaming: false,
        gatewayStatus: failure.gatewayStatus,
        gatewayMessage: failure.gatewayMessage,
        lastError: failure.lastError,
        messages: s.messages.map((m) =>
          m.id === agentTempId
            ? { ...m, content: failure.lastError, status: 'error' }
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

  async refreshActiveHandoff() {
    const { activeConversationId } = get()
    if (!activeConversationId) return
    try {
      const handoff = await sdk.handoffs.getActive(activeConversationId)
      set({ activeHandoff: handoff, lastError: null })
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to refresh handoff state' })
    }
  },

  async escalateToHuman(reason?: string) {
    const { activeConversationId } = get()
    if (!activeConversationId) {
      set({ lastError: 'No active conversation selected.' })
      return
    }
    try {
      const handoff = await sdk.handoffs.create({
        conversationId: activeConversationId,
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      })
      set({ activeHandoff: handoff, lastError: null })
    } catch (err: any) {
      set({ lastError: err?.message ?? 'Failed to escalate conversation' })
    }
  },

  clearError() {
    set({ lastError: null })
  },
}))
