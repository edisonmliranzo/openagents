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
  const [email, setEmail] = useState('admin@openagents.app')
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

      if (email.trim().toLowerCase() !== 'admin@openagents.app') {
        setError('Access is restricted to platform administrator (admin@openagents.app). Public access is not open yet.')
        setLoading(false)
        return
      }

      if (mode === 'register') {
        setError('Public registration is currently closed. Only administrator accounts can sign in.')
        setLoading(false)
        return
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
    <div className="auth-theme flex min-h-[100dvh] items-center justify-center overflow-y-auto px-4 py-8" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
      <div className="oa-card-elevated w-full max-w-sm space-y-5 rounded-[28px] p-8 shadow-2xl" style={{ width: '100%', maxWidth: '420px', margin: 'auto', background: 'rgba(15, 23, 42, 0.92)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
        <div className="flex items-center gap-2">
          <span className="oa-brand-badge inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white">
            OA
          </span>
          <span className="text-xs font-bold tracking-wide text-white">
            OPENAGENTS
          </span>
        </div>

        <div>
          <h1 className="oa-gradient-text text-2xl font-semibold tracking-tight text-white">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1 text-[13px] text-slate-400">
            Your personal AI agent — self-hosted, always yours.
          </p>
        </div>

        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-3.5 text-xs text-rose-200">
          <p className="font-bold flex items-center gap-1.5 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            Private Beta • Administrator Sign-In Only
          </p>
          <p className="mt-1 text-[11px] text-rose-300 leading-normal">
            Platform access is restricted exclusively to <strong>admin@openagents.app</strong>.
          </p>
          <button
            type="button"
            onClick={() => {
              setEmail('admin@openagents.app')
              setPassword('REDACTED_PASS_00')
              setError('')
            }}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-rose-500 transition cursor-pointer"
          >
            🔑 Fill Admin Credentials
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-xl border border-slate-700/60 bg-slate-800/80 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError('')
            }}
            className="flex-1 rounded-md py-2 text-sm font-semibold oa-brand-badge text-white shadow-sm"
          >
            Admin Sign In
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
            <p className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
              Use 12+ characters with uppercase, lowercase, number, and symbol.
            </p>
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
