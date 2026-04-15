import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import jwt from '@fastify/jwt'
import { createServer, IncomingMessage, Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

import type { User } from '@openagents/db/schema'
import { createAuthPlugin } from './auth'
import { websocketHandler } from './websocket'
import { apiRoutes } from './routes'

export interface ServerConfig {
  port: number
  host: string
  jwtSecret: string
  corsOrigins: string[]
}

export interface Context {
  user: User | null
  workspaceId: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    agentContext: Context
  }
}

export class ApiServer {
  private app: FastifyInstance
  private server: HttpServer | null = null
  private wss: WebSocketServer | null = null

  constructor(private config: ServerConfig) {
    this.app = Fastify({
      logger: {
        level: 'info',
        transport: {
          target: 'pino-pretty',
        },
      },
    })
  }

  async start(): Promise<void> {
    await this.registerPlugins()
    await this.registerRoutes()
    await this.startServer()
    await this.setupWebSocket()
  }

  private async registerPlugins(): Promise<void> {
    await this.app.register(cors, {
      origin: this.config.corsOrigins,
      credentials: true,
    })

    await this.app.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    })

    await this.app.register(jwt, {
      secret: this.config.jwtSecret,
    })

    await this.app.register(createAuthPlugin())
  }

  private async registerRoutes(): Promise<void> {
    await this.app.register(apiRoutes, { prefix: '/api' })

    this.app.get('/health', async (_request: FastifyRequest, _reply: FastifyReply) => {
      return { status: 'ok', timestamp: new Date().toISOString() }
    })

    this.app.get('/ready', async (_request: FastifyRequest, _reply: FastifyReply) => {
      return { ready: true }
    })
  }

  private async startServer(): Promise<void> {
    this.server = createServer(async (req, res) => {
      this.app.server.emit('request', req, res)
    })

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        resolve()
      })
    })

    this.app.log.info(`Server listening on ${this.config.host}:${this.config.port}`)
  }

  private async setupWebSocket(): Promise<void> {
    this.wss = new WebSocketServer({ server: this.server! })

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.app.log.info('WebSocket client connected')

      websocketHandler(ws, req, this.app)

      ws.on('close', () => {
        this.app.log.info('WebSocket client disconnected')
      })

      ws.on('error', (error) => {
        this.app.log.error({ err: error }, 'WebSocket error')
      })
    })
  }

  async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close()
    }

    await this.app.close()

    if (this.server) {
      this.server.close()
    }
  }

  getApp(): FastifyInstance {
    return this.app
  }
}

export async function createApp(config: Partial<ServerConfig> = {}): Promise<ApiServer> {
  const serverConfig: ServerConfig = {
    port: config.port || 3001,
    host: config.host || '0.0.0.0',
    jwtSecret: config.jwtSecret || process.env.JWT_SECRET || 'dev-secret-change-in-production',
    corsOrigins: config.corsOrigins || ['http://localhost:3000', 'http://localhost:5173'],
  }

  const server = new ApiServer(serverConfig)
  await server.start()
  return server
}

const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
if (isMain) {
  createApp({
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
  })
    .then((server) => {
      console.log('Server started')

      process.on('SIGTERM', async () => {
        await server.stop()
        process.exit(0)
      })
    })
    .catch((err) => {
      console.error('Failed to start server:', err)
      process.exit(1)
    })
}
