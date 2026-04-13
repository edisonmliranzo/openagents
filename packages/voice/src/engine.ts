export interface VoiceConfig {
  provider: 'openai' | 'elevenlabs' | ' Coqui' | 'google'
  model?: string
  voice?: string
  language?: string
}

export interface TtsInput {
  text: string
  voice?: string
  language?: string
  speed?: number
}

export interface TtsResult {
  success: boolean
  audioData?: Buffer
  audioUrl?: string
  duration?: number
  error?: string
}

export interface SttInput {
  audioData: Buffer | Uint8Array | string
  language?: string
}

export interface SttResult {
  success: boolean
  text: string
  confidence: number
  words?: WordInfo[]
  error?: string
}

export interface WordInfo {
  word: string
  start: number
  end: number
  confidence: number
}

export class VoiceEngine {
  private config: VoiceConfig

  constructor(config: VoiceConfig) {
    this.config = config
  }

  async synthesize(input: TtsInput): Promise<TtsResult> {
    try {
      switch (this.config.provider) {
        case 'openai':
          return await this.openAiTts(input)
        case 'elevenlabs':
          return await this.elevenLabsTts(input)
        case 'google':
          return await this.googleTts(input)
        default:
          return { success: false, error: 'Unknown provider' }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'TTS failed',
      }
    }
  }

  async recognize(input: SttInput): Promise<SttResult> {
    try {
      switch (this.config.provider) {
        case 'openai':
          return await this.openAiStt(input)
        case 'google':
          return await this.googleStt(input)
        default:
          return { success: false, error: 'Unknown provider' }
      }
    } catch (err) {
      return {
        success: false,
        text: '',
        error: err instanceof Error ? err.message : 'STT failed',
      }
    }
  }

  private async openAiTts(input: TtsInput): Promise<TtsResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { success: false, error: 'OpenAI API key not configured' }
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model || 'tts-1',
        voice: input.voice || this.config.voice || 'alloy',
        input: input.text,
        speed: input.speed || 1.0,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const audioData = Buffer.from(await response.arrayBuffer())

    return {
      success: true,
      audioData,
      duration: audioData.length / 32000,
    }
  }

  private async elevenLabsTts(input: TtsInput): Promise<TtsResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' }
    }

    const voiceId = input.voice || this.config.voice || '21m00T9PT2GjF8zhFZ6N'
    const voiceSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
      speed: input.speed || 1.0,
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: input.text,
          voice_settings: voiceSettings,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const audioData = Buffer.from(await response.arrayBuffer())

    return {
      success: true,
      audioData,
      duration: audioData.length / 32000,
    }
  }

  private async googleTts(input: TtsInput): Promise<TtsResult> {
    const apiKey = process.env.GOOGLE_TTS_API_KEY
    if (!apiKey) {
      return { success: false, error: 'Google API key not configured' }
    }

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: input.text },
          voice: {
            languageCode: input.language || this.config.language || 'en-US',
            name: input.voice || this.config.voice || 'en-US-Neural2-J',
          },
          audioConfig: {
            audioEncoding: 'LINEAR16',
            speakingRate: input.speed || 1.0,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const data = await response.json() as { audioContent?: string }
    if (!data.audioContent) {
      return { success: false, error: 'No audio content returned' }
    }

    const audioData = Buffer.from(data.audioContent, 'base64')

    return {
      success: true,
      audioData,
      duration: audioData.length / 32000,
    }
  }

  private async openAiStt(input: SttInput): Promise<SttResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { success: false, text: '', error: 'OpenAI API key not configured' }
    }

    const formData = new FormData()
    const blob = new Blob([input.audioData])
    formData.append('file', blob, 'audio.wav')
    formData.append('model', 'whisper-1')
    if (input.language) {
      formData.append('language', input.language)
    }

    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, text: '', error }
    }

    const data = await response.json() as { text?: string; duration?: number }

    return {
      success: true,
      text: data.text || '',
      confidence: 0.9,
    }
  }

  private async googleStt(input: SttInput): Promise<SttResult> {
    const apiKey = process.env.GOOGLE_STT_API_KEY
    if (!apiKey) {
      return { success: false, text: '', error: 'Google API key not configured' }
    }

    const audioData =
      typeof input.audioData === 'string'
        ? Buffer.from(input.audioData)
        : input.audioData

    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: input.language || this.config.language || 'en-US',
          },
          audio: {
            content: Buffer.isBuffer(audioData)
              ? audioData.toString('base64')
              : input.audioData,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, text: '', error }
    }

    const data = await response.json() as {
      results?: Array<{ alternatives: Array<{ transcript: string; confidence: number }> }[]
    }

    const result = data.results?.[0]?.alternatives?.[0]

    return {
      success: true,
      text: result?.transcript || '',
      confidence: result?.confidence || 0.9,
    }
  }
}

export function createVoice(config: VoiceConfig): VoiceEngine {
  return new VoiceEngine(config)
}