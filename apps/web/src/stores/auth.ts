import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createSDK } from '@openagents/sdk'
import type { User } from '@openagents/shared'

const DEFAULT_API_BASE_URL = 'http://localhost:3001'

function isLoopbackHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function resolveApiBaseUrl() {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL).trim()
  if (!configured) return DEFAULT_API_BASE_URL
  if (typeof window === 'undefined') return configured

  let parsed: URL
  try {
    parsed = new URL(configured)
  } catch {
    return configured
  }

  const pageHost = window.location.hostname
  const pageProtocol = window.location.protocol
  const pageOrigin = window.location.origin

  if (!isLoopbackHost(parsed.hostname) || isLoopbackHost(pageHost)) {
    return parsed.origin
  }

  // Browser cannot reach server-side localhost from remote clients.
  // Keep the API port, but use the current host.
  parsed.hostname = pageHost

  // Avoid mixed-content blocks when app is served via HTTPS.
  if (pageProtocol === 'https:' && parsed.protocol === 'http:') {
    if (parsed.port) {
      parsed.protocol = 'https:'
    } else {
      return pageOrigin
    }
  }

  return parsed.origin
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
    if (typeof window !== 'undefined') {
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

      async logout() {
        try { await sdk.auth.logout() } catch {}
        sdk.client.clearTokens()
        if (typeof document !== 'undefined') {
          document.cookie = `openagents-authed=; ${authCookieSuffix(0)}`
        }
        set({ user: null, accessToken: null, refreshToken: null, tokenExpiresIn: null, hydrated: true })
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
        return (rehydratedState, error) => {
          if (error) {
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

          // Always finish hydration even when persisted state is missing/invalid.
          state?.setHydrated(true)
        }
      },
    },
  ),
)
