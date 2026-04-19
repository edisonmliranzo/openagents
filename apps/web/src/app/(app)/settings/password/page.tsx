'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'next/navigation'

export default function ChangePasswordPage() {
  const changePassword = useAuthStore((s) => s.changePassword)
  const logout = useAuthStore((s) => s.logout)
  const router = useRouter()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (next !== confirm) {
      setError('New passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await changePassword(current, next)
      setSuccess('Password changed. You will be logged out.')
      setCurrent('')
      setNext('')
      setConfirm('')
      setTimeout(async () => {
        await logout()
        router.push('/login')
      }, 2000)
    } catch (err: any) {
      const msg = err?.message
      try {
        const parsed = JSON.parse(msg)
        setError(parsed.message ?? 'Failed to change password.')
      } catch {
        setError(typeof msg === 'string' ? msg : 'Failed to change password.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-[var(--tone-strong)]">Change Password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your email cannot be changed to protect your account. Use a strong password with 12+
          characters, uppercase, lowercase, number, and symbol.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        {success && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--muted)]">Current password</label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--muted)]">New password</label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            autoComplete="new-password"
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--muted)]">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="oa-input-surface h-11 w-full rounded-xl px-4 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="oa-accent-button h-11 w-full rounded-xl font-semibold text-white transition disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
