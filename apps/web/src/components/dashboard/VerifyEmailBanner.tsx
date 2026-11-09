'use client'

import { useEffect, useState } from 'react'
import { MailWarning, X } from 'lucide-react'
import { sdk } from '@/stores/auth'

/** Non-blocking banner shown to users who haven't verified their email yet. */
export function VerifyEmailBanner() {
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('oa_verify_banner_dismissed')) return
    sdk.client
      .get<{ verified: boolean; emailConfigured: boolean }>('/api/v1/auth/verification-status')
      .then((r) => setShow(!r.verified && r.emailConfigured))
      .catch(() => {})
  }, [])

  if (!show) return null

  async function resend() {
    setSending(true)
    try {
      await sdk.client.post('/api/v1/auth/resend-verification', {})
      setStatus('Verification email sent — check your inbox.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not send email right now.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <MailWarning size={16} className="shrink-0" />
      <span className="flex-1">{status ?? 'Please verify your email address to secure your account.'}</span>
      {!status && (
        <button type="button" onClick={() => void resend()} disabled={sending} className="font-semibold underline disabled:opacity-50">
          {sending ? 'Sending…' : 'Resend email'}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem('oa_verify_banner_dismissed', '1')
          setShow(false)
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default VerifyEmailBanner
