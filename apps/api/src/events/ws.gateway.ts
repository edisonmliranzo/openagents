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

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/ws',
  transports: ['websocket', 'polling'],
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(WsGateway.name)
  private userSockets = new Map<string, Set<string>>() // userId -> Set<socketId>

  handleConnection(client: Socket) {
    const userId = client.handshake.query['userId'] as string
    if (userId) {
      if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set())
      this.userSockets.get(userId)!.add(client.id)
      client.join(`user:${userId}`)
      this.logger.log(`WS connected: ${client.id} (user=${userId})`)
    }
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
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conv:${data.conversationId}`)
    return { ok: true }
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conv:${data.conversationId}`)
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
