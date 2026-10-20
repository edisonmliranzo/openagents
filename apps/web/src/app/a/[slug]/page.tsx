'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Bot, Send, Sparkles } from 'lucide-react'

interface PublicAgentInfo {
  slug: string
  name: string
  avatar: string
  description: string
  greeting: string
}

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export default function PublicAgentChatPage() {
  const params = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const slug = params?.slug ?? ''
  const isEmbed = searchParams?.get('embed') === '1'
  const embedOrigin = searchParams?.get('origin') ?? ''

  const [agent, setAgent] = useState<PublicAgentInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetch(`/api/v1/public/agents/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.message || 'Agent not found or unpublished')
        }
        return res.json()
      })
      .then((info: PublicAgentInfo) => {
        setAgent(info)
        if (info.greeting) {
          setMessages([{ role: 'assistant', content: info.greeting }])
        }
      })
      .catch((err: Error) => setError(err.message))
  }, [slug])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || sending || !slug) return
    const nextHistory = [...messages, { role: 'user' as const, content: trimmed }]
    setMessages(nextHistory)
    setInput('')
    setSending(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (embedOrigin) headers['x-embed-origin'] = embedOrigin
      const res = await fetch(
        `/api/v1/public/agents/${encodeURIComponent(slug)}/chat${isEmbed ? '?embed=1' : ''}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: trimmed,
            history: messages.slice(-10),
          }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || 'Request failed')
      }
      setMessages([...nextHistory, { role: 'assistant', content: data.reply || '(no response)' }])
    } catch (err: any) {
      setMessages([
        ...nextHistory,
        { role: 'assistant', content: `Error: ${err?.message || 'Unable to respond right now.'}` },
      ])
    } finally {
      setSending(false)
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-200">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-center">
          <Bot className="mx-auto mb-3 h-10 w-10 text-rose-400" />
          <h1 className="text-lg font-semibold">Agent Unavailable</h1>
          <p className="mt-1 text-sm text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-lg font-semibold text-emerald-300">
            {agent?.avatar || '🤖'}
          </div>
          <div>
            <h1 className="text-sm font-semibold">{agent?.name || 'Loading...'}</h1>
            {agent?.description && <p className="text-xs text-slate-400 line-clamp-1">{agent.description}</p>}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
          <Sparkles className="h-3 w-3 text-emerald-400" /> Powered by OpenAgents
        </span>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-800 bg-slate-900 text-slate-100'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs text-slate-400">
              Thinking…
            </div>
          </div>
        )}
      </main>

      <form onSubmit={handleSend} className="border-t border-slate-800 bg-slate-900/70 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            maxLength={2000}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
