// Voice-to-voice real-time conversation types
export interface VoiceSession {
  id: string
  userId: string
  status: 'connecting' | 'active' | 'paused' | 'ended'
  startTime: string
  endTime?: string
  config: VoiceConfig
  stats: VoiceStats
}

export interface VoiceConfig {
  inputLanguage: string
  outputLanguage: string
  voiceId: string
  voiceSpeed: number
  voicePitch: number
  noiseCancellation: boolean
  echoCancellation: boolean
  pushToTalk: boolean
}

export interface VoiceStats {
  totalDurationMs: number
  inputTokens: number
  outputTokens: number
  turnCount: number
  interruptions: number
  averageLatencyMs: number
}

export interface VoiceSegment {
  id: string
  sessionId: string
  role: 'user' | 'agent'
  transcript: string
  audioUrl?: string
  durationMs: number
  language: string
  confidence: number
  createdAt: string
}

export interface VoiceConnection {
  id: string
  sessionId: string
  userId: string
  transport: 'websocket' | 'webrtc'
  endpoint: string
  codec: string
  quality: 'low' | 'medium' | 'high'
  latencyMs: number
  status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
}

export interface VoiceModel {
  id: string
  name: string
  provider: string
  supportsRealtime: boolean
  maxStreamLatencyMs: number
  supportedLanguages: string[]
  voiceOptions: VoiceOption[]
}

export interface VoiceOption {
  id: string
  name: string
  gender: 'male' | 'female' | 'neutral'
  previewUrl?: string
}
