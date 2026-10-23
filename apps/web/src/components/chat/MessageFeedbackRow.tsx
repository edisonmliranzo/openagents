'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pin, PinOff, Plus } from 'lucide-react'
import { sdk } from '@/stores/auth'

const REACTION_EMOJI = ['👍', '❤️', '🔥', '💡', '🎯', '✅', '🤔', '⭐']

interface Props {
  messageId: string
  conversationId: string
  role: string
}

/**
 * Emoji reactions and a pin toggle for a message.
 *
 * Counts and the caller's own reactions come from the API, so the row stays
 * correct across reloads and across devices.
 */
export function MessageFeedbackRow({ messageId, conversationId, role }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [mine, setMine] = useState<string[]>([])
  const [pinned, setPinned] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (role === 'user') return
    try {
      const [reactionCounts, pin] = await Promise.all([
        sdk.reactions.counts(messageId),
        sdk.pins.listForConversation(conversationId),
      ])
      setCounts(reactionCounts.counts ?? {})
      setMine(reactionCounts.mine ?? [])
      setPinned(pin.some((p) => p.messageId === messageId))
    } catch {
      // the row is decorative — a failure here must not break the message
    }
  }, [messageId, conversationId, role])

  useEffect(() => {
    void load()
  }, [load])

  const toggleReaction = useCallback(
    async (emoji: string) => {
      if (busy) return
      setBusy(true)
      try {
        const result = await sdk.reactions.toggle({ messageId, conversationId, emoji })
        setCounts(result.counts ?? {})
        setMine((current) =>
          result.active ? [...current.filter((e) => e !== emoji), emoji] : current.filter((e) => e !== emoji),
        )
      } catch {
        // ignore — the reaction is a nice-to-have
      } finally {
        setBusy(false)
      }
    },
    [busy, messageId, conversationId],
  )

  const togglePin = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      if (pinned) {
        const pins = await sdk.pins.listForConversation(conversationId)
        const existing = pins.find((p) => p.messageId === messageId)
        if (existing) await sdk.pins.unpin(existing.id)
        setPinned(false)
      } else {
        await sdk.pins.pin({ messageId, conversationId })
        setPinned(true)
      }
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }, [busy, conversationId, messageId, pinned])

  if (role === 'user') return null

  const visible = REACTION_EMOJI.filter((emoji) => (counts[emoji] ?? 0) > 0)

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1">
      {visible.map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={busy}
          onClick={() => void toggleReaction(emoji)}
          title={mine.includes(emoji) ? 'Remove your reaction' : 'Add reaction'}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition ${
            mine.includes(emoji)
              ? 'border-indigo-400/50 bg-indigo-500/10 text-indigo-300'
              : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
          }`}
        >
          <span>{emoji}</span>
          <span className="tabular-nums">{counts[emoji]}</span>
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          title="Add reaction"
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
        >
          <Plus size={11} />
        </button>
        {pickerOpen && (
          <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-lg border border-white/10 bg-slate-900 p-1 shadow-xl">
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setPickerOpen(false)
                  void toggleReaction(emoji)
                }}
                className="rounded px-1 text-sm transition hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void togglePin()}
        title={pinned ? 'Unpin message' : 'Pin message'}
        className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border transition ${
          pinned
            ? 'border-indigo-400/50 bg-indigo-500/10 text-indigo-300'
            : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
        }`}
      >
        {pinned ? <PinOff size={11} /> : <Pin size={11} />}
      </button>
    </div>
  )
}
