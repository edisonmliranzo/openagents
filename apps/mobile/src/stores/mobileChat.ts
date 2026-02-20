import { create } from 'zustand'
import { createSDK } from '@openagents/sdk'
import type { Message, Approval, User } from '@openagents/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NativeModules, Platform } from 'react-native'

function inferApiBaseUrl() {
  const explicit = (process.env.EXPO_PUBLIC_API_URL ?? '').trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const scriptUrl = NativeModules?.SourceCode?.scriptURL
  if (typeof scriptUrl === 'string' && scriptUrl.startsWith('http')) {
    try {
      const parsed = new URL(scriptUrl)
      if (parsed.hostname) {
        return `http://${parsed.hostname}:3001`
      }
    } catch {
      // fall through to platform defaults
    }
  }

  if (Platform.OS === 'android') return 'http://10.0.2.2:3001'
  return 'http://localhost:3001'
}

const API_URL = inferApiBaseUrl()
export const MOBILE_API_URL = API_URL

const sdk = createSDK({
  baseUrl: API_URL,
  onTokenRefresh: (tokens) => {
    useMobileChatStore.setState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    })
    void AsyncStorage.setItem('mobile-auth', JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }))
  },
  onUnauthorized: () => {
    useMobileChatStore.getState().logout()
  },
})

export { sdk as mobileSdk }

interface MobileChatState {
  // Auth
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  authLoaded: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  loadAuth: () => Promise<void>

  // Chat
  conversationId: string | null
  messages: Message[]
  pendingApprovals: Approval[]
  isStreaming: boolean
  initConversation: () => Promise<void>
  sendMessage: (content: string) => Promise<void>
  approveAction: (id: string) => Promise<void>
  denyAction: (id: string) => Promise<void>
}

export const useMobileChatStore = create<MobileChatState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  authLoaded: false,

  async loadAuth() {
    try {
      const stored = await AsyncStorage.getItem('mobile-auth')
      if (stored) {
        const { accessToken, refreshToken } = JSON.parse(stored) as { accessToken: string; refreshToken: string }
        sdk.client.setTokens({ accessToken, refreshToken, expiresIn: 0 })
        const user = await sdk.auth.me()
        set({ accessToken, refreshToken, user, authLoaded: true })
      } else {
        set({ authLoaded: true })
      }
    } catch {
      set({ authLoaded: true })
    }
  },

  async login(email, password) {
    const result = await sdk.auth.login({ email, password })
    sdk.client.setTokens(result.tokens)
    await AsyncStorage.setItem('mobile-auth', JSON.stringify({
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    }))
    set({
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    })
  },

  async logout() {
    try { await sdk.auth.logout() } catch {}
    sdk.client.clearTokens()
    await AsyncStorage.removeItem('mobile-auth')
    set({ user: null, accessToken: null, refreshToken: null, conversationId: null, messages: [] })
  },

  conversationId: null,
  messages: [],
  pendingApprovals: [],
  isStreaming: false,

  async initConversation() {
    if (get().conversationId) return
    const conv = await sdk.conversations.create()
    set({ conversationId: conv.id })
  },

  async sendMessage(content) {
    const { conversationId } = get()
    if (!conversationId) return

    const tempMsg: Message = {
      id: `tmp-${Date.now()}`,
      conversationId,
      role: 'user',
      content,
      status: 'done',
      createdAt: new Date().toISOString(),
    }
    set((s) => ({ messages: [...s.messages, tempMsg], isStreaming: true }))

    const agentMsg: Message = {
      id: `agent-${Date.now()}`,
      conversationId,
      role: 'agent',
      content: '',
      status: 'streaming',
      createdAt: new Date().toISOString(),
    }
    set((s) => ({ messages: [...s.messages, agentMsg] }))

    await sdk.conversations.sendMessage(conversationId, content, (chunk) => {
      try {
        const data = JSON.parse(chunk)
        if (data.event === 'message' && data.data?.role === 'agent') {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === agentMsg.id ? { ...m, content: data.data.content, status: 'done' } : m,
            ),
          }))
        }
        if (data.event === 'approval_required') {
          set((s) => ({ pendingApprovals: [...s.pendingApprovals, data.data.approval] }))
        }
      } catch {}
    })

    set({ isStreaming: false })
    const messages = await sdk.conversations.messages(conversationId)
    set({ messages })
  },

  async approveAction(id) {
    await sdk.approvals.approve(id)
    set((s) => ({ pendingApprovals: s.pendingApprovals.filter((a) => a.id !== id) }))
  },

  async denyAction(id) {
    await sdk.approvals.deny(id)
    set((s) => ({ pendingApprovals: s.pendingApprovals.filter((a) => a.id !== id) }))
  },
}))
