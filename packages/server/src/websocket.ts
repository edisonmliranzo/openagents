import { IncomingMessage } from 'http'
import { WebSocket, WebSocketServer } from 'ws'
import { FastifyInstance } from 'fastify'

export interface WebSocketMessage {
  type: string
  payload: Record<string, unknown>
  timestamp: string
}

export interface WebSocketSession {
  id: string
  userId: string | null
  conversationId: string | null
  ws: WebSocket
  createdAt: string
  lastActivityAt: string
}

const sessions = new Map<string, WebSocketSession>()

export function websocketHandler(ws: WebSocket, req: IncomingMessage, app: FastifyInstance): void {
  const sessionId = generateId()
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const conversationId = url.searchParams.get('conversationId') || null
  const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '')

  const session: WebSocketSession = {
    id: sessionId,
    userId: null,
    conversationId,
    ws,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  }

  sessions.set(sessionId, session)

  if (token) {
    try {
      const payload = app.jwt.verify(token) as { userId?: string }
      if (payload.userId) {
        session.userId = payload.userId
        sendMessage(ws, {
          type: 'authenticated',
          payload: { userId: session.userId },
          timestamp: new Date().toISOString(),
        })
      }
    } catch {
      // Invalid token, continue as anonymous
    }
  }

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage
      await handleMessage(session, message, app)
    } catch (err) {
      app.log.error({ err }, 'Failed to parse WebSocket message')
      sendError(ws, 'Invalid message format')
    }
  })

  ws.on('close', () => {
    sessions.delete(sessionId)
    app.log.info({ sessionId }, 'WebSocket session closed')
  })

  sendMessage(ws, {
    type: 'connected',
    payload: { sessionId },
    timestamp: new Date().toISOString(),
  })
}

async function handleMessage(
  session: WebSocketSession,
  message: WebSocketMessage,
  app: FastifyInstance,
): Promise<void> {
  session.lastActivityAt = new Date().toISOString()

  switch (message.type) {
    case 'ping':
      sendMessage(session.ws, {
        type: 'pong',
        payload: {},
        timestamp: new Date().toISOString(),
      })
      break

    case 'authenticate':
      if (message.payload.token) {
        try {
          const payload = app.jwt.verify(message.payload.token as string) as { userId?: string }
          if (payload.userId) {
            session.userId = payload.userId
            sendMessage(session.ws, {
              type: 'authenticated',
              payload: { userId: session.userId },
              timestamp: new Date().toISOString(),
            })
          }
        } catch {
          sendError(session.ws, 'Invalid token')
        }
      }
      break

    case 'join_conversation':
      session.conversationId = message.payload.conversationId as string
      broadcastToConversation(
        session.conversationId,
        {
          type: 'user_joined',
          payload: { sessionId: session.id, userId: session.userId },
          timestamp: new Date().toISOString(),
        },
        session.id,
      )
      break

    case 'leave_conversation':
      if (session.conversationId) {
        broadcastToConversation(
          session.conversationId,
          {
            type: 'user_left',
            payload: { sessionId: session.id, userId: session.userId },
            timestamp: new Date().toISOString(),
          },
          session.id,
        )
        session.conversationId = null
      }
      break

    case 'message':
      if (session.conversationId) {
        broadcastToConversation(session.conversationId, {
          type: 'message',
          payload: {
            ...message.payload,
            userId: session.userId,
            sessionId: session.id,
          },
          timestamp: new Date().toISOString(),
        })
      }
      break

    case 'typing':
      if (session.conversationId) {
        broadcastToConversation(
          session.conversationId,
          {
            type: 'typing',
            payload: {
              userId: session.userId,
              sessionId: session.id,
              isTyping: message.payload.isTyping,
            },
            timestamp: new Date().toISOString(),
          },
          session.id,
        )
      }
      break

    case 'tool_call':
      if (session.conversationId) {
        broadcastToConversation(session.conversationId, {
          type: 'tool_call',
          payload: {
            ...message.payload,
            userId: session.userId,
          },
          timestamp: new Date().toISOString(),
        })
      }
      break

    case 'tool_result':
      if (session.conversationId) {
        broadcastToConversation(session.conversationId, {
          type: 'tool_result',
          payload: {
            ...message.payload,
          },
          timestamp: new Date().toISOString(),
        })
      }
      break

    case 'approval_request':
      broadcastToConversation(session.conversationId || '', {
        type: 'approval_request',
        payload: message.payload,
        timestamp: new Date().toISOString(),
      })
      break

    case 'approval_response':
      broadcastToConversation(session.conversationId || '', {
        type: 'approval_response',
        payload: message.payload,
        timestamp: new Date().toISOString(),
      })
      break

    default:
      app.log.warn({ type: message.type }, 'Unknown WebSocket message type')
  }
}

export function sendMessage(ws: WebSocket, message: WebSocketMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

export function sendError(ws: WebSocket, error: string): void {
  sendMessage(ws, {
    type: 'error',
    payload: { error },
    timestamp: new Date().toISOString(),
  })
}

export function broadcastToConversation(
  conversationId: string,
  message: WebSocketMessage,
  excludeSessionId?: string,
): void {
  const messageStr = JSON.stringify(message)

  for (const session of sessions.values()) {
    if (session.conversationId === conversationId && session.id !== excludeSessionId) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(messageStr)
      }
    }
  }
}

export function sendToUser(userId: string, message: WebSocketMessage): void {
  const messageStr = JSON.stringify(message)

  for (const session of sessions.values()) {
    if (session.userId === userId) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(messageStr)
      }
    }
  }
}

export function broadcast(message: WebSocketMessage): void {
  const messageStr = JSON.stringify(message)

  for (const session of sessions.values()) {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(messageStr)
    }
  }
}

export function getSession(sessionId: string): WebSocketSession | undefined {
  return sessions.get(sessionId)
}

export function getSessionsForConversation(conversationId: string): WebSocketSession[] {
  return Array.from(sessions.values()).filter((s) => s.conversationId === conversationId)
}

export function getUserSessions(userId: string): WebSocketSession[] {
  return Array.from(sessions.values()).filter((s) => s.userId === userId)
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
