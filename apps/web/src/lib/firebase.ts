import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  browserPopupRedirectResolver,
} from 'firebase/auth'

/**
 * Recover from a stale deployment: remove cached bundles and old service
 * workers, then reload with a cache-busting URL. Used when the page detects
 * that its JS bundle is older than the deployed API/auth actions.
 */
export async function hardReloadWithCacheClear(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // ignore
  }
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // ignore
  }
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('_v', String(Date.now()))
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}

// Firebase Web API keys are public by design (security is enforced by Firebase
// Auth's authorized-domain list and security rules). Keeping a fallback here
// makes clean CI builds — including Cloudflare's Git integration — include the
// Google button even when .env.local is absent. Env vars still override it.
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAtTBG-VOQ_jzHHsrXmsP6TnrfBDLD18Yk',
  authDomain: 'podcastai-a3081.firebaseapp.com',
  projectId: 'podcastai-a3081',
  storageBucket: 'podcastai-a3081.firebasestorage.app',
  messagingSenderId: '438847412009',
  appId: '1:438847412009:web:b196456addf46f75c58938',
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
}

export function isFirebaseAuthConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId)
}

let cachedAuth: ReturnType<typeof getAuth> | null = null
let warmupStarted = false

function getFirebaseAuthInstance() {
  if (cachedAuth) return cachedAuth
  const app = getApps()[0] ?? initializeApp(firebaseConfig)
  const auth = getAuth(app)
  auth.useDeviceLanguage()
  cachedAuth = auth
  return auth
}

function createGoogleProvider() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}

/**
 * Proactively initializes Firebase Auth's popup/redirect resolver (loads gapi +
 * the hidden auth relay iframe + origin validation) as soon as `/login` mounts.
 * Without this, desktop browsers wait until the user clicks "Continue with Google"
 * to load `apis.google.com/js/api.js` and `__/auth/iframe`, which takes several
 * seconds and causes popup blockers or hangs on "Connecting to Google…".
 */
export function warmupGoogleAuth(): void {
  if (!isFirebaseAuthConfigured() || typeof window === 'undefined' || warmupStarted) return
  warmupStarted = true
  try {
    const auth = getFirebaseAuthInstance()
    const resolver =
      (auth as any)._popupRedirectResolver ??
      (typeof (browserPopupRedirectResolver as any)?._initialize === 'function'
        ? browserPopupRedirectResolver
        : null)
    if (resolver && typeof resolver._initialize === 'function') {
      void Promise.resolve(resolver._initialize(auth)).catch(() => {})
    }
    if (resolver && typeof resolver._originValidation === 'function') {
      void Promise.resolve(resolver._originValidation(auth)).catch(() => {})
    }
  } catch {
    // ignore warmup failures
  }
}

/**
 * Checks whether the browser just returned from a `signInWithRedirect` flow
 * and returns the Firebase ID token if present. Also warms up the auth resolver.
 */
export async function consumePendingGoogleRedirectIdToken(): Promise<string | null> {
  if (!isFirebaseAuthConfigured() || typeof window === 'undefined') return null
  warmupGoogleAuth()
  try {
    const auth = getFirebaseAuthInstance()
    const result = await getRedirectResult(auth, browserPopupRedirectResolver)
    if (result?.user) {
      return await result.user.getIdToken()
    }
  } catch (err) {
    console.warn('[google-redirect]', err)
  }
  return null
}

/**
 * Full-page redirect fallback for browsers/environments that block popups or
 * third-party popup communication.
 */
export async function signInWithGoogleRedirect(): Promise<void> {
  if (!isFirebaseAuthConfigured()) {
    throw new Error('Google sign-in is not configured.')
  }
  const auth = getFirebaseAuthInstance()
  const provider = createGoogleProvider()
  await signInWithRedirect(auth, provider, browserPopupRedirectResolver)
}

/**
 * Opens the Google account picker and returns a fresh Firebase ID token.
 * Listens to `signInWithPopup`, `onAuthStateChanged`, and `auth.currentUser`
 * so COOP/third-party-cookie restrictions that prevent `window.closed` detection
 * resolve immediately once Firebase receives the credential.
 */
export async function signInWithGoogleIdToken(): Promise<string> {
  if (!isFirebaseAuthConfigured()) {
    throw new Error('Google sign-in is not configured.')
  }

  const auth = getFirebaseAuthInstance()
  const provider = createGoogleProvider()

  return await new Promise<string>((resolve, reject) => {
    let settled = false
    let unsubscribeAuth: (() => void) | null = null

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearInterval(userPoll)
      clearTimeout(safetyTimer)
      if (unsubscribeAuth) {
        try {
          unsubscribeAuth()
        } catch {
          // ignore
        }
      }
      fn()
    }

    // Also listen to onAuthStateChanged in case the popup credential arrives
    // before signInWithPopup's internal promise settles under strict COOP.
    try {
      unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user && user.providerData.some((p) => p.providerId === 'google.com')) {
          void user
            .getIdToken()
            .then((token) => {
              if (token) finish(() => resolve(token))
            })
            .catch(() => {})
        }
      })
    } catch {
      // ignore
    }

    // Start popup inside user click handler
    const popupPromise = signInWithPopup(auth, provider, browserPopupRedirectResolver)

    popupPromise
      .then(async (credential) => {
        try {
          const token = await credential.user.getIdToken()
          finish(() => resolve(token))
        } catch (err) {
          finish(() => reject(err))
        }
      })
      .catch(async (err: any) => {
        const code = String(err?.code ?? '')
        // If popups are blocked or unsupported in this browser/webview, fall back to full-page redirect
        if (
          code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment'
        ) {
          try {
            await signInWithRedirect(auth, provider, browserPopupRedirectResolver)
            return
          } catch (redirectErr) {
            finish(() => reject(redirectErr))
            return
          }
        }
        finish(() => reject(err))
      })

    // Poll auth.currentUser in case signInWithPopup's internal window-close poll
    // hangs due to COOP headers after the credential is already written.
    const userPoll = setInterval(() => {
      const current = auth.currentUser
      if (current && current.providerData.some((p) => p.providerId === 'google.com')) {
        void current
          .getIdToken()
          .then((token) => {
            if (token) finish(() => resolve(token))
          })
          .catch(() => {})
      }
    }, 500)

    // Never leave the button stuck on "Connecting to Google…" forever if the popup
    // was closed under strict Cross-Origin-Opener-Policy where window.closed is masked.
    const safetyTimer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'Google sign-in popup timed out or was blocked. Try clicking "Use redirect instead" below.',
          ),
        ),
      )
    }, 30_000)
  })
}

export function firebaseAuthErrorMessage(error: unknown): string | null {
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in window was closed before completing. Click "Continue with Google" to try again.'
  }
  if (code === 'auth/popup-blocked') {
    return 'Your browser blocked the Google sign-in popup. Allow popups for openagents.us and try again.'
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for Google sign-in yet. Add it in Firebase Authentication → Settings → Authorized domains.'
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is not enabled for this Firebase project. Enable the Google provider in Firebase Authentication.'
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Google sign-in is not supported in this browser context. Try opening OpenAgents in a regular browser tab.'
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with this email using a different sign-in method.'
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while contacting Google. Check your connection and try again.'
  }

  const message =
    error instanceof Error && error.message ? error.message : 'Google sign-in failed. Please try again.'

  // Minified bundle TypeErrors ("l is not a function", chunk-loading failures)
  // almost always mean the tab is running JS from an older deployment.
  if (/is not a function|chunkloaderror|loading chunk/i.test(message)) {
    return 'OpenAgents was updated in the background. Please refresh the page and try again.'
  }

  return message
}
