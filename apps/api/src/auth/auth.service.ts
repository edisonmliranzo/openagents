import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { randomUUID, createHash } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthTokens } from '@openagents/shared'
import { AuthRateLimitService } from './auth-rate-limit.service'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private authRateLimit: AuthRateLimitService,
  ) {}

  async register(email: string, password: string, name?: string, _clientIp = 'unknown') {
    const normalizedEmail = this.normalizeEmail(email)
    this.validatePasswordStrength(password)

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) throw new ConflictException('Email already in use')

    const passwordHash = await bcrypt.hash(password, this.passwordHashRounds())
    const trimmedName = name?.trim() || undefined

    const user = await this.prisma.user.create({
      data: { email: normalizedEmail, passwordHash, ...(trimmedName ? { name: trimmedName } : {}) },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    })

    const tokens = await this.generateTokens(user.id, user.email)
    return { user, tokens }
  }

  async login(email: string, password: string, clientIp = 'unknown') {
    const normalizedEmail = this.normalizeEmail(email)
    this.authRateLimit.assertLoginAllowed(normalizedEmail, clientIp)

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) {
      this.authRateLimit.recordLoginFailure(normalizedEmail, clientIp)
      throw new UnauthorizedException('Invalid credentials')
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      this.authRateLimit.recordLoginFailure(normalizedEmail, clientIp)
      throw new UnauthorizedException('Invalid credentials')
    }

    this.authRateLimit.clearLoginFailures(normalizedEmail)

    const { passwordHash: _, ...safeUser } = user
    const tokens = await this.generateTokens(user.id, user.email)
    return { user: safeUser, tokens }
  }

  async refresh(rawToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashRefreshToken(rawToken)
    let record = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    })

    // Backward-compatibility for pre-hash deployments. Tokens are rotated on successful refresh.
    if (!record) {
      record = await this.prisma.refreshToken.findUnique({
        where: { token: rawToken },
        include: { user: true },
      })
    }

    if (!record || record.expiresAt < new Date()) {
      if (record) await this.prisma.refreshToken.delete({ where: { id: record.id } })
      throw new UnauthorizedException('Invalid or expired refresh token')
    }

    await this.prisma.refreshToken.delete({ where: { id: record.id } })
    return this.generateTokens(record.user.id, record.user.email)
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } })
  }

  private async generateTokens(userId: string, email: string): Promise<AuthTokens> {
    const accessToken = this.jwt.sign({ sub: userId, email, jti: randomUUID() })

    const refreshSecret = this.config.get('JWT_REFRESH_SECRET')
    const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN', '7d')

    let rawRefreshToken = ''
    let lastError: unknown

    for (let attempt = 0; attempt < 3; attempt += 1) {
      rawRefreshToken = this.jwt.sign({ sub: userId, jti: randomUUID() }, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      })

      const decoded = this.jwt.decode(rawRefreshToken) as { exp?: number } | null
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      try {
        await this.prisma.refreshToken.create({
          data: { userId, token: this.hashRefreshToken(rawRefreshToken), expiresAt },
        })
        await this.pruneOldRefreshTokens(userId)
        lastError = null
        break
      } catch (error: any) {
        lastError = error
        if (error?.code !== 'P2002' || attempt === 2) {
          throw error
        }
      }
    }

    if (lastError) throw lastError

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 15 * 60,
    }
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase()
  }

  private validatePasswordStrength(password: string) {
    if (password.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters long.')
    }

    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    const hasNumber = /\d/.test(password)
    const hasSymbol = /[^A-Za-z\d]/.test(password)
    if (!hasUpper || !hasLower || !hasNumber || !hasSymbol) {
      throw new BadRequestException('Password must include uppercase, lowercase, number, and symbol.')
    }

    const lower = password.toLowerCase()
    const weakPatterns = ['password', '123456', 'qwerty', 'letmein', 'admin']
    if (weakPatterns.some((pattern) => lower.includes(pattern))) {
      throw new BadRequestException('Password is too weak. Avoid common words and sequences.')
    }
  }

  private passwordHashRounds() {
    const parsed = Number(this.config.get<string>('AUTH_BCRYPT_ROUNDS', '12'))
    if (!Number.isInteger(parsed) || parsed < 10 || parsed > 15) {
      return 12
    }
    return parsed
  }

  private async pruneOldRefreshTokens(userId: string) {
    const maxTokens = Number(this.config.get<string>('AUTH_MAX_REFRESH_TOKENS', '10'))
    const cap = Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 10

    const stale = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: cap,
      select: { id: true },
    })

    if (stale.length === 0) return
    await this.prisma.refreshToken.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    })
  }
}
