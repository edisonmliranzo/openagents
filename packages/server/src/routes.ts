import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', async (_req: FastifyRequest, _reply: FastifyReply) => {
    return { status: 'ok', api: 'v1' }
  })
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(async function (app: FastifyInstance) {
  app.get('/api/health', async (_req: FastifyRequest, _reply: FastifyReply) => {
    return { status: 'ok' }
  })
})
