import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createSDK } from '@openagents/sdk'
import type { User } from '@openagents/shared'

const DEFAULT_API_BASE_URL = 'http://localhost:3001'

function isValidSignedJwtFormat(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  // Reject unsigned alg:none tokens or legacy static tokens
  if (parts[0] === 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0' || parts[2] === 'cf-d1') return false
  return Boolean(parts[0] && parts[1] && parts[2])
}

function resolveApiBaseUrl() {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL).trim()
  if (!configured) return DEFAULT_API_BASE_URL
  if (typeof window === 'undefined') return configured
  return window.location.origin
}

const sdk = createSDK({
  baseUrl: resolveApiBaseUrl(),
  onTokenRefresh: (tokens) => {
    useAuthStore.setState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresIn: tokens.expiresIn,
    })
  },
  onUnauthorized: () => {
    useAuthStore.getState().clear()
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  },
})

export { sdk }

function authCookieSuffix(maxAgeSeconds: number) {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : ''
  return `path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`
}

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
  firebaseLogin: (idToken: string) => Promise<void>
  logout: () => Promise<void>
  clear: () => void
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
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
          // Unauthorized flow clears tokens if invalid/expired.
        }
      },

      async login(email, password) {
        const result = await sdk.auth.login({ email, password })
        sdk.client.setTokens(result.tokens)
        if (typeof document !== 'undefined') {
          document.cookie = `openagents-authed=1; ${authCookieSuffix(604800)}`
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
          document.cookie = `openagents-authed=1; ${authCookieSuffix(604800)}`
        }
        set({
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          tokenExpiresIn: result.tokens.expiresIn,
          hydrated: true,
        })
      },

      async firebaseLogin(idToken) {
        if (typeof sdk.auth.firebaseLogin !== 'function') {
          throw new Error('OpenAgents was updated. Please refresh the page and try again.')
        }
        const result = await sdk.auth.firebaseLogin(idToken)
        sdk.client.setTokens(result.tokens)
        if (typeof document !== 'undefined') {
          document.cookie = `openagents-authed=1; ${authCookieSuffix(604800)}`
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
        try {
          await sdk.auth.logout()
        } catch {}
        sdk.client.clearTokens()
        if (typeof document !== 'undefined') {
          document.cookie = `openagents-authed=; ${authCookieSuffix(0)}`
        }
        set({ user: null, accessToken: null, refreshToken: null, tokenExpiresIn: null, hydrated: true })
      },

      async changePassword(currentPassword, newPassword) {
        await sdk.auth.changePassword(currentPassword, newPassword)
      },

      clear() {
        sdk.client.clearTokens()
        if (typeof document !== 'undefined') {
          document.cookie = `openagents-authed=; ${authCookieSuffix(0)}`
        }
        set({ user: null, accessToken: null, refreshToken: null, tokenExpiresIn: null, hydrated: true })
      },
    }),
    {
      name: 'openagents-auth',
      version: 3,
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        tokenExpiresIn: s.tokenExpiresIn,
        user: s.user,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<AuthState>
        if (!isValidSignedJwtFormat(persisted.accessToken)) {
          return {
            ...currentState,
            user: null,
            accessToken: null,
            refreshToken: null,
            tokenExpiresIn: null,
          }
        }
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
        return (rehydratedState, error) => {
          if (error || !isValidSignedJwtFormat(rehydratedState?.accessToken)) {
            sdk.client.clearTokens()
            if (typeof document !== 'undefined') {
              document.cookie = `openagents-authed=; ${authCookieSuffix(0)}`
            }
            state?.setUser(null)
            state?.setHydrated(true)
            return
          }

          if (rehydratedState?.accessToken && rehydratedState?.refreshToken) {
            sdk.client.setTokens({
              accessToken: rehydratedState.accessToken,
              refreshToken: rehydratedState.refreshToken,
              expiresIn: rehydratedState.tokenExpiresIn ?? 0,
            })
            if (typeof document !== 'undefined') {
              document.cookie = `openagents-authed=1; ${authCookieSuffix(604800)}`
            }
          } else {
            sdk.client.clearTokens()
            if (typeof document !== 'undefined') {
              document.cookie = `openagents-authed=; ${authCookieSuffix(0)}`
            }
          }

          state?.setHydrated(true)
        }
      },
    },
  ),
)
