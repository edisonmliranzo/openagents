import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthTokens } from '@openagents/shared'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(email: string, password: string, name?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) throw new ConflictException('Email already in use')

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    })

    const tokens = await this.generateTokens(user.id, user.email)
    return { user, tokens }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    const { passwordHash: _, ...safeUser } = user
    const tokens = await this.generateTokens(user.id, user.email)
    return { user: safeUser, tokens }
  }

  async refresh(rawToken: string): Promise<AuthTokens> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: rawToken },
      include: { user: true },
    })

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
    const accessToken = this.jwt.sign({ sub: userId, email })

    const refreshSecret = this.config.get('JWT_REFRESH_SECRET')
    const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN', '7d')
    const rawRefreshToken = this.jwt.sign({ sub: userId }, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn,
    })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await this.prisma.refreshToken.create({
      data: { userId, token: rawRefreshToken, expiresAt },
    })

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 15 * 60,
    }
  }
}
