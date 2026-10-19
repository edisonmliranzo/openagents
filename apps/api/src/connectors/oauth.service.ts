import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { ConnectorsService } from './connectors.service'
import { OAUTH_CONNECTORS, OAUTH_PROVIDERS, getOAuthConnector, type OAuthConnectorDefinition } from './oauth-providers'

const STATE_TTL_MS = 10 * 60_000
const NATIVE_GOOGLE_CONNECTORS = new Set(['google_gmail', 'google_calendar'])

interface OAuthState {
  u: string
  c: string
  n: string
  exp: number
}

interface StoredOAuthTokens {
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: string
  scopes: string[]
  accountEmail?: string
  connectedAt: string
  updatedAt: string
}

@Injectable()
export class ConnectorOAuthService {
  private readonly logger = new Logger(ConnectorOAuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorsService,
  ) {}

  listDefinitions() {
    return Object.values(OAUTH_CONNECTORS).map((def) => {
      const provider = OAUTH_PROVIDERS[def.provider]
      return {
        id: def.id,
        displayName: def.displayName,
        provider: def.provider,
        scopes: def.scopes,
        configured: Boolean(this.env(provider.clientIdEnv) && this.env(provider.clientSecretEnv)),
        actions: def.actions.map(({ name, displayName, description }) => ({ name, displayName, description })),
      }
    })
  }

  start(userId: string, connectorId: string) {
    const def = this.requireConnector(connectorId)
    const provider = OAUTH_PROVIDERS[def.provider]
    const clientId = this.env(provider.clientIdEnv)
    if (!clientId || !this.env(provider.clientSecretEnv)) {
      throw new BadRequestException(
        `${def.displayName} OAuth is not configured. Set ${provider.clientIdEnv} and ${provider.clientSecretEnv}.`,
      )
    }

    const state = this.signState({ u: userId, c: def.id, n: randomBytes(12).toString('hex'), exp: Date.now() + STATE_TTL_MS })
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      state,
      ...(provider.extraAuthorizeParams ?? {}),
    })
    if (def.scopes.length > 0) params.set('scope', def.scopes.join(provider.scopeSeparator))
    return { connectorId: def.id, url: `${provider.authorizeUrl}?${params.toString()}`, expiresInMs: STATE_TTL_MS }
  }

  /** Returns the frontend URL to redirect the browser to after handling the callback. */
  async callback(query: { code?: string; state?: string; error?: string }): Promise<string> {
    const base = `${this.frontendUrl()}/control/connectors`
    let connectorId = 'unknown'
    try {
      if (!query.state) throw new BadRequestException('Missing OAuth state.')
      const state = this.verifyState(query.state)
      connectorId = state.c
      if (query.error) throw new BadRequestException(`Provider returned error: ${query.error}`)
      if (!query.code) throw new BadRequestException('Missing authorization code.')

      const def = this.requireConnector(state.c)
      const tokens = await this.exchangeCode(def, query.code)
      await this.storeTokens(state.u, def, tokens)
      return `${base}?connected=${encodeURIComponent(def.id)}`
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth failed'
      this.logger.warn(`OAuth callback failed for ${connectorId}: ${message}`)
      return `${base}?connector=${encodeURIComponent(connectorId)}&error=${encodeURIComponent(message.slice(0, 200))}`
    }
  }

  async runAction(userId: string, connectorId: string, actionName: string) {
    const def = this.requireConnector(connectorId)
    const action = def.actions.find((entry) => entry.name === actionName)
    if (!action) throw new BadRequestException(`Unknown action "${actionName}" for ${def.id}.`)

    const stored = await this.loadTokens(userId, def.id)
    if (!stored) throw new BadRequestException(`Connector "${def.id}" is not connected.`)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${stored.accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'OpenAgents',
    }
    if (def.provider === 'notion') headers['Notion-Version'] = '2022-06-28'
    if (action.body) headers['Content-Type'] = 'application/json'

    const response = await fetch(action.url, {
      method: action.method,
      headers,
      ...(action.body ? { body: JSON.stringify(action.body) } : {}),
    })
    const text = await response.text().catch(() => '')
    if (!response.ok) {
      throw new BadRequestException(`${def.displayName} request failed (${response.status}): ${text.slice(0, 300)}`)
    }
    try {
      return JSON.parse(text)
    } catch {
      return { raw: text }
    }
  }

  async status(userId: string, connectorId: string) {
    const def = this.requireConnector(connectorId)
    if (NATIVE_GOOGLE_CONNECTORS.has(def.id)) {
      const connection = await this.connectors.getConnection(userId, def.id)
      return { connectorId: def.id, connected: connection.connected }
    }
    const stored = await this.loadTokens(userId, def.id)
    return { connectorId: def.id, connected: Boolean(stored), scopes: stored?.scopes ?? [], connectedAt: stored?.connectedAt ?? null }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async exchangeCode(def: OAuthConnectorDefinition, code: string): Promise<StoredOAuthTokens> {
    const provider = OAUTH_PROVIDERS[def.provider]
    const clientId = this.env(provider.clientIdEnv)!
    const clientSecret = this.env(provider.clientSecretEnv)!
    const headers: Record<string, string> = { Accept: 'application/json' }
    let body: string

    if (provider.tokenAuth === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri() })
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri(),
      }).toString()
    }

    const response = await fetch(provider.tokenUrl, { method: 'POST', headers, body })
    const payload = await response.json().catch(() => ({})) as Record<string, any>
    if (!response.ok || payload.error || payload.ok === false) {
      throw new BadRequestException(`Token exchange failed (${response.status}): ${String(payload.error_description ?? payload.error ?? 'unknown error')}`)
    }

    // Slack user tokens come back under authed_user when only user scopes are requested.
    const accessToken: string | undefined = payload.access_token ?? payload.authed_user?.access_token
    if (!accessToken) throw new BadRequestException('Token exchange returned no access token.')

    const now = new Date().toISOString()
    const scopeRaw: string = payload.scope ?? payload.authed_user?.scope ?? def.scopes.join(' ')
    return {
      accessToken,
      ...(payload.refresh_token ? { refreshToken: String(payload.refresh_token) } : {}),
      ...(typeof payload.expires_in === 'number'
        ? { tokenExpiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString() }
        : {}),
      scopes: scopeRaw.split(/[\s,]+/).filter(Boolean),
      ...(payload.owner?.user?.person?.email ? { accountEmail: String(payload.owner.user.person.email) } : {}),
      connectedAt: now,
      updatedAt: now,
    }
  }

  private async storeTokens(userId: string, def: OAuthConnectorDefinition, tokens: StoredOAuthTokens) {
    if (NATIVE_GOOGLE_CONNECTORS.has(def.id)) {
      // Reuse the existing Gmail/Calendar connection storage (tool seeding, health, scope diagnostics).
      await this.connectors.saveConnection(userId, def.id, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        scopes: tokens.scopes,
        accountEmail: tokens.accountEmail,
      })
      return
    }

    const encryptedTokens = this.encrypt(tokens)
    const toolName = this.storageToolName(def.id)
    const tool = await this.prisma.tool.upsert({
      where: { name: toolName },
      update: { displayName: def.displayName },
      create: {
        name: toolName,
        displayName: def.displayName,
        description: `${def.displayName} OAuth connection`,
        category: 'connector',
        requiresApproval: false,
        inputSchema: '{}',
      },
    })
    await this.prisma.connectedTool.upsert({
      where: { userId_toolId: { userId, toolId: tool.id } },
      update: { status: 'connected', encryptedTokens },
      create: { userId, toolId: tool.id, status: 'connected', encryptedTokens },
    })

    if (def.id === 'slack') {
      await this.connectors.report(userId, { connectorId: 'slack', success: true, tokenExpiresAt: tokens.tokenExpiresAt })
        .catch(() => undefined)
    }
  }

  private async loadTokens(userId: string, connectorId: string): Promise<StoredOAuthTokens | null> {
    const record = await this.prisma.connectedTool.findFirst({
      where: { userId, tool: { name: this.storageToolName(connectorId) } },
      orderBy: { updatedAt: 'desc' },
    })
    if (!record?.encryptedTokens) return null
    return this.decrypt(record.encryptedTokens)
  }

  private storageToolName(connectorId: string) {
    return `connector_oauth_${connectorId}`
  }

  private requireConnector(connectorId: string) {
    const def = getOAuthConnector(connectorId)
    if (!def) throw new BadRequestException(`Connector "${connectorId}" does not support OAuth.`)
    return def
  }

  private signState(state: OAuthState) {
    const data = Buffer.from(JSON.stringify(state)).toString('base64url')
    return `${data}.${this.hmac(data)}`
  }

  private verifyState(raw: string): OAuthState {
    const [data, sig] = raw.split('.')
    if (!data || !sig) throw new BadRequestException('Malformed OAuth state.')
    const expected = Buffer.from(this.hmac(data))
    const actual = Buffer.from(sig)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new BadRequestException('Invalid OAuth state signature.')
    }
    const state = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as OAuthState
    if (!state.u || !state.c || typeof state.exp !== 'number' || state.exp < Date.now()) {
      throw new BadRequestException('OAuth state expired. Please try connecting again.')
    }
    return state
  }

  private hmac(data: string) {
    return createHmac('sha256', this.key()).update(`oauth-state:${data}`).digest('base64url')
  }

  /** Same key derivation + envelope as ConnectorsService so tokens are interoperable. */
  private key() {
    const configured = this.env('ENCRYPTION_KEY')
    const isPlaceholder = !configured || configured === '32-char-hex-key-here' || configured.includes('change-me')
    if (isPlaceholder && (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
      throw new Error('ENCRYPTION_KEY must be set to a strong secret in production.')
    }
    const raw = (!isPlaceholder ? configured : this.env('JWT_SECRET')) ?? 'openagents-local-dev-key'
    const hex = raw.replace(/^0x/i, '')
    if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex')
    return createHash('sha256').update(raw).digest()
  }

  private encrypt(payload: StoredOAuthTokens) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv)
    const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
    return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })
  }

  private decrypt(raw: string): StoredOAuthTokens | null {
    try {
      const parsed = JSON.parse(raw) as { iv: string; tag: string; data: string }
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(parsed.iv, 'base64'))
      decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'))
      const text = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8')
      const tokens = JSON.parse(text) as StoredOAuthTokens
      return tokens.accessToken ? tokens : null
    } catch {
      return null
    }
  }

  private redirectUri() {
    const explicit = this.env('CONNECTOR_OAUTH_REDIRECT_URI')
    if (explicit) return explicit
    const apiBase = (this.env('API_PUBLIC_URL') ?? 'http://localhost:3001').replace(/\/+$/, '')
    return `${apiBase}/api/v1/connectors/oauth/callback`
  }

  private frontendUrl() {
    return (this.env('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/+$/, '')
  }

  private env(name: string) {
    const value = process.env[name]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
}
