'use client'

import { useEffect, useRef, useState } from 'react'

interface LiveAvatarProps {
  speaking?: boolean
  listening?: boolean
  size?: number
  audioElement?: HTMLAudioElement | null
}

/**
 * Animated SVG avatar that lip-syncs to playing TTS audio (using Web Audio AnalyserNode
 * when available, or realistic cadence animation while speaking) with natural blinking and idle motion.
 */
export function LiveAvatar({ speaking = false, listening = false, size = 44, audioElement }: LiveAvatarProps) {
  const [mouthOpen, setMouthOpen] = useState(0)
  const [blinking, setBlinking] = useState(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinking(true)
      setTimeout(() => setBlinking(false), 140)
    }, 3600)
    return () => clearInterval(blinkInterval)
  }, [])

  useEffect(() => {
    if (!speaking) {
      setMouthOpen(0)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    let ctx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let data: Uint8Array<ArrayBuffer> | null = null

    if (audioElement && typeof window !== 'undefined' && 'AudioContext' in window) {
      try {
        ctx = new AudioContext()
        const src = ctx.createMediaElementSource(audioElement)
        analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        src.connect(analyser)
        analyser.connect(ctx.destination)
        data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      } catch {
        // Element may already be connected or CORS-restricted; fall back to cadence animation
      }
    }

    const start = performance.now()
    const tick = (now: number) => {
      if (analyser && data) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / data.length / 255
        setMouthOpen(Math.min(1, avg * 2.4))
      } else {
        const t = (now - start) / 1000
        const wave = Math.abs(Math.sin(t * 9.5) * 0.65 + Math.sin(t * 15.2) * 0.35)
        setMouthOpen(wave)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (ctx && ctx.state !== 'closed') {
        void ctx.close().catch(() => undefined)
      }
    }
  }, [speaking, audioElement])

  const mouthHeight = 2 + Math.round(mouthOpen * 9)
  const mouthY = 28 - Math.floor(mouthHeight / 2)

  return (
    <div
      className="relative inline-flex items-center justify-center rounded-full"
      style={{ width: size, height: size }}
      title={speaking ? 'Speaking…' : listening ? 'Listening…' : 'OpenAgents Voice Avatar'}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 44 44"
        className={`rounded-full transition-transform duration-300 ${
          speaking ? 'scale-105 ring-2 ring-emerald-400/70' : listening ? 'ring-2 ring-sky-400/70' : ''
        }`}
      >
        <defs>
          <radialGradient id="oaAvatarBg" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor={listening ? '#0ea5e9' : '#10b981'} stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="1" />
          </radialGradient>
        </defs>
        <circle cx="22" cy="22" r="21" fill="url(#oaAvatarBg)" stroke="#334155" strokeWidth="1.5" />
        {/* Eyes */}
        <ellipse cx="15.5" cy="18" rx="2.1" ry={blinking ? 0.3 : 2.4} fill="#e2e8f0" />
        <ellipse cx="28.5" cy="18" rx="2.1" ry={blinking ? 0.3 : 2.4} fill="#e2e8f0" />
        {/* Mouth */}
        <rect
          x="16"
          y={mouthY}
          width="12"
          height={mouthHeight}
          rx={mouthHeight / 2}
          fill={speaking ? '#34d399' : '#94a3b8'}
        />
      </svg>
    </div>
  )
}

export default LiveAvatar
