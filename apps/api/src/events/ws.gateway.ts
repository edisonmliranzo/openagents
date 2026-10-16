import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'

function verifyHs256Jwt(rawToken: string, secret: string): { sub?: string; exp?: number } | null {
  try {
    const parts = rawToken.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sigB64] = parts
    const expectedSig = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url')
    const actualBuf = Buffer.from(sigB64)
    const expectedBuf = Buffer.from(expectedSig)
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
      return null
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true)
      const isProd = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production'
      if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
        return cb(null, true)
      }
      const allowed = [
        process.env.FRONTEND_URL ?? '',
        process.env.PUBLIC_BASE_URL ?? '',
        ...(process.env.FRONTEND_URLS ?? '').split(','),
      ]
        .map((s) => s.trim())
        .filter(Boolean)
      if (allowed.includes(origin)) return cb(null, true)
      return cb(new Error('Origin not allowed by WebSocket CORS'))
    },
    credentials: true,
  },
  namespace: '/ws',
  transports: ['websocket', 'polling'],
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(WsGateway.name)
  private userSockets = new Map<string, Set<string>>() // userId -> Set<socketId>

  constructor(private readonly prisma: PrismaService) {}

  private extractBearerToken(client: Socket): string | null {
    const authToken = client.handshake?.auth?.token
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim()
    }
    const header = client.handshake?.headers?.authorization
    if (typeof header === 'string' && header.trim()) {
      return header.replace(/^Bearer\s+/i, '').trim()
    }
    const queryToken = client.handshake?.query?.['token']
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.replace(/^Bearer\s+/i, '').trim()
    }
    return null
  }

  handleConnection(client: Socket) {
    const secret = (process.env.JWT_SECRET ?? '').trim()
    const token = this.extractBearerToken(client)
    const payload = secret && token ? verifyHs256Jwt(token, secret) : null
    const userId = typeof payload?.sub === 'string' ? payload.sub : ''
    if (!userId) {
      this.logger.warn(`Rejected unauthenticated WS connection: ${client.id}`)
      client.disconnect(true)
      return
    }
    client.data.userId = userId
    if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set())
    this.userSockets.get(userId)!.add(client.id)
    client.join(`user:${userId}`)
    this.logger.log(`WS connected: ${client.id} (user=${userId})`)
  }

  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.delete(client.id) && sockets.size === 0) {
        this.userSockets.delete(userId)
      }
    }
    this.logger.log(`WS disconnected: ${client.id}`)
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { ts: Date.now() })
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data?.userId as string | undefined
    const conversationId = String(data?.conversationId ?? '').trim()
    if (!userId || !conversationId) return { ok: false }
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    })
    if (!conv) return { ok: false }
    client.join(`conv:${conversationId}`)
    return { ok: true }
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const conversationId = String(data?.conversationId ?? '').trim()
    if (conversationId) client.leave(`conv:${conversationId}`)
    return { ok: true }
  }

  /** Emit agent typing/streaming event to all sockets in a conversation */
  emitToConversation(conversationId: string, event: string, data: unknown) {
    this.server.to(`conv:${conversationId}`).emit(event, data)
  }

  /** Emit notification to a specific user */
  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data)
  }

  /** Broadcast tool execution event */
  emitToolEvent(userId: string, toolName: string, status: 'started' | 'completed' | 'failed', data?: unknown) {
    this.emitToUser(userId, 'tool_event', { toolName, status, data, ts: Date.now() })
  }

  /** Broadcast agent run status */
  emitAgentStatus(conversationId: string, status: 'thinking' | 'tool_use' | 'done' | 'error', data?: unknown) {
    this.emitToConversation(conversationId, 'agent_status', { status, data, ts: Date.now() })
  }

  getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys())
  }

  isUserOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0
  }
}
