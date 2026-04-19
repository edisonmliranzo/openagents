'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sdk } from '@/stores/auth'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await sdk.auth.forgotPassword(email)
      setSubmitted(true)
    } catch (err: any) {
      setError('Something went wrong. Please try again.')
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
          <h1 className="text-base font-semibold text-[var(--tone-strong)]">Reset your password</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Enter your email and we'll send a reset link if the account exists.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              Check your inbox — a reset link has been sent if that email is registered.
            </p>
            <Link
              href="/login"
              className="block text-center text-sm text-[var(--muted)] hover:text-[var(--tone-strong)]"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
            />

            <button
              type="submit"
              disabled={loading}
              className="oa-accent-button h-11 w-full rounded-xl font-semibold text-white transition disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>

            <Link
              href="/login"
              className="block text-center text-sm text-[var(--muted)] hover:text-[var(--tone-strong)]"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
