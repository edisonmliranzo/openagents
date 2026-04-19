'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { sdk } from '@/stores/auth'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token.')
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await sdk.auth.resetPassword(token, password)
      setSuccess('Password reset! Redirecting to sign in...')
      setTimeout(() => router.push('/login'), 2000)
    } catch (err: any) {
      const msg = err?.message
      try {
        const parsed = JSON.parse(msg)
        setError(parsed.message ?? 'Failed to reset password.')
      } catch {
        setError(typeof msg === 'string' ? msg : 'Failed to reset password.')
      }
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

        <div>
          <h1 className="text-base font-semibold text-[var(--tone-strong)]">Set new password</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use 12+ characters with uppercase, lowercase, number, and symbol.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {success && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={!token}
            autoComplete="new-password"
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />

          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={!token}
            autoComplete="new-password"
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />

          <button
            type="submit"
            disabled={loading || !token}
            className="oa-accent-button h-11 w-full rounded-xl font-semibold text-white transition disabled:opacity-50"
          >
            {loading ? 'Resetting...' : 'Reset password'}
          </button>

          <Link
            href="/login"
            className="block text-center text-sm text-[var(--muted)] hover:text-[var(--tone-strong)]"
          >
            Back to sign in
          </Link>
        </form>
      </div>
    </div>
  )
}
