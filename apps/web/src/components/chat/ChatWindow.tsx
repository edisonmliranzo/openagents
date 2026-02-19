'use client'

import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat'
import { MessageBubble } from './MessageBubble'
import { Send } from 'lucide-react'

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
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400">
              {gatewayConnected
                ? activeConversationId
                  ? 'Send a message to start chatting.'
                  : 'Create a new session to start chatting.'
                : 'Connect to the gateway to start chatting...'}
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-[760px] space-y-4 py-2">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={!gatewayConnected || isStreaming}
            rows={1}
            placeholder={
              gatewayConnected
                ? 'Type a message...'
                : 'Connect to the gateway to start chatting...'
            }
            className="max-h-44 min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-red-200 focus:bg-white focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:text-slate-400"
          />

          <button
            type="button"
            onClick={() => void onNewSession()}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 transition hover:bg-slate-50"
          >
            New session
          </button>

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || !gatewayConnected || isStreaming}
            className="flex h-11 min-w-[84px] items-center justify-center gap-2 rounded-xl bg-red-400 px-4 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
