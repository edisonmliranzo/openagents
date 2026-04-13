import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import type {
  OAuthProvider,
  OAuthProviderConfig,
  OAuthState,
  OAuthCallbackParams,
  OAuthTokenResponse,
  ProviderConnection,
  CreateProviderConnectionInput,
} from '@openagents/shared'
import { OAUTH_PROVIDERS } from '@openagents/shared'

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name)
  private readonly stateStore = new Map<string, OAuthState>()
  private readonly stateExpirationMs = 10 * 60 * 1000 // 10 minutes

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Generate OAuth authorization URL for a provider
   */
  async generateAuthUrl(
    provider: OAuthProvider,
    userId?: string,
    redirectUri?: string,
  ): Promise<{ url: string; state: string }> {
    const config = OAUTH_PROVIDERS[provider]
    if (!config || !config.authUrl) {
      throw new BadRequestException(`OAuth not supported for provider: ${provider}`)
    }

    const state = this.generateState(provider, userId)
    const callbackUrl = redirectUri ?? this.config.get<string>('OAUTH_CALLBACK_URL') ?? `${this.getBaseUrl()}/auth/oauth/callback`

    const params = new URLSearchParams()
    params.set('client_id', this.getClientId(provider))
    params.set('redirect_uri', callbackUrl)
    params.set('response_type', 'code')
    params.set('scope', config.scopes.join(' '))
    params.set('state', state)

    // Provider-specific parameters
    if (provider === 'google') {
      params.set('access_type', 'offline')
      params.set('prompt', 'consent')
    }

    const url = `${config.authUrl}?${params.toString()}`
    return { url, state }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(
    params: OAuthCallbackParams,
    redirectUri?: string,
  ): Promise<ProviderConnection> {
    if (params.error) {
      throw new UnauthorizedException(`OAuth error: ${params.error} - ${params.errorDescription}`)
    }

    // Validate state
    const stateData = this.validateState(params.state)
    if (!stateData) {
      throw new UnauthorizedException('Invalid or expired OAuth state')
    }

    const provider = stateData.provider
    const config = OAUTH_PROVIDERS[provider]

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForToken(params.code, provider, redirectUri)

    // Get user info if available
    let email: string | undefined
    if (config.userInfoUrl && tokenResponse.accessToken) {
      email = await this.fetchUserInfo(config.userInfoUrl, tokenResponse.accessToken)
    }

    // Save or update provider connection
    const connection = await this.saveProviderConnection({
      userId: stateData.userId,
      provider,
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      email,
      expiresAt: tokenResponse.expiresIn
        ? new Date(Date.now() + tokenResponse.expiresIn * 1000).toISOString()
        : undefined,
      scopes: tokenResponse.scope?.split(' '),
    })

    // Clean up state
    this.stateStore.delete(params.state)

    return connection
  }

  /**
   * Get all connected providers for a user
   */
  async getConnectedProviders(userId: string): Promise<ProviderConnection[]> {
    const keys = await this.prisma.llmApiKey.findMany({
      where: { userId, isActive: true },
      select: { provider: true, loginEmail: true, subscriptionPlan: true, updatedAt: true },
    })

    return keys.map((key) => ({
      id: key.provider,
      userId,
      provider: key.provider as OAuthProvider,
      connectedEmail: key.loginEmail || undefined,
      isConnected: true,
      connectedAt: key.updatedAt.toISOString(),
    }))
  }

  /**
   * Disconnect a provider
   */
  async disconnectProvider(userId: string, provider: OAuthProvider): Promise<boolean> {
    await this.prisma.llmApiKey.deleteMany({
      where: { userId, provider },
    })
    return true
  }

  /**
   * Refresh access token if expired
   */
  async refreshAccessToken(
    userId: string,
    provider: OAuthProvider,
  ): Promise<string | null> {
    const key = await this.prisma.llmApiKey.findFirst({
      where: { userId, provider },
    })

    if (!key || !key.loginPassword) {
      return null
    }

    // For providers that support refresh tokens, exchange refresh token for new access token
    const config = OAUTH_PROVIDERS[provider]
    if (!config.tokenUrl) return null

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: key.loginPassword,
          client_id: this.getClientId(provider),
          client_secret: this.getClientSecret(provider),
        }),
      })

      const data = await response.json() as OAuthTokenResponse
      if (data.accessToken) {
        await this.prisma.llmApiKey.update({
          where: { id: key.id },
          data: { apiKey: data.accessToken },
        })
        return data.accessToken
      }
    } catch (error) {
      this.logger.error(`Failed to refresh token for ${provider}:`, error)
    }

    return null
  }

  private generateState(provider: OAuthProvider, userId?: string): string {
    const state = randomUUID()
    this.stateStore.set(state, {
      state,
      provider,
      userId,
      expiresAt: new Date(Date.now() + this.stateExpirationMs).toISOString(),
    })
    return state
  }

  private validateState(state: string): OAuthState | null {
    const data = this.stateStore.get(state)
    if (!data) return null

    if (new Date(data.expiresAt) < new Date()) {
      this.stateStore.delete(state)
      return null
    }

    return data
  }

  private async exchangeCodeForToken(
    code: string,
    provider: OAuthProvider,
    redirectUri?: string,
  ): Promise<OAuthTokenResponse> {
    const config = OAUTH_PROVIDERS[provider]
    if (!config.tokenUrl) {
      throw new BadRequestException(`Token endpoint not configured for ${provider}`)
    }

    const callbackUrl = redirectUri ?? this.config.get<string>('OAUTH_CALLBACK_URL') ?? `${this.getBaseUrl()}/auth/oauth/callback`

    const body = new URLSearchParams()
    body.set('grant_type', 'authorization_code')
    body.set('code', code)
    body.set('redirect_uri', callbackUrl)
    body.set('client_id', this.getClientId(provider))
    body.set('client_secret', this.getClientSecret(provider))

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new UnauthorizedException(`Failed to exchange code: ${error}`)
    }

    return response.json() as Promise<OAuthTokenResponse>
  }

  private async fetchUserInfo(url: string, accessToken: string): Promise<string | undefined> {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json() as { email?: string; preferred_username?: string }
        return data.email || data.preferred_username
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch user info: ${error}`)
    }

    return undefined
  }

  private async saveProviderConnection(
    input: CreateProviderConnectionInput & { userId?: string },
  ): Promise<ProviderConnection> {
    if (!input.userId) {
      // Create a new user if not provided
      const user = await this.prisma.user.create({
        data: {
          email: input.email || `${randomUUID()}@oauth.local`,
          passwordHash: '',
          name: `OAuth User (${input.provider})`,
        },
      })
      input.userId = user.id
    }

    // Upsert the API key record
    await this.prisma.llmApiKey.upsert({
      where: { userId_provider: { userId: input.userId, provider: input.provider } },
      update: {
        apiKey: input.accessToken,
        loginEmail: input.email,
        loginPassword: input.refreshToken,
        isActive: true,
      },
      create: {
        userId: input.userId,
        provider: input.provider,
        apiKey: input.accessToken,
        loginEmail: input.email,
        loginPassword: input.refreshToken,
        isActive: true,
      },
    })

    return {
      id: `${input.userId}-${input.provider}`,
      userId: input.userId,
      provider: input.provider,
      connectedEmail: input.email,
      isConnected: true,
      connectedAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      scopes: input.scopes,
    }
  }

  private getClientId(provider: OAuthProvider): string {
    const key = `OAUTH_${provider.toUpperCase()}_CLIENT_ID`
    return this.config.get<string>(key) || ''
  }

  private getClientSecret(provider: OAuthProvider): string {
    const key = `OAUTH_${provider.toUpperCase()}_CLIENT_SECRET`
    return this.config.get<string>(key) || ''
  }

  private getBaseUrl(): string {
    return this.config.get<string>('API_URL', 'http://localhost:3000')
  }
}