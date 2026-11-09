import { AVATAR_PERSONAS, getSavedAvatarPersona, type AvatarPersonaId } from '@/components/chat/LiveAvatar'

const VOICE_ENABLED_KEY = 'openagents-voice-enabled'

/**
 * Spoken replies are OFF by default until the user toggles voice mode or Expressive Avatar mode.
 * Prefers configured neural TTS (Fish Audio 2.0 / ElevenLabs) and falls back cleanly
 * to persona-tuned Web Speech synthesis when no external neural key is configured.
 */
export function voiceEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(VOICE_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function setVoiceEnabled(on: boolean) {
  try {
    window.localStorage.setItem(VOICE_ENABLED_KEY, on ? '1' : '0')
    window.dispatchEvent(new CustomEvent('openagents:voice-settings-changed'))
  } catch {
    // ignore storage failures
  }
  if (!on) stopSpeaking()
}

/** Strip markdown noise so the speech engine reads clean prose. */
export function speakable(text: string): string {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4500)
}

let currentAudio: HTMLAudioElement | null = null

/**
 * Pull complete sentences off the front of `buffer`. Returns the sentences and
 * the unconsumed remainder. With `flush`, the remainder is emitted too.
 * Very short fragments are merged into the next sentence to cut TTS round-trips.
 */
export function takeSentences(buffer: string, flush = false): { sentences: string[]; rest: string } {
  const sentences: string[] = []
  let rest = buffer
  const re = /^([\s\S]*?[.!?…](?:["')\]]*)(?=\s)|[\s\S]*?\n{1,})/
  let pending = ''
  for (;;) {
    const m = rest.match(re)
    if (!m || !m[0].trim()) break
    rest = rest.slice(m[0].length)
    pending = `${pending} ${m[0]}`.trim()
    if (pending.length >= 24) {
      sentences.push(pending)
      pending = ''
    }
  }
  rest = pending ? `${pending} ${rest}` : rest
  if (flush && rest.trim()) {
    sentences.push(rest.trim())
    rest = ''
  }
  return { sentences, rest }
}

/** Synthesize one chunk with the user's neural voice; returns a playable data URL, or null if unconfigured. */
export async function synthesize(
  text: string,
  opts?: { voiceId?: string; provider?: string },
): Promise<string | null> {
  const clean = speakable(text)
  if (!clean) return null
  try {
    const { sdk } = await import('@/stores/auth')
    const tts = await sdk.life.tts(clean, opts)
    if (!tts?.audioBase64) return null
    return `data:${tts.mimeType};base64,${tts.audioBase64}`
  } catch {
    return null
  }
}

/**
 * Persona-tuned Web Speech synthesis fallback when neural TTS is not configured.
 */
export function speakWithBrowserPersona(
  text: string,
  personaId?: AvatarPersonaId,
  callbacks?: { onStart?: () => void; onEnd?: () => void; onError?: (err: unknown) => void },
): Promise<boolean> {
  return new Promise((resolve) => {
    const clean = speakable(text)
    if (!clean || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve(false)
      return
    }
    try {
      window.speechSynthesis.cancel()
      const persona = AVATAR_PERSONAS[personaId ?? getSavedAvatarPersona()] ?? AVATAR_PERSONAS.nova
      const utter = new SpeechSynthesisUtterance(clean)
      utter.pitch = persona.pitch
      utter.rate = persona.rate
      const voices = window.speechSynthesis.getVoices()
      const preferred =
        voices.find((v) => /natural|neural|online|aria|jenny|guy|samantha|google us english/i.test(v.name)) ??
        voices.find((v) => v.lang.toLowerCase().startsWith('en'))
      if (preferred) utter.voice = preferred
      utter.onstart = () => callbacks?.onStart?.()
      utter.onend = () => {
        callbacks?.onEnd?.()
        resolve(true)
      }
      utter.onerror = (e) => {
        callbacks?.onError?.(e)
        resolve(false)
      }
      window.speechSynthesis.speak(utter)
    } catch (err) {
      callbacks?.onError?.(err)
      resolve(false)
    }
  })
}

/**
 * Speak via configured neural TTS (Fish Audio 2.0 / ElevenLabs), with seamless
 * fallback to persona-tuned browser voice so Expressive Avatar voice works out-of-the-box.
 */
export async function speak(
  text: string,
  callbacks?: {
    onStart?: () => void
    onEnd?: () => void
    onError?: (err: unknown) => void
    voiceId?: string
    provider?: string
  },
): Promise<boolean> {
  const clean = speakable(text)
  if (!clean || typeof window === 'undefined') return false

  try {
    const dataUrl = await synthesize(clean, {
      voiceId: callbacks?.voiceId,
      provider: callbacks?.provider,
    })
    if (dataUrl) {
      stopSpeaking()
      const audio = new Audio(dataUrl)
      currentAudio = audio
      callbacks?.onStart?.()
      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null
        callbacks?.onEnd?.()
      }
      audio.onerror = (e) => {
        if (currentAudio === audio) currentAudio = null
        callbacks?.onError?.(e)
      }
      await audio.play()
      return true
    }
  } catch {
    // Fall through to persona browser voice
  }

  return speakWithBrowserPersona(clean, getSavedAvatarPersona(), callbacks)
}

export function stopSpeaking() {
  if (typeof window === 'undefined') return
  if (currentAudio) {
    try {
      currentAudio.pause()
    } catch {
      // ignore
    }
    currentAudio = null
  }
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
  }
}

export function isSpeaking(): boolean {
  if (currentAudio !== null && !currentAudio.paused) return true
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
    return true
  }
  return false
}
