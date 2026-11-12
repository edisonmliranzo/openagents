'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { sdk } from '@/stores/auth'

function VerifyEmailInner() {
  const token = useSearchParams().get('token') ?? ''
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage('Missing verification token.')
      return
    }
    sdk.client
      .get(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setState('ok'))
      .catch((e: unknown) => {
        let msg = e instanceof Error ? e.message : 'Verification failed.'
        try {
          msg = JSON.parse(msg).message ?? msg
        } catch {
          /* plain message */
        }
        setState('error')
        setMessage(msg)
      })
  }, [token])

  return (
    <div className="mx-auto max-w-md space-y-4 p-5 text-center sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Email verification</h1>
      {state === 'loading' && <p className="text-slate-500">Verifying…</p>}
      {state === 'ok' && <p className="text-emerald-700">Your email is verified. Thanks!</p>}
      {state === 'error' && <p className="text-rose-700">{message}</p>}
      <Link href="/dashboard" className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
        Continue to OpenAgents
      </Link>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">Loading…</p>}>
      <VerifyEmailInner />
    </Suspense>
  )
}
