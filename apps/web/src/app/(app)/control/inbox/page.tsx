'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sdk } from '@/stores/auth'
import type { PlatformInboxSnapshot } from '@openagents/shared'

function timeAgo(isoDate: string) {
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMin = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

export default function InboxPage() {
  const [snapshot, setSnapshot] = useState<PlatformInboxSnapshot | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const result = await sdk.platform.inbox({ limit: 120 })
      setSnapshot(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load inbox')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const threads = useMemo(() => {
    const base = snapshot?.threads ?? []
    if (selectedChannel === 'all') return base
    return base.filter((thread) => thread.channelId === selectedChannel)
  }, [snapshot, selectedChannel])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Omnichannel Inbox</h1>
          <p className="mt-1 text-sm text-slate-500">Unified conversation threads across web and external channels.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedChannel('all')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
              selectedChannel === 'all' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            all ({snapshot?.threads.length ?? 0})
          </button>
          {(snapshot?.channels ?? []).map((channel) => (
            <button
              key={channel.channelId}
              type="button"
              onClick={() => setSelectedChannel(channel.channelId)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                selectedChannel === channel.channelId ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {channel.channelLabel.toLowerCase()} ({channel.threads})
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Channel Status</h2>
          <div className="mt-3 space-y-2">
            {(snapshot?.channels ?? []).map((channel) => (
              <div key={channel.channelId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{channel.channelLabel}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      channel.status === 'enabled'
                        ? 'bg-emerald-100 text-emerald-700'
                        : channel.status === 'planned'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {channel.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{channel.threads} thread(s)</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Threads</h2>
          <div className="mt-3 space-y-2">
            {threads.map((thread) => (
              <Link
                key={thread.conversationId}
                href={`/chat?conversationId=${thread.conversationId}`}
                className="block rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{thread.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {thread.channelLabel} | {thread.sessionLabel ?? 'no-session-label'}
                    </p>
                    {thread.linkedDeviceLabel && (
                      <p className="mt-1 text-xs text-slate-500">device: {thread.linkedDeviceLabel}</p>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">{timeAgo(thread.updatedAt)}</p>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {thread.lastMessagePreview ?? '(no messages yet)'}
                </p>
              </Link>
            ))}
            {threads.length === 0 && (
              <p className="text-sm text-slate-500">{isLoading ? 'Loading threads...' : 'No threads for this channel.'}</p>
            )}
          </div>
        </article>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

