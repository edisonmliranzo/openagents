'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
      const nextPath = typeof window !== 'undefined'
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
    <div className="flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-100 px-4 py-6">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white">*</span>
          <span className="text-xs font-bold tracking-wide text-slate-900">OPENAGENTS</span>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-lg border border-slate-200 p-1">
          <button
            type="button"
            onClick={() => { setMode('login'); setError('') }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'login' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError('') }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'register' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-slate-800 placeholder-slate-400 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-slate-800 placeholder-slate-400 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-slate-800 placeholder-slate-400 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />

          {mode === 'register' && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Use 12+ characters with uppercase, lowercase, number, and symbol.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-lg bg-red-500 font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
          >
            {loading
              ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
              : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Safety tip: OpenAgents never asks for your password, refresh token, or one-time code in chat.
          </p>
        </form>
      </div>
    </div>
  )
}
