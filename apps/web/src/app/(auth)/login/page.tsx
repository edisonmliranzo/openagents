'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth'
import {
  firebaseAuthErrorMessage,
  isFirebaseAuthConfigured,
  signInWithGoogleIdToken,
} from '@/lib/firebase'

function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.6l6.3 5.3C41.9 35.3 44 30.1 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const googleEnabled = isFirebaseAuthConfigured()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'register') {
      setMode('register')
    }
    const prefillEmail = params.get('email')
    if (prefillEmail) {
      setEmail(prefillEmail)
    }
  }, [])

  function toErrorMessage(err: unknown, fallback: string) {
    if (!err || typeof err !== 'object') return fallback
    const message = (err as { message?: unknown }).message
    if (typeof message !== 'string' || !message.trim()) return fallback

    try {
      const parsed = JSON.parse(message) as { message?: string | string[] }
      if (Array.isArray(parsed.message) && parsed.message.length > 0) {
        return parsed.message[0] ?? fallback
      }
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message
      }
    } catch {
      // message is not JSON
    }

    return message
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      let state = useAuthStore.getState()
      if (typeof state.login !== 'function' || typeof state.register !== 'function') {
        const initial = useAuthStore.getInitialState()
        useAuthStore.setState(initial, true)
        useAuthStore.persist.clearStorage()
        state = useAuthStore.getState()
      }

      const safeLogin = typeof login === 'function' ? login : state.login
      const safeRegister = typeof register === 'function' ? register : state.register
      if (typeof safeLogin !== 'function' || typeof safeRegister !== 'function') {
        throw new Error('Unable to initialize auth actions. Please refresh the page.')
      }

      if (mode === 'login') {
        await safeLogin(email, password)
      } else {
        await safeRegister(email, password, name || undefined)
      }
      const nextPath =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null
      router.push(nextPath && nextPath.startsWith('/') ? nextPath : '/chat')
    } catch (err: any) {
      setError(toErrorMessage(err, mode === 'login' ? 'Login failed' : 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    if (googleLoading || loading) return

    // A browser tab that stayed open across a deployment can briefly hold an
    // older JS bundle. Recover instead of throwing "x is not a function".
    const firebaseAction = useAuthStore.getState().firebaseLogin
    if (typeof firebaseAction !== 'function') {
      const refreshKey = 'openagents.auth.refresh-once'
      const alreadyRefreshed =
        typeof window !== 'undefined' && window.sessionStorage.getItem(refreshKey) === '1'
      setError(
        alreadyRefreshed
          ? 'Your browser has an outdated version. Please force-refresh this page (Ctrl/Cmd + Shift + R).'
          : 'OpenAgents was updated. Refreshing this page…',
      )
      if (!alreadyRefreshed) {
        window.sessionStorage.setItem(refreshKey, '1')
        window.setTimeout(() => window.location.reload(), 500)
      }
      return
    }

    setError('')
    setGoogleLoading(true)
    try {
      const idToken = await signInWithGoogleIdToken()
      await firebaseAction(idToken)
      const nextPath =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null
      router.push(nextPath && nextPath.startsWith('/') ? nextPath : '/chat')
    } catch (err: any) {
      console.error('[google-signin]', err)
      const message = firebaseAuthErrorMessage(err)
      if (message) setError(message)
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="auth-theme flex min-h-[100dvh] items-center justify-center overflow-y-auto px-4 py-6 sm:py-8" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
      <div className="oa-card-elevated w-full max-w-sm space-y-4 rounded-[24px] p-5 shadow-2xl sm:space-y-5 sm:rounded-[28px] sm:p-8" style={{ width: '100%', maxWidth: '420px', margin: 'auto', background: 'rgba(15, 23, 42, 0.92)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '24px', padding: 'clamp(20px, 5vw, 32px)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <span className="oa-brand-badge inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white">
              OA
            </span>
            <span className="text-xs font-bold tracking-wide text-white">
              OPENAGENTS
            </span>
          </Link>
          <Link href="/" className="text-xs text-slate-400 hover:text-white transition">
            ← Home
          </Link>
        </div>

        <div>
          <h1 className="oa-gradient-text text-2xl font-semibold tracking-tight text-white">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1 text-[13px] text-slate-400">
            Your personal AI agent — self-hosted, durable, and always yours.
          </p>
        </div>

        {googleEnabled && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={googleLoading || loading}
              className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleMark />
              <span>{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
            </button>
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span className="h-px flex-1 bg-slate-700/70" />
              <span>or use email</span>
              <span className="h-px flex-1 bg-slate-700/70" />
            </div>
          </div>
        )}

        {/* Tab toggle */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-700/60 bg-slate-800/80 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError('')
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === 'login'
                ? 'oa-brand-badge text-white shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register')
              setError('')
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              mode === 'register'
                ? 'oa-brand-badge text-white shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="rounded-lg bg-red-950/60 border border-red-500/40 px-3 py-2 text-sm text-red-300">{error}</p>}

          {mode === 'register' && (
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/20"
              style={{ width: '100%', height: '44px', padding: '0 16px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.25)', background: 'rgba(15, 23, 42, 0.65)', color: '#f8fafc', fontSize: '14px' }}
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/20"
            style={{ width: '100%', height: '44px', padding: '0 16px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.25)', background: 'rgba(15, 23, 42, 0.65)', color: '#f8fafc', fontSize: '14px' }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/20"
            style={{ width: '100%', height: '44px', padding: '0 16px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.25)', background: 'rgba(15, 23, 42, 0.65)', color: '#f8fafc', fontSize: '14px' }}
          />

          {mode === 'register' && (
            <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
              <p>Use 8+ characters for your password.</p>
              <p className="text-slate-400">
                100% Free Cloud Workspace — pair with an{' '}
                <a
                  href="https://apisrouter.dev/?ref=openagents"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-orange-400 underline hover:text-orange-300"
                >
                  APIsRouter.dev
                </a>{' '}
                key (93+ models in 1 key) or Bring Your Own Key (BYOK).
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="oa-accent-button h-11 w-full rounded-xl font-semibold text-white transition disabled:opacity-50 cursor-pointer"
            style={{ width: '100%', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #ef4444, #f97316)', color: '#ffffff', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)' }}
          >
            {loading
              ? mode === 'login'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>

          {mode === 'login' && (
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-xs text-[var(--muted)] hover:text-[var(--tone-strong)]"
              >
                Forgot password?
              </Link>
            </div>
          )}

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Safety tip: OpenAgents never asks for your password, refresh token, or one-time code in
            chat.
          </p>
        </form>
      </div>
    </div>
  )
}
