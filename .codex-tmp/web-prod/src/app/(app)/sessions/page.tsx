'use client'

import Link from 'next/link'
import { sdk } from '@/stores/auth'
import type { SessionPatchInput, SessionRow, SessionsListResult } from '@openagents/shared'
import { useCallback, useEffect, useState } from 'react'

const DEFAULT_LIMIT = '120'
const THINK_LEVELS = ['', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
const BINARY_THINK_LEVELS = ['', 'off', 'on'] as const
const VERBOSE_LEVELS = [
  { value: '', label: 'inherit' },
  { value: 'off', label: 'off (explicit)' },
  { value: 'on', label: 'on' },
  { value: 'full', label: 'full' },
] as const
const REASONING_LEVELS = ['', 'off', 'on', 'stream'] as const

function parsePositiveInt(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

function timeAgo(epochMs: number | null) {
  if (!epochMs) return 'n/a'
  const deltaMs = Date.now() - epochMs
  const deltaMin = Math.max(0, Math.floor(deltaMs / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

function withCurrentOption(options: readonly string[], current: string) {
  if (!current || options.includes(current)) return [...options]
  return [...options, current]
}

function withCurrentLabeledOption(
  options: readonly { value: string; label: string }[],
  current: string,
) {
  if (!current || options.some((option) => option.value === current)) return [...options]
  return [...options, { value: current, label: `${current} (custom)` }]
}

function normalizeProviderId(provider?: string | null) {
  if (!provider) return ''
  const normalized = provider.trim().toLowerCase()
  if (normalized === 'z.ai' || normalized === 'z-ai') return 'zai'
  return normalized
}

function isBinaryThinkingProvider(provider?: string | null) {
  return normalizeProviderId(provider) === 'zai'
}

function resolveThinkingLevelOptions(provider?: string | null) {
  return isBinaryThinkingProvider(provider) ? BINARY_THINK_LEVELS : THINK_LEVELS
}

function resolveThinkingLevelDisplay(value: string, binary: boolean) {
  if (!binary) return value
  if (!value || value === 'off') return value
  return 'on'
}

function resolveThinkingPatchValue(value: string, binary: boolean) {
  if (!value) return null
  if (!binary) return value
  if (value === 'on') return 'low'
  return value
}

function formatTokens(row: SessionRow) {
  const total = row.totalTokens ?? 0
  return `${total} / 200000`
}

export default function SessionsPage() {
  const [result, setResult] = useState<SessionsListResult | null>(null)
  const [activeWithinMinutes, setActiveWithinMinutes] = useState('')
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [includeGlobal, setIncludeGlobal] = useState(true)
  const [includeUnknown, setIncludeUnknown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [busySessionId, setBusySessionId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const next = await sdk.sessions.list({
        activeMinutes: parsePositiveInt(activeWithinMinutes),
        limit: parsePositiveInt(limit),
        includeGlobal,
        includeUnknown,
      })
      setResult(next)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load sessions')
    } finally {
      setIsLoading(false)
    }
  }, [activeWithinMinutes, limit, includeGlobal, includeUnknown])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function patchSession(sessionId: string, patch: SessionPatchInput) {
    if (!sessionId || sessionId.startsWith('__')) return
    setBusySessionId(sessionId)
    setError('')
    try {
      await sdk.sessions.patch(sessionId, patch)
      await loadSessions()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update session')
    } finally {
      setBusySessionId(null)
    }
  }

  async function handleDeleteSession(row: SessionRow) {
    if (row.kind !== 'direct' || !row.id || row.id.startsWith('__')) return
    const confirmed = window.confirm(
      `Delete session "${row.key}"?\n\nDeletes the session entry and conversation transcript.`,
    )
    if (!confirmed) return

    setBusySessionId(row.id)
    setError('')
    try {
      await sdk.sessions.delete(row.id)
      await loadSessions()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete session')
    } finally {
      setBusySessionId(null)
    }
  }

  const rows = result?.sessions ?? []

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Sessions</h1>
        <p className="mt-1 text-sm text-slate-500">Inspect active sessions and adjust per-session defaults.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Sessions</h2>
            <p className="text-sm text-slate-500">Active session keys and per-session overrides.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadSessions()}
            disabled={isLoading}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="w-[220px] text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Active within (minutes)</span>
              <input
                value={activeWithinMinutes}
                onChange={(e) => setActiveWithinMinutes(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-red-200 focus:ring-2 focus:ring-red-100"
              />
            </label>

            <label className="w-[165px] text-sm text-slate-600">
              <span className="mb-1 block text-xs font-medium text-slate-500">Limit</span>
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-red-200 focus:ring-2 focus:ring-red-100"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeGlobal}
                onChange={(e) => setIncludeGlobal(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-200"
              />
              Include global
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeUnknown}
                onChange={(e) => setIncludeUnknown(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-200"
              />
              Include unknown
            </label>
          </div>

          <p className="text-sm text-slate-500">Store: {result?.path ?? '(multiple)'}</p>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Tokens</th>
                  <th className="px-4 py-3">Thinking</th>
                  <th className="px-4 py-3">Verbose</th>
                  <th className="px-4 py-3">Reasoning</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                      {isLoading ? 'Loading sessions...' : 'No sessions found.'}
                    </td>
                  </tr>
                )}

                {rows.map((row) => {
                  const rowBusy = isLoading || busySessionId === row.id
                  const canMutate = row.kind === 'direct' && !row.id.startsWith('__')
                  const thinkingRaw = row.thinkingLevel ?? ''
                  const binaryThinking = isBinaryThinkingProvider(row.modelProvider)
                  const thinking = resolveThinkingLevelDisplay(thinkingRaw, binaryThinking)
                  const thinkingOptions = withCurrentOption(
                    resolveThinkingLevelOptions(row.modelProvider),
                    thinking,
                  )
                  const verbose = row.verboseLevel ?? ''
                  const verboseOptions = withCurrentLabeledOption(VERBOSE_LEVELS, verbose)
                  const reasoning = row.reasoningLevel ?? ''
                  const reasoningOptions = withCurrentOption(REASONING_LEVELS, reasoning)
                  const displayName = row.displayName?.trim()
                  const showDisplayName =
                    !!displayName && displayName !== row.key && displayName !== (row.label?.trim() ?? '')

                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3">
                        {canMutate ? (
                          <Link href={`/chat?conversation=${encodeURIComponent(row.id)}`} className="font-mono text-xs font-semibold text-red-600 hover:underline">
                            {row.key}
                          </Link>
                        ) : (
                          <p className="font-mono text-xs font-semibold text-red-600">{row.key}</p>
                        )}
                        {showDisplayName && <p className="mt-1 truncate text-xs text-slate-500">{displayName}</p>}
                      </td>

                      <td className="px-4 py-3">
                        <input
                          defaultValue={row.label ?? ''}
                          disabled={!canMutate || rowBusy}
                          onBlur={(e) => {
                            const value = e.target.value.trim()
                            const current = (row.label ?? '').trim()
                            if (value !== current) {
                              void patchSession(row.id, { label: value || null })
                            }
                          }}
                          placeholder="(optional)"
                          className="h-9 w-[180px] rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-700">{row.kind}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{timeAgo(row.updatedAt)}</td>
                      <td className="px-4 py-4 font-mono text-sm text-slate-700">{formatTokens(row)}</td>

                      <td className="px-4 py-3">
                        <select
                          value={thinking}
                          disabled={!canMutate || rowBusy}
                          onChange={(e) => {
                            void patchSession(row.id, {
                              thinkingLevel: resolveThinkingPatchValue(e.target.value, binaryThinking),
                            })
                          }}
                          className="h-9 rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {thinkingOptions.map((value) => (
                            <option key={value || 'inherit'} value={value}>
                              {value || 'inherit'}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={verbose}
                          disabled={!canMutate || rowBusy}
                          onChange={(e) => {
                            void patchSession(row.id, { verboseLevel: e.target.value || null })
                          }}
                          className="h-9 rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {verboseOptions.map((option) => (
                            <option key={option.value || 'inherit'} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={reasoning}
                          disabled={!canMutate || rowBusy}
                          onChange={(e) => {
                            void patchSession(row.id, { reasoningLevel: e.target.value || null })
                          }}
                          className="h-9 rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 outline-none focus:border-red-200 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {reasoningOptions.map((value) => (
                            <option key={value || 'inherit'} value={value}>
                              {value || 'inherit'}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        {canMutate ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteSession(row)}
                            disabled={rowBusy}
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </section>
    </div>
  )
}
