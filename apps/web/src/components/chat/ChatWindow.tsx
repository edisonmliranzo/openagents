'use client'

import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat'
import { MessageBubble } from './MessageBubble'
import { PlusCircle, SendHorizontal, Sparkles } from 'lucide-react'

interface ChatWindowProps {
  gatewayConnected: boolean
  onNewSession: () => Promise<void> | void
}

export function ChatWindow({ gatewayConnected, onNewSession }: ChatWindowProps) {
  const { messages, sendMessage, isStreaming, activeConversationId } = useChatStore()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming || !gatewayConnected) return
    setInput('')
    await sendMessage(text)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white/90 shadow-card backdrop-blur dark:border-slate-800 dark:bg-slate-900/75">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-indigo-500/10 via-cyan-500/5 to-rose-500/10" />

      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-7 text-center dark:border-slate-700 dark:bg-slate-900/70">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-card">
                <Sparkles size={16} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {gatewayConnected
                  ? activeConversationId
                    ? 'Ask OpenAgent anything to begin.'
                    : 'Create a new session to begin.'
                  : 'Connect to the gateway to begin.'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Supports long-form plans, tool actions, and code generation.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[860px] space-y-5 pb-2 pt-1">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="relative border-t border-slate-200/80 bg-white/95 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mb-2 flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-slate-400">
          <p>Enter to send, Shift+Enter for a new line</p>
          <p>{isStreaming ? 'OpenAgent is responding...' : 'Ready'}</p>
        </div>
        <div className="flex items-end gap-2.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={!gatewayConnected || isStreaming}
            rows={1}
            placeholder={
              gatewayConnected
                ? 'Message OpenAgent...'
                : 'Connect to the gateway to start chatting...'
            }
            className="max-h-44 min-h-[50px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-200 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-indigo-500/50 dark:focus:bg-slate-900 dark:focus:ring-indigo-500/30"
          />

          <button
            type="button"
            onClick={() => void onNewSession()}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <PlusCircle size={14} />
            New
          </button>

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || !gatewayConnected || isStreaming}
            className="inline-flex h-11 min-w-[92px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
            <SendHorizontal size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
