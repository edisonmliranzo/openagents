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
    .slice(0, 1200)
}

/** Speak text aloud; interrupts whatever is currently being spoken. */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const clean = speakable(text)
  if (!clean) return
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
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // ignore
  }
}
