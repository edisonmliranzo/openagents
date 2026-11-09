'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Volume2, VolumeX } from 'lucide-react'
import {
  RealisticAvatar,
  type AvatarCallState,
  type RealisticAvatarRecord,
} from '@/components/avatar/RealisticAvatar'

interface PublicAvatarInfo {
  slug: string
  name: string
  description: string
  greeting: string
  media: RealisticAvatarRecord['media']
  allowVoice: boolean
}

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Slug comes from /p/<slug> (Worker serves this page for any /p/*) or /p?u=<slug>. */
function readSlug(): string {
  if (typeof window === 'undefined') return ''
  const q = new URLSearchParams(window.location.search).get('u')
  if (q) return q.toLowerCase()
  const m = window.location.pathname.match(/^\/p\/([^/]+)/)
  return m ? decodeURIComponent(m[1]).toLowerCase() : ''
}

function PublicAvatarInner() {
  const [slug, setSlug] = useState('')
  const [info, setInfo] = useState<PublicAvatarInfo | null>(null)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [state, setState] = useState<AvatarCallState>('idle')
  const [voiceOn, setVoiceOn] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const s = readSlug()
    setSlug(s)
    if (!s) {
      setError('No avatar specified.')
      return
    }
    fetch(`/api/v1/public/avatars/${encodeURIComponent(s)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data?.message || 'Avatar not found')
        return data as PublicAvatarInfo
      })
      .then((d) => {
        setInfo(d)
        document.title = `Talk to ${d.name} · OpenAgents`
        if (d.greeting) setMessages([{ role: 'assistant', content: d.greeting }])
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sending = state === 'thinking'

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending || !slug) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setState('thinking')
    try {
      const res = await fetch(`/api/v1/public/avatars/${encodeURIComponent(slug)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages.slice(-10), voice: voiceOn }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Unable to respond right now.')
      setMessages([...next, { role: 'assistant', content: data.reply || '(no response)' }])
      if (voiceOn && data.audio?.audioBase64) {
        const audio = new Audio(`data:${data.audio.mimeType || 'audio/mpeg'};base64,${data.audio.audioBase64}`)
        audioRef.current?.pause()
        audioRef.current = audio
        setState('speaking')
        audio.onended = () => setState('idle')
        audio.onerror = () => setState('idle')
        await audio.play().catch(() => setState('idle'))
      } else {
        setState('speaking')
        setTimeout(() => setState('idle'), Math.min(6000, 1200 + String(data.reply || '').length * 35))
      }
    } catch (err: any) {
      setMessages([...next, { role: 'assistant', content: `⚠️ ${err?.message || 'Unable to respond right now.'}` }])
      setState('idle')
    }
  }

  const record: RealisticAvatarRecord | null = info
    ? {
        id: info.slug,
        name: info.name,
        description: info.description,
        media: info.media,
        jobs: {},
        voiceProvider: null,
        voiceId: null,
        isActive: true,
        createdAt: '',
      }
    : null

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-200">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-center">
          <h1 className="text-lg font-semibold">Avatar unavailable</h1>
          <p className="mt-1 text-sm text-slate-400">{error}</p>
          <a href="/register" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">
            <Sparkles className="h-4 w-4" /> Create your own on OpenAgents
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <a href="/" className="text-sm font-semibold tracking-tight">OpenAgents</a>
        <a href="/register" className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500">
          <Sparkles className="h-3.5 w-3.5" /> Create your own on OpenAgents
        </a>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 p-4 md:grid-cols-[360px_1fr] md:p-8">
        <div className="space-y-3">
          {record ? (
            <RealisticAvatar avatar={record} state={state} />
          ) : (
            <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-slate-900" />
          )}
          <div>
            <h1 className="text-xl font-semibold">{info?.name || 'Loading…'}</h1>
            {info?.description && <p className="mt-1 text-sm text-slate-400">{info.description}</p>}
          </div>
        </div>

        <section className="flex h-[70vh] flex-col rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400">
            <span>Chat with {info?.name || 'this avatar'}</span>
            {info?.allowVoice && (
              <button type="button" onClick={() => setVoiceOn((v) => !v)} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 hover:bg-slate-700">
                {voiceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {voiceOn ? 'Voice on' : 'Voice off'}
              </button>
            )}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'user' ? 'bg-rose-600 text-white' : 'border border-slate-800 bg-slate-950 text-slate-100'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-slate-500">{info?.name} is thinking…</div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-slate-800 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${info?.name || ''}…`}
              maxLength={1500}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm placeholder-slate-500 focus:border-rose-500 focus:outline-none"
            />
            <button type="submit" disabled={sending || !input.trim() || !info} className="rounded-xl bg-rose-600 px-4 py-2 text-white hover:bg-rose-500 disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}

export default function PublicAvatarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <PublicAvatarInner />
    </Suspense>
  )
}
