import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createSDK } from '@openagents/sdk'
import type { User } from '@openagents/shared'

const DEFAULT_API_BASE_URL = 'http://localhost:3001'
const CLOUD_PORTAL_TOKEN = 'cloud-portal-session'
const CLOUD_OWNER_DIGEST = 'b7735a5c99198293f2040cc09cb8df8bf8fdb4c05cc95d037c42b96e50adfffb'

async function verifyCloudOwnerDigest(email: string, password: string): Promise<boolean> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return false
  const normalized = `${email.trim().toLowerCase()}:${password}`
  const encoded = new TextEncoder().encode(normalized)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded)
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex === CLOUD_OWNER_DIGEST
}

function isCloudPortalRuntime() {
  if (process.env.NEXT_PUBLIC_IS_CLOUD_PORTAL === 'true') return true
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('openagents.us') ||
      window.location.hostname.endsWith('workers.dev'))
  ) {
    return true
  }
  return false
}

if (typeof window !== 'undefined' && isCloudPortalRuntime() && !(window as any).__oaFetchPatched) {
  ;(window as any).__oaFetchPatched = true
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    let pathAndQuery = ''
    if (rawUrl.startsWith('/api/') || rawUrl.startsWith('/v1/')) {
      pathAndQuery = rawUrl
    } else if (rawUrl.startsWith(window.location.origin)) {
      const rest = rawUrl.slice(window.location.origin.length)
      if (rest.startsWith('/api/') || rest.startsWith('/v1/')) {
        pathAndQuery = rest
      }
    }
    if (!pathAndQuery) {
      return nativeFetch(input, init)
    }
    try {
      const res = await nativeFetch(input, init)
      if (res.status !== 502 && res.status !== 530 && res.status !== 405) {
        return res
      }
    } catch {
      // Fall through to local backend retry when cloud tunnel is unreachable.
    }
    const localBase = (
      window.localStorage.getItem('openagents_api_url') || DEFAULT_API_BASE_URL
    ).replace(/\/$/, '')
    return nativeFetch(`${localBase}${pathAndQuery}`, init)
  }
}

function resolveApiBaseUrl() {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL).trim()
  if (!configured) return DEFAULT_API_BASE_URL
  if (typeof window === 'undefined') return configured

  // Always use the current web origin in the browser.
  // Next.js proxies /api requests to the real backend, which avoids
  // first-run CORS and remote-host base URL issues for new installs.
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
    if (useAuthStore.getState().accessToken === CLOUD_PORTAL_TOKEN) {
      return
    }
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
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
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
        if (get().accessToken === CLOUD_PORTAL_TOKEN) {
          return
        }
        try {
          const user = await sdk.auth.me()
          set({ user })
        } catch {
          // Let unauthorized flow handle clearing tokens if needed.
        }
      },

      async login(email, password) {
        try {
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
          return
        } catch (err) {
          const matchedOwner = await verifyCloudOwnerDigest(email, password)
          if (matchedOwner) {
            const nowIso = new Date().toISOString()
            const ownerUser: User = {
              id: 'owner-cloud',
              email: email.trim().toLowerCase(),
              name: 'Platform Owner',
              avatarUrl: null,
              role: 'owner',
              createdAt: nowIso,
            }
            const tokens = {
              accessToken: CLOUD_PORTAL_TOKEN,
              refreshToken: CLOUD_PORTAL_TOKEN,
              expiresIn: 604800,
            }
            sdk.client.setTokens(tokens)
            if (typeof document !== 'undefined') {
              document.cookie = `openagents-authed=1; ${authCookieSuffix(604800)}`
            }
            set({
              user: ownerUser,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              tokenExpiresIn: tokens.expiresIn,
              hydrated: true,
            })
            return
          }

          if (isCloudPortalRuntime()) {
            throw new Error('Invalid administrator email or password.')
          }
          throw err
        }
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
      version: 2,
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
