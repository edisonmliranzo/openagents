'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, KeyRound, Phone, Sparkles, X } from 'lucide-react'
import { sdk, useAuthStore } from '@/stores/auth'

const STORAGE_KEY = 'openagents.onboarding'

type OnboardingState = 'completed' | 'dismissed'

function track(step: string) {
  try {
    void sdk.client.post('/api/v1/analytics/onboarding', { step }).catch(() => undefined)
  } catch {
    /* fire-and-forget */
  }
}

const STEPS = [
  { key: 'llm_key', title: 'Add your APIsRouter key', icon: KeyRound },
  { key: 'avatar', title: 'Pick an avatar', icon: Sparkles },
  { key: 'first_call', title: 'Make your first voice call', icon: Phone },
] as const

/** 3-step first-run wizard: LLM key → avatar → first voice call. */
export function OnboardingWizard() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    if (stored === 'completed' || stored === 'dismissed') return
    let cancelled = false
    sdk.users
      .getLlmKeys()
      .then((keys) => {
        if (cancelled) return
        const hasKey = Array.isArray(keys) && keys.some((k) => (k as { isActive?: boolean }).isActive !== false)
        setStep(hasKey ? 1 : 0)
        setOpen(true)
        track(hasKey ? 'shown_with_key' : 'shown')
      })
      .catch(() => {
        if (!cancelled) {
          setOpen(true)
          track('shown')
        }
      })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const finish = (state: OnboardingState) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, state)
    } catch {
      /* ignore */
    }
    track(state)
    setOpen(false)
  }

  const goTo = (next: number) => {
    track(STEPS[step].key + '_done')
    if (next >= STEPS.length) finish('completed')
    else setStep(next)
  }

  const saveKey = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    try {
      await sdk.users.upsertLlmKey('apisrouter', { apiKey: apiKey.trim(), isActive: true })
      setApiKey('')
      goTo(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save key')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
      <div role="dialog" aria-modal="true" aria-label="Get started" className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--tone-soft)]">
            Welcome · step {step + 1} of {STEPS.length}
          </p>
          <button type="button" onClick={() => finish('dismissed')} aria-label="Dismiss onboarding" className="text-[var(--muted)]">
            <X size={16} />
          </button>
        </div>

        <ol className="mb-5 flex gap-2">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />
          ))}
        </ol>

        {(() => {
          const Icon = STEPS[step].icon
          return (
            <div className="mb-3 flex items-center gap-3">
              <div className="oa-brand-badge flex h-10 w-10 items-center justify-center rounded-xl text-white">
                <Icon size={18} />
              </div>
              <h2 className="text-lg font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">{STEPS[step].title}</h2>
            </div>
          )
        })()}

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">
              OpenAgents is bring-your-own-key. Paste your APIsRouter key (apisrouter.dev) to power chat and voice.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none"
            />
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href="/settings/config" onClick={() => track('llm_key_open_settings')} className="text-xs font-medium underline underline-offset-2">
                Use another provider
              </Link>
              <div className="flex gap-2">
                <button type="button" onClick={() => goTo(1)} className="rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">
                  Skip
                </button>
                <button
                  type="button"
                  disabled={saving || !apiKey.trim()}
                  onClick={() => void saveKey()}
                  className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save key'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Choose a realistic avatar and voice that will join your calls.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => goTo(2)} className="rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">
                Skip
              </button>
              <Link href="/avatars" onClick={() => goTo(2)} className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white">
                Open Avatar Studio
              </Link>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Start a live voice call with your avatar — just allow microphone access.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => finish('completed')} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">
                <Check size={12} /> Done
              </button>
              <Link href="/phone" onClick={() => goTo(3)} className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white">
                Start voice call
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
