import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createSDK } from '@openagents/sdk'
import type { User } from '@openagents/shared'

const sdk = createSDK({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  onTokenRefresh: (tokens) => {
    useAuthStore.setState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresIn: tokens.expiresIn,
    })
  },
  onUnauthorized: () => {
    useAuthStore.getState().clear()
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  },
})

export { sdk }

interface AuthState {
  hydrated: boolean
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresIn: number | null
  setHydrated: (value: boolean) => void
  setUser: (user: User | null) => void
  syncUser: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout: () => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      hydrated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresIn: null,

      setHydrated(value) {
        set({ hydrated: value })
      },

      setUser(user) {
        set({ user })
      },

      async syncUser() {
        try {
          const user = await sdk.auth.me()
          set({ user })
        } catch {
          // Let unauthorized flow handle clearing tokens if needed.
        }
      },

      async login(email, password) {
        const result = await sdk.auth.login({ email, password })
        sdk.client.setTokens(result.tokens)
        if (typeof document !== 'undefined') {
          document.cookie = 'openagents-authed=1; path=/; max-age=604800'
        }
        set({
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          tokenExpiresIn: result.tokens.expiresIn,
          hydrated: true,
        })
      },

      async register(email, password, name) {
        const result = await sdk.auth.register({ email, password, name })
        sdk.client.setTokens(result.tokens)
        if (typeof document !== 'undefined') {
          document.cookie = 'openagents-authed=1; path=/; max-age=604800'
        }
        set({
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          tokenExpiresIn: result.tokens.expiresIn,
          hydrated: true,
        })
      },

      async logout() {
        try { await sdk.auth.logout() } catch {}
        sdk.client.clearTokens()
        if (typeof document !== 'undefined') {
          document.cookie = 'openagents-authed=; path=/; max-age=0'
        }
        set({ user: null, accessToken: null, refreshToken: null, tokenExpiresIn: null, hydrated: true })
      },

      clear() {
        sdk.client.clearTokens()
        if (typeof document !== 'undefined') {
          document.cookie = 'openagents-authed=; path=/; max-age=0'
        }
        set({ user: null, accessToken: null, refreshToken: null, tokenExpiresIn: null, hydrated: true })
      },
    }),
    {
      name: 'openagents-auth',
      version: 1,
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        tokenExpiresIn: s.tokenExpiresIn,
        user: s.user,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<AuthState>
        return {
          ...currentState,
          user: persisted.user ?? currentState.user,
          accessToken: persisted.accessToken ?? currentState.accessToken,
          refreshToken: persisted.refreshToken ?? currentState.refreshToken,
          tokenExpiresIn: persisted.tokenExpiresIn ?? currentState.tokenExpiresIn,
        }
      },
      onRehydrateStorage: (state) => {
        state?.setHydrated(false)
        return (rehydratedState) => {
          if (rehydratedState?.accessToken && rehydratedState?.refreshToken) {
            sdk.client.setTokens({
              accessToken: rehydratedState.accessToken,
              refreshToken: rehydratedState.refreshToken,
              expiresIn: rehydratedState.tokenExpiresIn ?? 0,
            })
          } else {
            sdk.client.clearTokens()
          }
          rehydratedState?.setHydrated(true)
        }
      },
    },
  ),
)
