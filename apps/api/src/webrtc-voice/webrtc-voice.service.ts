import { Injectable, Logger } from '@nestjs/common'

export interface WebRTCSession {
  id: string
  userId: string
  conversationId: string
  status: 'connecting' | 'connected' | 'disconnected'
  lastKeepAlive: string
}

@Injectable()
export class WebRTCVoiceService {
  private readonly logger = new Logger(WebRTCVoiceService.name)
  private sessions = new Map<string, WebRTCSession>()

  async createSession(userId: string, conversationId: string): Promise<{ sessionId: string, offer: string }> {
    const sessionId = `webrtc-${Date.now()}`
    this.sessions.set(sessionId, {
      id: sessionId,
      userId,
      conversationId,
      status: 'connecting',
      lastKeepAlive: new Date().toISOString()
    })
    
    this.logger.log(`Created WebRTC voice session for conversation ${conversationId}`)
    return { sessionId, offer: 'mock-sdp-offer' }
  }

  async processAnswer(sessionId: string, sdpAnswer: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    
    session.status = 'connected'
    this.logger.log(`WebRTC session ${sessionId} connected successfully`)
    return true
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = 'disconnected'
      this.logger.log(`Ended WebRTC session ${sessionId}`)
    }
  }
}
