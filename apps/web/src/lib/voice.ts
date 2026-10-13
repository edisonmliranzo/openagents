const VOICE_ENABLED_KEY = 'openagents-voice-enabled'

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
  } catch {
    // ignore storage failures
  }
  if (!on) stopSpeaking()
}

/** Strip markdown noise so the speech engine reads clean prose. */
function speakable(text: string): string {
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

/** Speak via the server's realistic TTS (ElevenLabs / Fish Audio); fall back to the browser voice. */
export async function speak(text: string): Promise<void> {
  const clean = speakable(text)
  if (!clean) return
  if (typeof window === 'undefined') return

  try {
    const { sdk } = await import('@/stores/auth')
    const tts = await sdk.life.tts(clean)
    stopSpeaking()
    const audio = new Audio(`data:${tts.mimeType};base64,${tts.audioBase64}`)
    currentAudio = audio
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null
    }
    await audio.play()
    return
  } catch {
    // No TTS provider configured or request failed — use the browser voice.
  }

  browserSpeak(clean)
}

function browserSpeak(clean: string) {
  if (!('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(clean)
    utter.rate = 1.05
    utter.lang = 'en-US'
    window.speechSynthesis.speak(utter)
  } catch {
    // speech synthesis unavailable or blocked
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
