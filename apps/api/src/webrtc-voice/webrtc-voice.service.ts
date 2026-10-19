import { Injectable, Logger, NotFoundException, NotImplementedException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'

/**
 * OpenAgents real-time voice runs as a browser pipeline:
 *   Web Speech API (or MediaRecorder -> STT upload) -> chat endpoint (streamed)
 *   -> sentence-chunked TTS via the user's Fish Audio / ElevenLabs voice.
 * No server-side WebRTC media relay is configured, so these endpoints only
 * track session metadata. SDP negotiation is explicitly not supported.
 */
export interface VoiceSession {
  id: string
  userId: string
  conversationId: string | null
  status: 'active' | 'ended'
  createdAt: string
  endedAt: string | null
}

export interface VoiceSessionInfo {
  sessionId: string
  conversationId: string | null
  mode: 'browser-pipeline'
  transport: 'http'
  stt: { primary: 'web-speech'; fallback: '/api/v1/nanobot/voice/transcribe' }
  tts: { endpoint: '/api/v1/life/tts'; chunking: 'sentence' }
  webrtc: { configured: false }
}

const MAX_SESSIONS = 500

@Injectable()
export class WebRTCVoiceService {
  private readonly logger = new Logger(WebRTCVoiceService.name)
  private sessions = new Map<string, VoiceSession>()

  async createSession(userId: string, conversationId?: string | null): Promise<VoiceSessionInfo> {
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value
      if (oldest) this.sessions.delete(oldest)
    }
    const sessionId = `voice-${randomUUID()}`
    this.sessions.set(sessionId, {
      id: sessionId,
      userId,
      conversationId: conversationId || null,
      status: 'active',
      createdAt: new Date().toISOString(),
      endedAt: null,
    })
    this.logger.log(`Voice session ${sessionId} started`)
    return {
      sessionId,
      conversationId: conversationId || null,
      mode: 'browser-pipeline',
      transport: 'http',
      stt: { primary: 'web-speech', fallback: '/api/v1/nanobot/voice/transcribe' },
      tts: { endpoint: '/api/v1/life/tts', chunking: 'sentence' },
      webrtc: { configured: false },
    }
  }

  async processAnswer(_userId: string, _sessionId: string, _sdp: string): Promise<never> {
    throw new NotImplementedException(
      'WebRTC media transport is not configured. OpenAgents voice uses the browser pipeline (speech recognition + streamed chat + neural TTS).',
    )
  }

  async endSession(userId: string, sessionId: string): Promise<{ ended: boolean }> {
    const session = this.sessions.get(sessionId)
    if (!session || session.userId !== userId) throw new NotFoundException('Voice session not found')
    session.status = 'ended'
    session.endedAt = new Date().toISOString()
    this.sessions.delete(sessionId)
    return { ended: true }
  }
}
