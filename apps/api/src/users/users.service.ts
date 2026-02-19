import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    })
  }

  async updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    })
  }

  async getSettings(userId: string) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    })
  }

  async updateSettings(userId: string, data: {
    preferredProvider?: string
    preferredModel?: string
    customSystemPrompt?: string | null
  }) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    })
  }

  // ── LLM API Keys ──────────────────────────────────────────────────────────

  async getLlmKeys(userId: string) {
    const keys = await this.prisma.llmApiKey.findMany({ where: { userId } })
    return keys.map((k) => ({
      ...k,
      apiKey: k.apiKey ? `...${k.apiKey.slice(-4)}` : null,
    }))
  }

  async upsertLlmKey(userId: string, provider: string, data: {
    apiKey?: string
    baseUrl?: string
    isActive?: boolean
  }) {
    const result = await this.prisma.llmApiKey.upsert({
      where: { userId_provider: { userId, provider } },
      update: data,
      create: { userId, provider, ...data },
    })
    return { ...result, apiKey: result.apiKey ? `...${result.apiKey.slice(-4)}` : null }
  }

  async deleteLlmKey(userId: string, provider: string) {
    return this.prisma.llmApiKey.deleteMany({ where: { userId, provider } })
  }

  /** Internal — returns unmasked key. Never expose directly via HTTP. */
  async getRawLlmKey(userId: string, provider: string) {
    return this.prisma.llmApiKey.findUnique({
      where: { userId_provider: { userId, provider } },
    })
  }
}
