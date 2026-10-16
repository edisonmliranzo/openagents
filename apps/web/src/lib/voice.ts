const VOICE_ENABLED_KEY = 'openagents-voice-enabled'

/**
 * Spoken replies are strictly OFF by default.
 * Users must explicitly configure Fish Audio 2.0 (or ElevenLabs) in Settings -> Voice
 * and enable spoken replies. Never falls back to robotic browser speechSynthesis.
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
 * Speak exclusively via configured neural TTS (Fish Audio 2.0 / ElevenLabs).
 * Never falls back to robotic browser speechSynthesis.
 */
export async function speak(
  text: string,
  callbacks?: { onStart?: () => void; onEnd?: () => void; onError?: (err: unknown) => void },
): Promise<boolean> {
  const clean = speakable(text)
  if (!clean || typeof window === 'undefined') return false

  try {
    const { sdk } = await import('@/stores/auth')
    const tts = await sdk.life.tts(clean)
    stopSpeaking()
    const audio = new Audio(`data:${tts.mimeType};base64,${tts.audioBase64}`)
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
  } catch (err) {
    callbacks?.onError?.(err)
    return false
  }
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
