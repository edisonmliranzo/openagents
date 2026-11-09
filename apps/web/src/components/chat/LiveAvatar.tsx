'use client'

import { useEffect, useRef, useState } from 'react'

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
  portraitSrc: string
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
    portraitSrc: '/avatars/presets/nova.jpg',
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
    portraitSrc: '/avatars/presets/atlas.jpg',
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
    portraitSrc: '/avatars/presets/sage.jpg',
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
    portraitSrc: '/avatars/presets/ember.jpg',
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
 * Photorealistic avatar badge & portrait component.
 * Replaces the old 2D SVG cartoon with high-definition realistic studio portraits
 * and audio-reactive harmonic voice rings.
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
  const persona = AVATAR_PERSONAS[personaId] ?? AVATAR_PERSONAS.nova
  const resolvedEmotion: AvatarEmotion =
    emotion ??
    (speaking ? 'speaking' : listening ? 'listening' : thinking ? 'thinking' : 'neutral')

  const [voiceEnergy, setVoiceEnergy] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!speaking) {
      setVoiceEnergy(0)
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
        // Fallback cadence
      }
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      if (analyser && data) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        setVoiceEnergy(Math.min(1, (sum / data.length / 255) * 2.4))
      } else {
        const envelope = Math.max(0.15, Math.sin(t * 3.1) * 0.5 + 0.5)
        const syllable = Math.abs(Math.sin(t * 10.2) * 0.65 + Math.sin(t * 16.8) * 0.35)
        setVoiceEnergy(Math.min(1, syllable * envelope))
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

  const ringScale = speaking ? 1 + voiceEnergy * 0.08 : listening ? 1.03 : 1

  return (
    <div
      className={`relative inline-flex select-none items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size }}
      title={`${persona.name} • ${resolvedEmotion.charAt(0).toUpperCase() + resolvedEmotion.slice(1)}`}
    >
      {showRings && (speaking || listening || resolvedEmotion === 'thinking') && (
        <>
          <span
            className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150"
            style={{
              transform: `scale(${ringScale * 1.18})`,
              background: `radial-gradient(circle, ${persona.glowColor} 0%, transparent 70%)`,
              opacity: speaking ? 0.95 : 0.55,
            }}
          />
          <span
            className={`pointer-events-none absolute inset-0 rounded-full border-2 ${
              listening ? 'animate-ping' : 'animate-pulse'
            }`}
            style={{
              borderColor: persona.primaryColor,
              opacity: 0.45,
            }}
          />
        </>
      )}

      <div
        className="relative z-10 h-full w-full overflow-hidden rounded-full bg-slate-900 shadow-lg transition-transform duration-200"
        style={{
          transform: `scale(${ringScale})`,
          boxShadow: speaking
            ? `0 0 ${Math.round(size * 0.22)}px ${persona.glowColor}`
            : undefined,
          border: `2px solid ${speaking || listening ? persona.primaryColor : 'rgba(255,255,255,0.22)'}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={persona.portraitSrc}
          alt={persona.name}
          className="h-full w-full object-cover object-top transition-transform duration-300"
          style={{
            transform: speaking
              ? `scale(${1.04 + voiceEnergy * 0.03}) translateY(${-voiceEnergy * 1.2}%)`
              : 'scale(1.02)',
          }}
        />
      </div>
    </div>
  )
}

export default LiveAvatar
