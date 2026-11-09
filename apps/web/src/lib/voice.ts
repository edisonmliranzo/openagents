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
      utter.onstart = () => {
        setPlayback(true)
        callbacks?.onStart?.()
      }
      utter.onend = () => {
        setPlayback(false)
        callbacks?.onEnd?.()
        resolve(true)
      }
      utter.onerror = (e) => {
        setPlayback(false)
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
      callbacks?.onStart?.()
      const { done } = playAudioUrl(dataUrl)
      void done.then(() => callbacks?.onEnd?.())
      return true
    }
  } catch {
    // Fall through to persona browser voice
  }

  return speakWithBrowserPersona(clean, getSavedAvatarPersona(), callbacks)
}

export function stopSpeaking() {
  if (typeof window === 'undefined') return
  setPlayback(false)
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

// ── Playback state + audio level (drives avatar lip-sync) ──

export type PlaybackListener = (playing: boolean) => void
const playbackListeners = new Set<PlaybackListener>()
let playbackActive = false

/** Subscribe to "audio is actually playing" transitions. Returns an unsubscribe fn. */
export function onPlaybackChange(listener: PlaybackListener): () => void {
  playbackListeners.add(listener)
  listener(playbackActive)
  return () => {
    playbackListeners.delete(listener)
  }
}

function setPlayback(on: boolean) {
  if (playbackActive === on) return
  playbackActive = on
  playbackListeners.forEach((l) => {
    try {
      l(on)
    } catch {
      /* ignore */
    }
  })
}

export function isPlaybackActive() {
  return playbackActive
}

let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let levelBuf: Uint8Array | null = null
const connectedEls = new WeakSet<HTMLAudioElement>()

function attachAnalyser(audio: HTMLAudioElement) {
  try {
    if (typeof window === 'undefined') return
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return
    if (!audioCtx) {
      audioCtx = new Ctor() as AudioContext
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      analyser.connect(audioCtx.destination)
      levelBuf = new Uint8Array(analyser.fftSize)
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
    if (connectedEls.has(audio) || !analyser) return
    const src = audioCtx.createMediaElementSource(audio)
    src.connect(analyser)
    connectedEls.add(audio)
  } catch {
    // Analyser is optional; audio still plays through the element.
  }
}

/** Current speech loudness 0..1 (RMS of the playing neural audio). 0 when idle/unavailable. */
export function getVoiceLevel(): number {
  if (!analyser || !levelBuf || !playbackActive) return 0
  analyser.getByteTimeDomainData(levelBuf as Uint8Array<ArrayBuffer>)
  let sum = 0
  for (let i = 0; i < levelBuf.length; i++) {
    const v = (levelBuf[i] - 128) / 128
    sum += v * v
  }
  return Math.min(1, Math.sqrt(sum / levelBuf.length) * 3.2)
}

/** Play a data URL through the shared audio path (analyser + playback events). Resolves when it ends. */
export function playAudioUrl(url: string): { done: Promise<void>; audio: HTMLAudioElement } {
  stopSpeaking()
  const audio = new Audio(url)
  currentAudio = audio
  attachAnalyser(audio)
  const done = new Promise<void>((resolve) => {
    const finish = () => {
      if (currentAudio === audio) {
        currentAudio = null
        setPlayback(false)
      }
      resolve()
    }
    audio.onplaying = () => setPlayback(true)
    audio.onended = finish
    audio.onerror = finish
    audio.onpause = () => {
      if (!audio.ended) finish()
    }
    audio.play().catch(finish)
  })
  return { done, audio }
}

/**
 * Sentence-level TTS queue: enqueue sentences as they stream in; audio for the next
 * sentence is pre-fetched while the current one plays. Falls back to browser speech.
 */
export class SpeechQueue {
  private items: Array<{ text: string; audio: Promise<string | null> }> = []
  private running = false
  private generation = 0
  private finished = false
  constructor(
    private opts: {
      voiceId?: string
      provider?: string
      onStart?: () => void
      onIdle?: () => void
      onSentence?: (text: string) => void
    } = {},
  ) {}

  enqueue(text: string) {
    const clean = speakable(text)
    if (!clean) return
    this.finished = false
    // Pre-fetch immediately; synthesis requests run in parallel with playback.
    this.items.push({ text: clean, audio: synthesize(clean, { voiceId: this.opts.voiceId, provider: this.opts.provider }) })
    if (!this.running) void this.run()
  }

  /** Mark that no more sentences will arrive; onIdle fires once the queue drains. */
  end() {
    this.finished = true
    if (!this.running) this.opts.onIdle?.()
  }

  get busy() {
    return this.running || this.items.length > 0
  }

  stop() {
    this.generation++
    this.items = []
    this.running = false
    this.finished = true
    stopSpeaking()
    setPlayback(false)
  }

  private async run() {
    const gen = this.generation
    this.running = true
    this.opts.onStart?.()
    while (this.items.length && gen === this.generation) {
      const item = this.items.shift()!
      const url = await item.audio
      if (gen !== this.generation) return
      this.opts.onSentence?.(item.text)
      if (url) {
        await playAudioUrl(url).done
      } else {
        await speakWithBrowserPersona(item.text)
        setPlayback(false)
      }
    }
    if (gen !== this.generation) return
    this.running = false
    if (this.finished) this.opts.onIdle?.()
  }
}

// ── Chat reader ownership: the floating chat avatar can take over reading replies ──
let chatReaderClaims = 0

/** A component (e.g. FloatingChatAvatar) claims responsibility for reading chat replies aloud. */
export function claimChatReader(): () => void {
  chatReaderClaims++
  let released = false
  return () => {
    if (released) return
    released = true
    chatReaderClaims = Math.max(0, chatReaderClaims - 1)
  }
}

export function chatReaderClaimed(): boolean {
  return chatReaderClaims > 0
}

export function isSpeaking(): boolean {
  if (currentAudio !== null && !currentAudio.paused) return true
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
    return true
  }
  return false
}
