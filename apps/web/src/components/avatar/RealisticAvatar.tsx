'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { sdk } from '@/stores/auth'

export type AvatarSlot = 'portrait' | 'idle' | 'listening' | 'thinking' | 'talking' | 'talking_alt'
export type AvatarCallState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface AvatarJob {
  jobId?: string
  status: string
  error?: string
  model?: string
  progress?: number
}

export interface RealisticAvatarRecord {
  id: string
  name: string
  description: string
  media: Partial<Record<AvatarSlot, { url: string; mime: string }>>
  jobs: Partial<Record<AvatarSlot, AvatarJob>>
  voiceProvider: string | null
  voiceId: string | null
  isActive: boolean
  createdAt: string
}

/** Loads the user's avatars and exposes the active one (signed URLs refresh every few hours). */
export function useAvatars() {
  const [avatars, setAvatars] = useState<RealisticAvatarRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const list = await sdk.client.get<RealisticAvatarRecord[]>('/api/v1/avatars')
      setAvatars(Array.isArray(list) ? list : [])
    } catch {
      setAvatars([])
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 4 * 60 * 60 * 1000)
    return () => clearInterval(t)
  }, [refresh])

  const active = avatars.find((a) => a.isActive) ?? null
  return { avatars, active, loaded, refresh, setAvatars }
}

export function avatarHasVideo(a: RealisticAvatarRecord | null | undefined) {
  return Boolean(a?.media?.idle || a?.media?.talking)
}

function pickSlot(
  media: RealisticAvatarRecord['media'],
  state: AvatarCallState,
  useAltTalk: boolean,
): AvatarSlot | null {
  const order: AvatarSlot[] =
    state === 'speaking'
      ? useAltTalk
        ? ['talking_alt', 'talking', 'idle']
        : ['talking', 'talking_alt', 'idle']
      : state === 'listening'
        ? ['listening', 'idle']
        : state === 'thinking'
          ? ['thinking', 'idle']
          : ['idle', 'listening']
  return order.find((s) => media[s]) ?? null
}

interface RealisticAvatarProps {
  avatar: RealisticAvatarRecord
  state: AvatarCallState
  className?: string
  /** Show the live status ring / caption. */
  showStatus?: boolean
}

/**
 * Realistic video avatar: plays pre-generated multi-angle clips (idle / listening /
 * thinking / talking A+B) and cross-fades between them in sync with the call state.
 * Falls back to an animated portrait when no clips exist yet.
 */
export function RealisticAvatar({ avatar, state, className, showStatus = true }: RealisticAvatarProps) {
  const videoA = useRef<HTMLVideoElement>(null)
  const videoB = useRef<HTMLVideoElement>(null)
  const [front, setFront] = useState<'a' | 'b'>('a')
  const [currentSlot, setCurrentSlot] = useState<AvatarSlot | null>(null)
  const altTalkRef = useRef(false)
  const lastStateRef = useRef<AvatarCallState>('idle')

  useEffect(() => {
    // Alternate the talking camera angle on every new speaking turn.
    if (state === 'speaking' && lastStateRef.current !== 'speaking') {
      altTalkRef.current = !altTalkRef.current
    }
    lastStateRef.current = state

    const slot = pickSlot(avatar.media, state, altTalkRef.current)
    if (!slot || slot === currentSlot) return
    const src = avatar.media[slot]?.url
    if (!src) return

    const nextIsA = front === 'b'
    const target = nextIsA ? videoA.current : videoB.current
    if (!target) return
    target.src = src
    target.currentTime = 0
    const swap = () => {
      setFront(nextIsA ? 'a' : 'b')
      setCurrentSlot(slot)
    }
    target.oncanplay = () => {
      target.oncanplay = null
      void target.play().catch(() => {})
      swap()
    }
    target.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, avatar.media])

  const hasVideo = avatarHasVideo(avatar)
  const portrait = avatar.media.portrait?.url

  const ring =
    state === 'speaking'
      ? 'ring-rose-400/80'
      : state === 'listening'
        ? 'ring-emerald-400/80'
        : state === 'thinking'
          ? 'ring-amber-400/80'
          : 'ring-white/20'

  return (
    <div
      className={clsx(
        'relative aspect-[9/16] w-full overflow-hidden rounded-[28px] bg-slate-900 shadow-2xl ring-4 transition-[box-shadow,ring-color] duration-300',
        ring,
        className,
      )}
    >
      {hasVideo ? (
        <>
          {(['a', 'b'] as const).map((layer) => (
            <video
              key={layer}
              ref={layer === 'a' ? videoA : videoB}
              muted
              loop
              playsInline
              autoPlay
              preload="auto"
              className={clsx(
                'absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out',
                front === layer ? 'opacity-100' : 'opacity-0',
              )}
            />
          ))}
        </>
      ) : portrait ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={portrait}
          alt={avatar.name}
          className={clsx(
            'absolute inset-0 h-full w-full object-cover',
            state === 'speaking' ? 'animate-[oaTalk_0.9s_ease-in-out_infinite]' : 'animate-[oaBreathe_6s_ease-in-out_infinite]',
          )}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl font-black text-white/70">
          {avatar.name.slice(0, 1).toUpperCase()}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {showStatus && (
        <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 text-white">
          <span className="text-lg font-semibold drop-shadow">{avatar.name}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-[11px] font-medium backdrop-blur">
            <span
              className={clsx(
                'h-1.5 w-1.5 rounded-full',
                state === 'speaking' ? 'bg-rose-400 animate-pulse' : state === 'listening' ? 'bg-emerald-400 animate-pulse' : state === 'thinking' ? 'bg-amber-400 animate-pulse' : 'bg-white/60',
              )}
            />
            {state === 'speaking' ? 'Speaking' : state === 'listening' ? 'Listening' : state === 'thinking' ? 'Thinking' : 'Ready'}
          </span>
        </div>
      )}

      <style jsx global>{`
        @keyframes oaBreathe {
          0%, 100% { transform: scale(1.02); }
          50% { transform: scale(1.045); }
        }
        @keyframes oaTalk {
          0%, 100% { transform: scale(1.04) translateY(0); }
          50% { transform: scale(1.05) translateY(-0.6%); }
        }
      `}</style>
    </div>
  )
}

export default RealisticAvatar
