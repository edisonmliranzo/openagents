const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
}

export function isFirebaseAuthConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId)
}

/**
 * Opens the Google account picker through Firebase Auth and returns a fresh
 * Firebase ID token. The token is exchanged server-side for the normal
 * OpenAgents access/refresh token pair; Firebase is never the session issuer.
 */
export async function signInWithGoogleIdToken(): Promise<string> {
  if (!isFirebaseAuthConfigured()) {
    throw new Error('Google sign-in is not configured.')
  }

  const { initializeApp, getApps } = await import('firebase/app')
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')

  const app = getApps()[0] ?? initializeApp(firebaseConfig)
  const auth = getAuth(app)
  auth.useDeviceLanguage()

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  const credential = await signInWithPopup(auth, provider)
  return credential.user.getIdToken()
}

export function firebaseAuthErrorMessage(error: unknown): string | null {
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return null
  }
  if (code === 'auth/popup-blocked') {
    return 'Your browser blocked the Google sign-in popup. Allow popups and try again.'
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
