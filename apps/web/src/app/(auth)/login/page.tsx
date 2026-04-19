'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth'

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
        // Self-heal in-memory state and wipe bad persisted payload.
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

  return (
    <div className="auth-theme flex min-h-[100dvh] items-center justify-center overflow-y-auto px-4 py-6">
      <div className="oa-card-elevated w-full max-w-sm space-y-5 rounded-[28px] p-8">
        <div className="flex items-center gap-2">
          <span className="oa-brand-badge inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white">
            OA
          </span>
          <span className="text-xs font-bold tracking-wide text-[var(--tone-strong)]">
            OPENAGENTS
          </span>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError('')
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'login'
                ? 'oa-brand-badge text-white shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--tone-strong)]'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register')
              setError('')
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'register'
                ? 'oa-brand-badge text-white shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--tone-strong)]'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          {mode === 'register' && (
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />

          {mode === 'register' && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Use 12+ characters with uppercase, lowercase, number, and symbol.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="oa-accent-button h-11 w-full rounded-xl font-semibold text-white transition disabled:opacity-50"
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
