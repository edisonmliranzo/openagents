'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Volume2, VolumeX } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import {
  claimChatReader,
  getVoiceLevel,
  onPlaybackChange,
  setVoiceEnabled,
  SpeechQueue,
  stopSpeaking,
  takeSentences,
  voiceEnabled,
} from '@/lib/voice'
import { AVATAR_PERSONAS, getSavedAvatarPersona } from '@/components/chat/LiveAvatar'
import { useAvatars } from '@/components/avatar/RealisticAvatar'

const POS_KEY = 'openagents-floating-avatar-pos'
const SIZE = 72

/**
 * Small draggable bubble showing the active avatar (or preset portrait). When voice is
 * enabled it reads each finished agent reply aloud in the avatar's voice, with the
 * bubble pulsing to the live audio level. The mute button toggles spoken replies.
 */
export function FloatingChatAvatar() {
  const { active } = useAvatars()
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const [enabled, setEnabled] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [presetSrc, setPresetSrc] = useState<string>(AVATAR_PERSONAS.nova.portraitSrc)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const queueRef = useRef<SpeechQueue | null>(null)
  const spokenRef = useRef<string | null>(null)
  const wasStreamingRef = useRef(false)
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)

  // Take over reading chat replies from the store while mounted (so it uses the avatar's voice).
  useEffect(() => claimChatReader(), [])

  useEffect(() => {
    const sync = () => setEnabled(voiceEnabled())
    sync()
    const persona = AVATAR_PERSONAS[getSavedAvatarPersona()] ?? AVATAR_PERSONAS.nova
    setPresetSrc(persona.portraitSrc)
    window.addEventListener('openagents:voice-settings-changed', sync)
    try {
      const saved = JSON.parse(window.localStorage.getItem(POS_KEY) || 'null')
      if (saved && typeof saved.x === 'number') setPos(clamp(saved))
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener('openagents:voice-settings-changed', sync)
      queueRef.current?.stop()
    }
  }, [])

  useEffect(() => onPlaybackChange(setPlaying), [])

  // Audio-reactive pulse ring
  useEffect(() => {
    if (!playing) {
      if (ringRef.current) ringRef.current.style.transform = 'scale(1)'
      return
    }
    let raf = 0
    let smooth = 0
    const tick = () => {
      smooth = smooth * 0.7 + getVoiceLevel() * 0.3
      if (ringRef.current) ringRef.current.style.transform = `scale(${(1.04 + smooth * 0.22).toFixed(3)})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // Read finished agent replies aloud
  useEffect(() => {
    const finished = wasStreamingRef.current && !isStreaming
    wasStreamingRef.current = isStreaming
    const last = [...messages].reverse().find((m) => m.role === 'agent')
    if (!finished) {
      // Don't read history when the conversation loads; only new replies.
      if (!isStreaming && last && spokenRef.current === null) spokenRef.current = last.id
      return
    }
    if (!last || last.status === 'error' || spokenRef.current === last.id) return
    spokenRef.current = last.id
    if (!voiceEnabled()) return
    queueRef.current?.stop()
    const q = new SpeechQueue({ voiceId: active?.voiceId || undefined, provider: active?.voiceProvider || undefined })
    queueRef.current = q
    takeSentences(String(last.content || ''), true).sentences.forEach((s) => q.enqueue(s))
    q.end()
  }, [messages, isStreaming, active])

  function toggleMute() {
    const next = !enabled
    if (!next) queueRef.current?.stop()
    setVoiceEnabled(next)
    setEnabled(next)
    if (!next) stopSpeaking()
  }

  function onPointerDown(e: React.PointerEvent) {
    const rect = bubbleRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    d.moved = true
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }))
  }
  function onPointerUp() {
    const d = dragRef.current
    dragRef.current = null
    if (d?.moved && pos) {
      try {
        window.localStorage.setItem(POS_KEY, JSON.stringify(pos))
      } catch {
        /* ignore */
      }
    }
  }

  const src = active?.media?.portrait?.url || presetSrc
  const name = active?.name || 'Avatar'
  const style = pos ? { left: pos.x, top: pos.y } : { right: 24, bottom: 96 }

  return (
    <div
      ref={bubbleRef}
      style={{ ...style, width: SIZE, height: SIZE }}
      className="fixed z-40 touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={`${name} — drag to move`}
    >
      <div
        ref={ringRef}
        className={clsx(
          'absolute inset-0 rounded-full transition-[box-shadow] duration-300',
          playing ? 'shadow-[0_0_0_3px_rgba(244,63,94,0.75),0_0_24px_rgba(244,63,94,0.45)]' : 'shadow-[0_0_0_2px_rgba(255,255,255,0.6),0_8px_24px_rgba(0,0,0,0.25)]',
        )}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name} draggable={false} className="absolute inset-0 h-full w-full cursor-grab rounded-full object-cover active:cursor-grabbing" />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={toggleMute}
        className={clsx(
          'absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-white shadow',
          enabled ? 'bg-emerald-500' : 'bg-slate-500',
        )}
        title={enabled ? 'Mute spoken replies' : 'Read replies aloud'}
        aria-label={enabled ? 'Mute spoken replies' : 'Read replies aloud'}
      >
        {enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
      </button>
    </div>
  )
}

function clamp(p: { x: number; y: number }) {
  if (typeof window === 'undefined') return p
  return {
    x: Math.min(Math.max(8, p.x), window.innerWidth - SIZE - 8),
    y: Math.min(Math.max(8, p.y), window.innerHeight - SIZE - 8),
  }
}

export default FloatingChatAvatar
