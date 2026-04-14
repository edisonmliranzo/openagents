export interface VoiceCallConfig {
  iceServers?: RTCIceServer[]
  audioConstraints?: MediaTrackConstraints
}

export interface VoiceCallEvents {
  onStream?: (stream: MediaStream) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
  onData?: (data: ArrayBuffer) => void
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate'
  payload: unknown
}

export class WebRTCVoice {
  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private config: VoiceCallConfig

  constructor(config: VoiceCallConfig = {}) {
    this.config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      ...config,
    }
  }

  async startLocalStream(): Promise<MediaStream | null> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: this.config.audioConstraints || true,
        video: false,
      })
      return this.localStream
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to get microphone')
    }
  }

  async createCall(): Promise<RTCSessionDescriptionInit> {
    if (!this.localStream) {
      await this.startLocalStream()
    }

    this.pc = new RTCPeerConnection({ iceServers: this.config.iceServers })

    this.localStream!.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!)
    })

    this.pc.ontrack = (event) => {
      this.remoteStream = event.streams[0]
    }

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    return offer
  }

  async answer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.localStream) {
      await this.startLocalStream()
    }

    this.pc = new RTCPeerConnection({ iceServers: this.config.iceServers })

    this.localStream!.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!)
    })

    await this.pc.setRemoteDescription(offer)
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    return answer
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return
    await this.pc.setRemoteDescription(answer)
  }

  async addIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    if (!this.pc) return
    await this.pc.addIceCandidate(candidate)
  }

  onIceCandidate(callback: (candidate: RTCIceCandidate) => void): void {
    if (!this.pc) return
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        callback(event.candidate)
      }
    }
  }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream
  }

  async disconnect(): Promise<void> {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    this.remoteStream = null
  }

  isConnected(): boolean {
    return this.pc?.connectionState === 'connected'
  }
}

export class VoiceServer {
  private connections: Map<string, WebRTCVoice> = new Map()

  register(sessionId: string, voice: WebRTCVoice): void {
    this.connections.set(sessionId, voice)
  }

  unregister(sessionId: string): void {
    const voice = this.connections.get(sessionId)
    if (voice) {
      voice.disconnect()
      this.connections.delete(sessionId)
    }
  }

  get(sessionId: string): WebRTCVoice | undefined {
    return this.connections.get(sessionId)
  }
}

export function createVoiceClient(config?: VoiceCallConfig): WebRTCVoice {
  return new WebRTCVoice(config)
}