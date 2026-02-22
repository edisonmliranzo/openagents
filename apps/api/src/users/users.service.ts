import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import type { LLMProvider } from '@openagents/shared'

const SUPPORTED_LLM_PROVIDERS: LLMProvider[] = ['anthropic', 'openai', 'google', 'ollama', 'minimax']
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const DEFAULT_OLLAMA_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'gateway.docker.internal',
  'host.containers.internal',
]
const SUPPORTED_DOMAIN_PROVIDERS = ['manual', 'cloudflare', 'caddy', 'nginx'] as const
const SUPPORTED_DOMAIN_STATUSES = ['pending', 'active', 'error'] as const

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

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
    const normalizedProvider = this.normalizeProvider(provider)
    const existing = await this.prisma.llmApiKey.findUnique({
      where: { userId_provider: { userId, provider: normalizedProvider } },
    })

    const updateData: {
      apiKey?: string | null
      baseUrl?: string | null
      isActive?: boolean
    } = {}

    if (typeof data.isActive === 'boolean') {
      updateData.isActive = data.isActive
    }

    if (normalizedProvider === 'ollama') {
      updateData.apiKey = null
      updateData.baseUrl = this.normalizeOllamaBaseUrl(data.baseUrl ?? existing?.baseUrl ?? undefined)
    } else {
      updateData.baseUrl = null
      if (data.apiKey != null) {
        const key = data.apiKey.trim()
        if (!key) {
          throw new BadRequestException('API key cannot be empty.')
        }
        updateData.apiKey = key
      } else if (!existing?.apiKey) {
        throw new BadRequestException(`API key is required for provider "${normalizedProvider}".`)
      }
    }

    const result = await this.prisma.llmApiKey.upsert({
      where: { userId_provider: { userId, provider: normalizedProvider } },
      update: updateData,
      create: { userId, provider: normalizedProvider, ...updateData },
    })
    return { ...result, apiKey: result.apiKey ? `...${result.apiKey.slice(-4)}` : null }
  }

  async deleteLlmKey(userId: string, provider: string) {
    const normalizedProvider = this.normalizeProvider(provider)
    return this.prisma.llmApiKey.deleteMany({ where: { userId, provider: normalizedProvider } })
  }

  async listDomains(userId: string) {
    return this.prisma.userDomain.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
    })
  }

  async createDomain(userId: string, data: {
    domain: string
    provider?: string
    status?: string
    targetHost?: string | null
    proxyInstructions?: string | null
  }) {
    const domain = this.normalizeDomain(data.domain)
    const provider = this.normalizeDomainProvider(data.provider)
    const status = this.normalizeDomainStatus(data.status)
    const targetHost = this.normalizeOptionalText(data.targetHost)
    const proxyInstructions = this.normalizeOptionalText(data.proxyInstructions)

    try {
      return await this.prisma.userDomain.create({
        data: {
          userId,
          domain,
          provider,
          status,
          targetHost,
          proxyInstructions,
        },
      })
    } catch (error: any) {
      if (typeof error?.code === 'string' && error.code === 'P2002') {
        throw new BadRequestException(`Domain "${domain}" already exists.`)
      }
      throw error
    }
  }

  async updateDomain(userId: string, id: string, data: {
    provider?: string
    status?: string
    targetHost?: string | null
    proxyInstructions?: string | null
  }) {
    const existing = await this.prisma.userDomain.findFirst({ where: { id, userId } })
    if (!existing) {
      throw new BadRequestException('Domain not found.')
    }

    const updateData: {
      provider?: string
      status?: string
      targetHost?: string | null
      proxyInstructions?: string | null
    } = {}

    if (typeof data.provider === 'string') {
      updateData.provider = this.normalizeDomainProvider(data.provider)
    }
    if (typeof data.status === 'string') {
      updateData.status = this.normalizeDomainStatus(data.status)
    }
    if (data.targetHost !== undefined) {
      updateData.targetHost = this.normalizeOptionalText(data.targetHost)
    }
    if (data.proxyInstructions !== undefined) {
      updateData.proxyInstructions = this.normalizeOptionalText(data.proxyInstructions)
    }

    return this.prisma.userDomain.update({
      where: { id: existing.id },
      data: updateData,
    })
  }

  async deleteDomain(userId: string, id: string) {
    const result = await this.prisma.userDomain.deleteMany({ where: { id, userId } })
    if (result.count < 1) {
      throw new BadRequestException('Domain not found.')
    }
    return { ok: true as const }
  }

  /** Internal — returns unmasked key. Never expose directly via HTTP. */
  async getRawLlmKey(userId: string, provider: string) {
    const normalizedProvider = this.normalizeProvider(provider)
    return this.prisma.llmApiKey.findUnique({
      where: { userId_provider: { userId, provider: normalizedProvider } },
    })
  }

  private normalizeProvider(provider: string): LLMProvider {
    const normalized = provider.trim().toLowerCase()
    if (!SUPPORTED_LLM_PROVIDERS.includes(normalized as LLMProvider)) {
      throw new BadRequestException(`Unsupported provider "${provider}".`)
    }
    return normalized as LLMProvider
  }

  private normalizeDomainProvider(provider?: string) {
    const normalized = (provider ?? 'manual').trim().toLowerCase()
    if (!SUPPORTED_DOMAIN_PROVIDERS.includes(normalized as any)) {
      throw new BadRequestException(`Unsupported domain provider "${provider}".`)
    }
    return normalized
  }

  private normalizeDomainStatus(status?: string) {
    const normalized = (status ?? 'pending').trim().toLowerCase()
    if (!SUPPORTED_DOMAIN_STATUSES.includes(normalized as any)) {
      throw new BadRequestException(`Unsupported domain status "${status}".`)
    }
    return normalized
  }

  private normalizeOptionalText(value?: string | null) {
    const normalized = (value ?? '').trim()
    return normalized.length > 0 ? normalized : null
  }

  private normalizeDomain(input: string) {
    let raw = input.trim().toLowerCase()
    if (!raw) {
      throw new BadRequestException('Domain is required.')
    }

    if (raw.includes('://')) {
      try {
        raw = new URL(raw).hostname.toLowerCase()
      } catch {
        throw new BadRequestException('Invalid domain.')
      }
    }

    raw = raw.split('/')[0] ?? raw
    if (raw.includes(':')) {
      raw = raw.split(':')[0] ?? raw
    }
    if (raw.startsWith('www.')) {
      raw = raw.slice(4)
    }
    raw = raw.replace(/\.$/, '')

    const validDomainPattern = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
    if (!validDomainPattern.test(raw)) {
      throw new BadRequestException('Invalid domain.')
    }

    return raw
  }

  private normalizeOllamaBaseUrl(input?: string) {
    const raw = (input ?? this.defaultOllamaBaseUrl()).trim()
    const candidate = raw.match(/^[a-z]+:\/\//i) ? raw : `http://${raw}`
    let parsed: URL
    try {
      parsed = new URL(candidate)
    } catch {
      throw new BadRequestException('Invalid Ollama server URL.')
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Ollama server URL must use http or https.')
    }

    parsed = this.rewriteLoopbackToDefaultOllamaUrl(parsed)

    const host = this.normalizeHost(parsed.hostname)
    const allowedHosts = this.allowedOllamaHosts()
    if (!allowedHosts.has('*') && !allowedHosts.has(host)) {
      throw new BadRequestException(
        `Blocked Ollama host "${host}". Add it to OLLAMA_ALLOWED_HOSTS to allow it.`,
      )
    }

    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.origin
  }

  private rewriteLoopbackToDefaultOllamaUrl(parsed: URL) {
    const requestedHost = this.normalizeHost(parsed.hostname)
    if (!this.isLoopbackHost(requestedHost)) return parsed

    const fallbackRaw = this.defaultOllamaBaseUrl().trim()
    const fallbackCandidate = fallbackRaw.match(/^[a-z]+:\/\//i) ? fallbackRaw : `http://${fallbackRaw}`
    let fallbackParsed: URL
    try {
      fallbackParsed = new URL(fallbackCandidate)
    } catch {
      return parsed
    }

    if (fallbackParsed.protocol !== 'http:' && fallbackParsed.protocol !== 'https:') return parsed

    const fallbackHost = this.normalizeHost(fallbackParsed.hostname)
    if (this.isLoopbackHost(fallbackHost)) return parsed

    fallbackParsed.pathname = ''
    fallbackParsed.search = ''
    fallbackParsed.hash = ''
    return fallbackParsed
  }

  private normalizeHost(hostname: string) {
    return hostname.toLowerCase().replace(/^\[|\]$/g, '')
  }

  private isLoopbackHost(host: string) {
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  }

  private defaultOllamaBaseUrl() {
    const fromEnv = this.config.get<string>('OLLAMA_BASE_URL')?.trim()
    return fromEnv || DEFAULT_OLLAMA_BASE_URL
  }

  private allowedOllamaHosts() {
    const fromEnv = (this.config.get<string>('OLLAMA_ALLOWED_HOSTS') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase().replace(/^\[|\]$/g, ''))
      .filter(Boolean)

    return new Set(fromEnv.length > 0 ? fromEnv : DEFAULT_OLLAMA_ALLOWED_HOSTS)
  }
}
