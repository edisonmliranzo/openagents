'use client'

import { useEffect, useId, useRef, useState } from 'react'

export type AvatarPersonaId = 'nova' | 'atlas' | 'sage' | 'ember'
export type AvatarEmotion =
  | 'neutral'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'empathetic'
  | 'focused'
  | 'surprised'

export interface AvatarPersonaConfig {
  id: AvatarPersonaId
  name: string
  tagline: string
  voiceStyle: string
  primaryColor: string
  secondaryColor: string
  glowColor: string
  eyeColor: string
  pitch: number
  rate: number
}

export const AVATAR_PERSONAS: Record<AvatarPersonaId, AvatarPersonaConfig> = {
  nova: {
    id: 'nova',
    name: 'Nova',
    tagline: 'Warm, expressive & creative',
    voiceStyle: 'Natural conversational warmth',
    primaryColor: '#f43f5e',
    secondaryColor: '#f59e0b',
    glowColor: 'rgba(244, 63, 94, 0.45)',
    eyeColor: '#fda4af',
    pitch: 1.08,
    rate: 1.02,
  },
  atlas: {
    id: 'atlas',
    name: 'Atlas',
    tagline: 'Direct, analytical & fast',
    voiceStyle: 'Crisp executive clarity',
    primaryColor: '#10b981',
    secondaryColor: '#06b6d4',
    glowColor: 'rgba(16, 185, 129, 0.45)',
    eyeColor: '#6ee7b7',
    pitch: 0.94,
    rate: 1.05,
  },
  sage: {
    id: 'sage',
    name: 'Sage',
    tagline: 'Calm, thoughtful & deep',
    voiceStyle: 'Measured, reflective cadence',
    primaryColor: '#8b5cf6',
    secondaryColor: '#38bdf8',
    glowColor: 'rgba(139, 92, 246, 0.45)',
    eyeColor: '#c4b5fd',
    pitch: 1.0,
    rate: 0.97,
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    tagline: 'Energetic, proactive & bold',
    voiceStyle: 'Upbeat, high-momentum',
    primaryColor: '#f97316',
    secondaryColor: '#eab308',
    glowColor: 'rgba(249, 115, 22, 0.45)',
    eyeColor: '#fdba74',
    pitch: 1.12,
    rate: 1.06,
  },
}

const PERSONA_STORAGE_KEY = 'openagents-avatar-persona'

export function getSavedAvatarPersona(): AvatarPersonaId {
  if (typeof window === 'undefined') return 'nova'
  try {
    const raw = window.localStorage.getItem(PERSONA_STORAGE_KEY) as AvatarPersonaId | null
    if (raw && raw in AVATAR_PERSONAS) return raw
  } catch {
    // ignore
  }
  return 'nova'
}

export function setSavedAvatarPersona(id: AvatarPersonaId) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PERSONA_STORAGE_KEY, id)
    window.dispatchEvent(new CustomEvent('openagents:avatar-persona-changed', { detail: id }))
  } catch {
    // ignore
  }
}

export function inferAvatarEmotion(
  text: string | undefined,
  state?: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking',
): AvatarEmotion {
  if (state === 'listening' || state === 'transcribing') return 'listening'
  if (state === 'thinking') return 'thinking'
  const sample = (text ?? '').toLowerCase()
  if (sample) {
    if (/(congrat|awesome|great|excellent|happy|glad|love|wonderful|celebrat|success|done!|🎉|✨)/.test(sample)) {
      return 'happy'
    }
    if (/(sorry|understand|careful|help you through|don't worry|here for you|empath|apolog)/.test(sample)) {
      return 'empathetic'
    }
    if (/(wow|surpris|unexpected|incredible|whoa|breaking|alert|wait—)/.test(sample)) {
      return 'surprised'
    }
    if (/(analyz|step 1|benchmark|code|architecture|calculat|verify|security|audit|deploy)/.test(sample)) {
      return 'focused'
    }
  }
  if (state === 'speaking') return 'speaking'
  return 'neutral'
}

export interface LiveAvatarProps {
  speaking?: boolean
  listening?: boolean
  thinking?: boolean
  emotion?: AvatarEmotion
  personaId?: AvatarPersonaId
  size?: number
  audioElement?: HTMLAudioElement | null
  showRings?: boolean
  className?: string
}

/**
 * Expressive animated SVG avatar for OpenAgents.
 * Features 60fps audio-reactive viseme lip-sync, dynamic eyebrows, pupil gaze tracking,
 * natural blinking, breathing/head-tilt motion, and persona-colored harmonic voice rings.
 */
export function LiveAvatar({
  speaking = false,
  listening = false,
  thinking = false,
  emotion,
  personaId = 'nova',
  size = 44,
  audioElement,
  showRings = true,
  className = '',
}: LiveAvatarProps) {
  const uid = useId().replace(/:/g, '')
  const persona = AVATAR_PERSONAS[personaId] ?? AVATAR_PERSONAS.nova
  const resolvedEmotion: AvatarEmotion =
    emotion ??
    (speaking ? 'speaking' : listening ? 'listening' : thinking ? 'thinking' : 'neutral')

  const [mouthOpen, setMouthOpen] = useState(0)
  const [mouthWidth, setMouthWidth] = useState(0.5)
  const [blinking, setBlinking] = useState(false)
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [headTilt, setHeadTilt] = useState(0)
  const rafRef = useRef<number | null>(null)

  // Natural blinking
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinking(true)
      setTimeout(() => setBlinking(false), 130)
    }, 3400)
    return () => clearInterval(blinkInterval)
  }, [])

  // Subtle gaze & head movement based on emotional state
  useEffect(() => {
    if (resolvedEmotion === 'thinking') {
      setGaze({ x: 2.2, y: -2.0 })
      setHeadTilt(-4)
      return
    }
    if (resolvedEmotion === 'listening') {
      setGaze({ x: 0, y: -0.5 })
      setHeadTilt(2.5)
      return
    }
    if (resolvedEmotion === 'empathetic') {
      setGaze({ x: -0.6, y: 0.4 })
      setHeadTilt(-3)
      return
    }
    if (resolvedEmotion === 'focused') {
      setGaze({ x: 0, y: 0 })
      setHeadTilt(0)
      return
    }

    const drift = setInterval(() => {
      const gx = (Math.random() - 0.5) * 2.2
      const gy = (Math.random() - 0.5) * 1.4
      const tilt = (Math.random() - 0.5) * 3.5
      setGaze({ x: gx, y: gy })
      setHeadTilt(tilt)
    }, 2600)
    return () => clearInterval(drift)
  }, [resolvedEmotion])

  // Audio-reactive lip-sync + natural speech cadence
  useEffect(() => {
    if (!speaking) {
      setMouthOpen(0)
      setMouthWidth(0.5)
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
        // Fallback to multi-harmonic speech cadence if element is already bound
      }
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      if (analyser && data) {
        analyser.getByteFrequencyData(data)
        let low = 0
        let mid = 0
        for (let i = 0; i < data.length; i++) {
          if (i < data.length / 2) low += data[i]
          else mid += data[i]
        }
        const openVal = Math.min(1, (low / (data.length / 2) / 255) * 2.5)
        const wideVal = Math.min(1, 0.35 + (mid / (data.length / 2) / 255) * 1.6)
        setMouthOpen(openVal)
        setMouthWidth(wideVal)
      } else {
        // Expressive syllable cadence with natural pauses
        const envelope = Math.max(0.12, Math.sin(t * 2.9) * 0.5 + 0.5)
        const syllable = Math.abs(Math.sin(t * 10.5) * 0.62 + Math.sin(t * 17.3) * 0.38)
        const wide = 0.45 + 0.45 * Math.abs(Math.cos(t * 7.4))
        setMouthOpen(Math.min(1, syllable * envelope))
        setMouthWidth(wide)
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

  // Compute eyebrow & eye geometry from emotion
  const browLift =
    resolvedEmotion === 'surprised'
      ? -4.2
      : resolvedEmotion === 'happy' || resolvedEmotion === 'listening'
        ? -2.0
        : resolvedEmotion === 'focused'
          ? 1.6
          : 0

  const browSlant =
    resolvedEmotion === 'focused'
      ? 2.6
      : resolvedEmotion === 'empathetic'
        ? -2.4
        : resolvedEmotion === 'thinking'
          ? 1.5
          : 0

  const eyeScaleY =
    blinking
      ? 0.08
      : resolvedEmotion === 'surprised'
        ? 1.24
        : resolvedEmotion === 'focused'
          ? 0.84
          : 1

  // Mouth path builder (100x100 coordinate space)
  const renderMouth = () => {
    if (speaking || mouthOpen > 0.08) {
      const rx = 8 + mouthWidth * 9
      const ry = 2.5 + mouthOpen * 10.5
      const cy = 66
      return (
        <g>
          <ellipse
            cx="50"
            cy={cy}
            rx={rx}
            ry={ry}
            fill="#090d16"
            stroke={persona.eyeColor}
            strokeWidth="2.2"
          />
          {/* Tongue / inner glow when mouth opens wide */}
          {mouthOpen > 0.35 && (
            <ellipse
              cx="50"
              cy={cy + ry * 0.38}
              rx={rx * 0.58}
              ry={ry * 0.42}
              fill={persona.primaryColor}
              opacity="0.75"
            />
          )}
        </g>
      )
    }

    if (resolvedEmotion === 'happy') {
      return (
        <path
          d="M 37 63 Q 50 75 63 63"
          fill="none"
          stroke={persona.eyeColor}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      )
    }

    if (resolvedEmotion === 'surprised') {
      return (
        <ellipse
          cx="50"
          cy="66"
          rx="6.5"
          ry="7.5"
          fill="#090d16"
          stroke={persona.eyeColor}
          strokeWidth="2.6"
        />
      )
    }

    if (resolvedEmotion === 'thinking') {
      return (
        <path
          d="M 43 66 Q 50 64 58 67"
          fill="none"
          stroke={persona.eyeColor}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )
    }

    if (resolvedEmotion === 'empathetic') {
      return (
        <path
          d="M 39 65 Q 50 70 61 65"
          fill="none"
          stroke={persona.eyeColor}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      )
    }

    if (resolvedEmotion === 'focused') {
      return (
        <path
          d="M 40 66 L 60 66"
          fill="none"
          stroke={persona.eyeColor}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      )
    }

    // Default warm gentle smile
    return (
      <path
        d="M 39 64 Q 50 71 61 64"
        fill="none"
        stroke={persona.eyeColor}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    )
  }

  const ringScale = speaking ? 1 + mouthOpen * 0.14 : listening ? 1.06 : 1

  return (
    <div
      className={`relative inline-flex select-none items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size }}
      title={`${persona.name} • ${resolvedEmotion.charAt(0).toUpperCase() + resolvedEmotion.slice(1)}`}
    >
      {/* Expressive outer voice aura rings */}
      {showRings && (speaking || listening || resolvedEmotion === 'thinking') && (
        <>
          <span
            className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150"
            style={{
              transform: `scale(${ringScale * 1.18})`,
              background: `radial-gradient(circle, ${persona.glowColor} 0%, transparent 70%)`,
              opacity: speaking ? 0.9 : 0.55,
            }}
          />
          <span
            className={`pointer-events-none absolute inset-0 rounded-full border ${
              listening ? 'animate-ping' : 'animate-pulse'
            }`}
            style={{
              borderColor: persona.primaryColor,
              opacity: 0.35,
            }}
          />
        </>
      )}

      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="relative z-10 overflow-visible rounded-full transition-transform duration-300"
        style={{
          transform: `scale(${ringScale})`,
        }}
      >
        <defs>
          <radialGradient id={`bg-${uid}`} cx="50%" cy="32%" r="72%">
            <stop offset="0%" stopColor={persona.primaryColor} stopOpacity="0.48" />
            <stop offset="52%" stopColor={persona.secondaryColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0b101e" stopOpacity="1" />
          </radialGradient>
          <linearGradient id={`rim-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={persona.primaryColor} />
            <stop offset="100%" stopColor={persona.secondaryColor} />
          </linearGradient>
        </defs>

        {/* Avatar Sphere */}
        <circle
          cx="50"
          cy="50"
          r="46"
          fill={`url(#bg-${uid})`}
          stroke={`url(#rim-${uid})`}
          strokeWidth={speaking || listening ? '3' : '2'}
        />

        {/* Ambient cheek glow when happy, empathetic, or speaking */}
        {(resolvedEmotion === 'happy' || resolvedEmotion === 'empathetic' || speaking) && (
          <>
            <ellipse cx="28" cy="57" rx="7" ry="4" fill={persona.primaryColor} opacity="0.28" />
            <ellipse cx="72" cy="57" rx="7" ry="4" fill={persona.primaryColor} opacity="0.28" />
          </>
        )}

        {/* Head tilt group */}
        <g
          style={{
            transform: `rotate(${headTilt}deg)`,
            transformOrigin: '50px 50px',
            transition: 'transform 320ms ease-out',
          }}
        >
          {/* Left Eyebrow */}
          <path
            d={`M 27 ${32 + browLift - browSlant} Q 35 ${28 + browLift} 42 ${32 + browLift + browSlant}`}
            fill="none"
            stroke={persona.eyeColor}
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.9"
          />
          {/* Right Eyebrow */}
          <path
            d={`M 58 ${32 + browLift + browSlant} Q 65 ${28 + browLift} 73 ${32 + browLift - browSlant}`}
            fill="none"
            stroke={persona.eyeColor}
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Eyes */}
          {resolvedEmotion === 'happy' && !blinking ? (
            <>
              <path
                d="M 28 45 Q 35 37 42 45"
                fill="none"
                stroke="#f8fafc"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
              <path
                d="M 58 45 Q 65 37 72 45"
                fill="none"
                stroke="#f8fafc"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              {/* Left Eye */}
              <g transform={`translate(${35 + gaze.x}, ${44 + gaze.y}) scale(1, ${eyeScaleY})`}>
                <ellipse cx="0" cy="0" rx="5.6" ry="6.4" fill="#f8fafc" />
                <circle cx={gaze.x * 0.35} cy={gaze.y * 0.35} r="3.1" fill="#0f172a" />
                <circle cx={-1.6 + gaze.x * 0.2} cy={-2.0 + gaze.y * 0.2} r="1.4" fill="#ffffff" />
              </g>
              {/* Right Eye */}
              <g transform={`translate(${65 + gaze.x}, ${44 + gaze.y}) scale(1, ${eyeScaleY})`}>
                <ellipse cx="0" cy="0" rx="5.6" ry="6.4" fill="#f8fafc" />
                <circle cx={gaze.x * 0.35} cy={gaze.y * 0.35} r="3.1" fill="#0f172a" />
                <circle cx={-1.6 + gaze.x * 0.2} cy={-2.0 + gaze.y * 0.2} r="1.4" fill="#ffffff" />
              </g>
            </>
          )}

          {/* Mouth */}
          {renderMouth()}
        </g>
      </svg>
    </div>
  )
}

export default LiveAvatar
