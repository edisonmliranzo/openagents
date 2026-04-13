import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import crypto from 'crypto'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string; role: string }
    user: { userId: string; email: string; role: string }
  }
}

export interface AuthUser {
  userId: string
  email: string
  role: string
  iat?: number
  exp?: number
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    })
  }
}

export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    // Ignore auth errors for optional auth
  }
}

export async function adminMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authMiddleware(request, reply)

  const user = request.user as AuthUser

  if (user.role !== 'admin' && user.role !== 'owner') {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin access required',
    })
  }
}

export function createAuthPlugin() {
  return fp(async function (app: FastifyInstance) {
    app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
      await authMiddleware(request, reply)
    })

    app.decorate('optionalAuth', async function (request: FastifyRequest, _reply: FastifyReply) {
      await optionalAuthMiddleware(request, _reply)
    })

    app.decorate('requireAdmin', async function (request: FastifyRequest, reply: FastifyReply) {
      await adminMiddleware(request, reply)
    })
  })
}

export function generateToken(payload: { userId: string; email: string; role: string }): string {
  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }

  const data = {
    ...payload,
    iat: now,
    exp: now + 7 * 24 * 60 * 60,
  }

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
  const base64Payload = Buffer.from(JSON.stringify(data)).toString('base64url')

  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-in-production')
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url')

  return `${base64Header}.${base64Payload}.${signature}`
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const [base64Header, base64Payload, signature] = token.split('.')

    const expectedSignature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-in-production')
      .update(`${base64Header}.${base64Payload}`)
      .digest('base64url')

    if (signature !== expectedSignature) {
      return null
    }

    const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString())

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')

  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')

  return hash === verifyHash
}

export function generateApiKey(): { id: string; key: string; prefix: string } {
  const id = crypto.randomUUID()
  const key = `oa_${crypto.randomBytes(32).toString('base64url')}`
  const prefix = key.slice(0, 12)

  return { id, key, prefix }
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return '*'.repeat(key.length)
  }
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`
}
