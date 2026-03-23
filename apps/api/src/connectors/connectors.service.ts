import { BadRequestException, Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type {
  ConnectorConnection,
  ConnectorConnectionResult,
  ConnectorHealthAlert,
  ConnectorHealthEntry,
  ConnectorHealthSnapshot,
  ConnectorStatus,
  ReconnectConnectorResult,
  RecordConnectorHealthInput,
  SaveConnectorConnectionInput,
} from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'

const TOKEN_EXPIRY_WARNING_HOURS = 72
const CHANNEL_ACTIVITY_RECENT_WINDOW_HOURS = 24
const MAX_LATENCY_MS = 120_000
const GOOGLE_TOKEN_REFRESH_WINDOW_MS = 60_000
const ENCRYPTION_ALGORITHM = 'aes-256-gcm'

const CONNECTOR_CATALOG = {
  google_gmail: {
    displayName: 'Gmail',
    toolNames: ['gmail_search', 'gmail_draft_reply'],
  },
  google_calendar: {
    displayName: 'Google Calendar',
    toolNames: ['calendar_get_availability', 'calendar_create_event'],
  },
  whatsapp: {
    displayName: 'WhatsApp',
    toolNames: [],
  },
  telegram: {
    displayName: 'Telegram',
    toolNames: [],
  },
  slack: {
    displayName: 'Slack',
    toolNames: [],
  },
  discord: {
    displayName: 'Discord',
    toolNames: [],
  },
} as const

type KnownConnectorId = keyof typeof CONNECTOR_CATALOG
type GoogleConnectorId = Extract<KnownConnectorId, 'google_gmail' | 'google_calendar'>

interface ConnectorToolSeed {
  displayName: string
  description: string
  category: 'email' | 'calendar'
  requiresApproval: boolean
}

const CONNECTOR_TOOL_SEEDS: Record<string, ConnectorToolSeed> = {
  gmail_search: {
    displayName: 'Gmail Search',
    description: 'Search Gmail messages.',
    category: 'email',
    requiresApproval: false,
  },
  gmail_draft_reply: {
    displayName: 'Gmail Draft Reply',
    description: 'Create a Gmail draft reply.',
    category: 'email',
    requiresApproval: true,
  },
  calendar_get_availability: {
    displayName: 'Calendar Availability',
    description: 'Get availability from Google Calendar.',
    category: 'calendar',
    requiresApproval: false,
  },
  calendar_create_event: {
    displayName: 'Calendar Create Event',
    description: 'Create an event in Google Calendar.',
    category: 'calendar',
    requiresApproval: true,
  },
}

interface ConnectedToolRecord {
  status: string
  connectedAt: Date
  updatedAt: Date
  tool: { name: string }
  encryptedTokens?: string | null
}

interface LinkedChannelRecord {
  linkedAt: Date
  lastSeenAt: Date | null
}

interface ConnectorHealthRowRecord {
  status: string
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  lastError: string | null
  tokenExpiresAt: Date | null
  p95LatencyMs: number | null
  rateLimitHits: number
  failureStreak: number
  updatedAt: Date
}

interface StoredConnectorTokens {
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: string
  scopes: string[]
  accountEmail?: string
  connectedAt: string
  updatedAt: string
}

@Injectable()
export class ConnectorsService {
  private readonly gmailTools = new Set<string>([...CONNECTOR_CATALOG.google_gmail.toolNames])
  private readonly calendarTools = new Set<string>([...CONNECTOR_CATALOG.google_calendar.toolNames])

  constructor(private prisma: PrismaService) {}

  async listHealth(userId: string): Promise<ConnectorHealthSnapshot> {
    const connectorIds = Object.keys(CONNECTOR_CATALOG) as KnownConnectorId[]
    const [rows, connectedTools, devices, telegramChats, slackWorkspaces, discordServers] = await Promise.all([
      this.prisma.connectorHealth.findMany({
        where: { userId, connectorId: { in: connectorIds } },
      }),
      this.prisma.connectedTool.findMany({
        where: {
          userId,
          tool: {
            name: {
              in: [...CONNECTOR_CATALOG.google_gmail.toolNames, ...CONNECTOR_CATALOG.google_calendar.toolNames],
            },
          },
        },
        include: {
          tool: {
            select: { name: true },
          },
        },
      }),
      this.prisma.whatsAppDevice.findMany({
        where: { userId },
        orderBy: [{ lastSeenAt: 'desc' }, { linkedAt: 'desc' }],
        select: { lastSeenAt: true, linkedAt: true },
      }),
      this.prisma.telegramChat.findMany({
        where: { userId },
        orderBy: [{ lastSeenAt: 'desc' }, { linkedAt: 'desc' }],
        select: { lastSeenAt: true, linkedAt: true },
      }),
      this.prisma.slackWorkspace.findMany({
        where: { userId },
        orderBy: [{ lastSeenAt: 'desc' }, { linkedAt: 'desc' }],
        select: { lastSeenAt: true, linkedAt: true },
      }),
      this.prisma.discordServer.findMany({
        where: { userId },
        orderBy: [{ lastSeenAt: 'desc' }, { linkedAt: 'desc' }],
        select: { lastSeenAt: true, linkedAt: true },
      }),
    ])

    const rowByConnector = new Map(rows.map((row) => [row.connectorId, row]))
    const entries = connectorIds
      .map((connectorId) => this.toConnectorEntry({
        connectorId,
        row: rowByConnector.get(connectorId) ?? null,
        connectedTools,
        devices,
        telegramChats,
        slackWorkspaces,
        discordServers,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return {
      connectors: entries,
      generatedAt: new Date().toISOString(),
    }
  }

  async reconnect(userId: string, connectorId: string): Promise<ReconnectConnectorResult> {
    const normalized = this.normalizeConnectorId(connectorId)
    if (this.isGoogleConnector(normalized)) {
      const connection = await this.getConnection(userId, normalized)
      if (!connection.connected) {
        throw new BadRequestException(`Connector "${normalized}" has no saved credentials.`)
      }
    }
    const now = new Date()

    await this.prisma.connectorHealth.upsert({
      where: {
        userId_connectorId: {
          userId,
          connectorId: normalized,
        },
      },
      update: {
        status: 'connected',
        lastSuccessAt: now,
        lastError: null,
        failureStreak: 0,
      },
      create: {
        userId,
        connectorId: normalized,
        status: 'connected',
        lastSuccessAt: now,
        failureStreak: 0,
      },
    })

    const snapshot = await this.listHealth(userId)
    const connector = snapshot.connectors.find((entry) => entry.connectorId === normalized)
    if (!connector) {
      throw new BadRequestException(`Connector "${normalized}" is not available.`)
    }

    return {
      connector,
      reconnectedAt: now.toISOString(),
    }
  }

  async getConnection(userId: string, connectorId: string): Promise<ConnectorConnection> {
    const normalized = this.normalizeConnectorId(connectorId)
    const toolNames = [...CONNECTOR_CATALOG[normalized].toolNames]

    if (!this.isGoogleConnector(normalized)) {
      return {
        connectorId: normalized,
        connected: false,
        accountEmail: null,
        scopes: [],
        tokenExpiresAt: null,
        connectedAt: null,
        updatedAt: null,
        toolNames,
      }
    }

    const connected = await this.prisma.connectedTool.findFirst({
      where: {
        userId,
        tool: {
          name: {
            in: toolNames,
          },
        },
      },
      include: {
        tool: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    const payload = this.parseStoredTokens(connected?.encryptedTokens ?? null)
    return {
      connectorId: normalized,
      connected: Boolean(payload?.accessToken),
      accountEmail: payload?.accountEmail ?? null,
      scopes: payload?.scopes ?? [],
      tokenExpiresAt: payload?.tokenExpiresAt ?? null,
      connectedAt: payload?.connectedAt ?? connected?.connectedAt?.toISOString() ?? null,
      updatedAt: payload?.updatedAt ?? connected?.updatedAt?.toISOString() ?? null,
      toolNames,
    }
  }

  async saveConnection(
    userId: string,
    connectorId: string,
    input: SaveConnectorConnectionInput,
  ): Promise<ConnectorConnectionResult> {
    const normalized = this.normalizeConnectorId(connectorId)
    if (!this.isGoogleConnector(normalized)) {
      throw new BadRequestException(`Manual credential storage is not supported for "${normalized}".`)
    }

    const accessToken = (input.accessToken ?? '').trim()
    if (!accessToken) {
      throw new BadRequestException('Access token is required.')
    }

    const nowIso = new Date().toISOString()
    const payload: StoredConnectorTokens = {
      accessToken,
      ...(this.optionalText(input.refreshToken) ? { refreshToken: this.optionalText(input.refreshToken)! } : {}),
      ...(this.normalizeIso(input.tokenExpiresAt) ? { tokenExpiresAt: this.normalizeIso(input.tokenExpiresAt)! } : {}),
      scopes: this.normalizeScopes(input.scopes),
      ...(this.optionalText(input.accountEmail) ? { accountEmail: this.optionalText(input.accountEmail)! } : {}),
      connectedAt: nowIso,
      updatedAt: nowIso,
    }

    await this.ensureConnectorTools(userId, normalized, payload)
    const connector = await this.report(userId, {
      connectorId: normalized,
      success: true,
      tokenExpiresAt: payload.tokenExpiresAt,
      metadata: {
        scopes: payload.scopes,
        accountEmail: payload.accountEmail ?? null,
      },
    })

    return {
      connector,
      connection: await this.getConnection(userId, normalized),
    }
  }

  async deleteConnection(userId: string, connectorId: string) {
    const normalized = this.normalizeConnectorId(connectorId)
    if (!this.isGoogleConnector(normalized)) {
      throw new BadRequestException(`Connector "${normalized}" does not support stored credentials.`)
    }

    await this.prisma.connectedTool.deleteMany({
      where: {
          userId,
          tool: {
            name: {
              in: [...CONNECTOR_CATALOG[normalized].toolNames],
            },
          },
        },
    })

    await this.prisma.connectorHealth.upsert({
      where: {
        userId_connectorId: {
          userId,
          connectorId: normalized,
        },
      },
      update: {
        status: 'down',
        lastError: 'Connector credentials removed.',
        failureStreak: 0,
        tokenExpiresAt: null,
      },
      create: {
        userId,
        connectorId: normalized,
        status: 'down',
        lastError: 'Connector credentials removed.',
        failureStreak: 0,
      },
    })

    return { ok: true as const }
  }

  async fetchGoogle(userId: string, connectorId: string, url: string, init: RequestInit = {}) {
    const normalized = this.normalizeConnectorId(connectorId)
    if (!this.isGoogleConnector(normalized)) {
      throw new BadRequestException(`Connector "${normalized}" is not a Google connector.`)
    }

    const response = await this.performGoogleFetch(userId, normalized, url, init, true)
    if (!response.ok) {
      const body = await this.safeReadBody(response)
      throw new BadRequestException(
        `Google API request failed (${response.status}): ${body.slice(0, 300) || response.statusText}`,
      )
    }
    return response
  }

  async report(userId: string, input: RecordConnectorHealthInput): Promise<ConnectorHealthEntry> {
    const connectorId = this.normalizeConnectorId(input.connectorId)
    const now = new Date()
    const previous = await this.prisma.connectorHealth.findUnique({
      where: {
        userId_connectorId: {
          userId,
          connectorId,
        },
      },
    })

    const latency = this.clampLatency(input.latencyMs)
    const previousP95 = previous?.p95LatencyMs ?? null
    const nextP95 = latency == null
      ? previousP95
      : (previousP95 == null ? latency : Math.round(previousP95 * 0.8 + latency * 0.2))

    const nextFailureStreak = input.success
      ? 0
      : Math.max(1, (previous?.failureStreak ?? 0) + 1)

    const tokenExpiresAt = this.parseIso(input.tokenExpiresAt)
    const status = this.computeStatus({
      baseStatus: input.success ? 'connected' : (nextFailureStreak >= 6 ? 'down' : 'degraded'),
      failureStreak: nextFailureStreak,
      tokenExpiresAt,
      lastFailureAt: input.success ? previous?.lastFailureAt ?? null : now,
      lastSuccessAt: input.success ? now : previous?.lastSuccessAt ?? null,
      rateLimitHits: (previous?.rateLimitHits ?? 0) + (input.rateLimited ? 1 : 0),
    })

    await this.prisma.connectorHealth.upsert({
      where: {
        userId_connectorId: {
          userId,
          connectorId,
        },
      },
      update: {
        status,
        ...(input.success ? { lastSuccessAt: now } : { lastFailureAt: now }),
        ...(input.success ? { lastError: null } : { lastError: this.optionalText(input.error)?.slice(0, 500) ?? 'Connector operation failed.' }),
        tokenExpiresAt,
        p95LatencyMs: nextP95,
        failureStreak: nextFailureStreak,
        rateLimitHits: (previous?.rateLimitHits ?? 0) + (input.rateLimited ? 1 : 0),
        metadata: this.serializeMetadata(input.metadata),
      },
      create: {
        userId,
        connectorId,
        status,
        ...(input.success ? { lastSuccessAt: now } : { lastFailureAt: now }),
        ...(input.success ? {} : { lastError: this.optionalText(input.error)?.slice(0, 500) ?? 'Connector operation failed.' }),
        tokenExpiresAt,
        p95LatencyMs: nextP95,
        failureStreak: nextFailureStreak,
        rateLimitHits: input.rateLimited ? 1 : 0,
        metadata: this.serializeMetadata(input.metadata),
      },
    })

    const snapshot = await this.listHealth(userId)
    const connector = snapshot.connectors.find((entry) => entry.connectorId === connectorId)
    if (!connector) {
      throw new BadRequestException(`Connector "${connectorId}" is not available.`)
    }
    return connector
  }

  async recordToolExecution(
    userId: string,
    toolName: string,
    input: {
      success: boolean
      latencyMs?: number
      error?: string
      rateLimited?: boolean
    },
  ) {
    const connectorId = this.mapToolToConnector(toolName)
    if (!connectorId) return
    await this.report(userId, {
      connectorId,
      success: input.success,
      latencyMs: input.latencyMs,
      error: input.error,
      rateLimited: input.rateLimited,
    })
  }

  async recordWhatsAppActivity(
    userId: string,
    input: {
      success: boolean
      error?: string
    },
  ) {
    await this.recordChannelActivity(userId, 'whatsapp', input)
  }

  async recordChannelActivity(
    userId: string,
    connectorId: KnownConnectorId,
    input: {
      success: boolean
      error?: string
    },
  ) {
    await this.report(userId, {
      connectorId,
      success: input.success,
      error: input.error,
    })
  }

  private toConnectorEntry(input: {
    connectorId: KnownConnectorId
    row: ConnectorHealthRowRecord | null
    connectedTools: ConnectedToolRecord[]
    devices: LinkedChannelRecord[]
    telegramChats: LinkedChannelRecord[]
    slackWorkspaces: LinkedChannelRecord[]
    discordServers: LinkedChannelRecord[]
  }): ConnectorHealthEntry {
    const { connectorId, row } = input
    const catalog = CONNECTOR_CATALOG[connectorId]
    const inferred = this.inferConnectorStateFromLocalData({
      connectorId,
      connectedTools: input.connectedTools,
      devices: input.devices,
      telegramChats: input.telegramChats,
      slackWorkspaces: input.slackWorkspaces,
      discordServers: input.discordServers,
    })

    const status = this.computeStatus({
      baseStatus: this.parseStatus(row?.status) ?? inferred.status,
      failureStreak: row?.failureStreak ?? inferred.failureStreak,
      tokenExpiresAt: row?.tokenExpiresAt ?? null,
      lastFailureAt: row?.lastFailureAt ?? inferred.lastFailureAt,
      lastSuccessAt: row?.lastSuccessAt ?? inferred.lastSuccessAt,
      rateLimitHits: row?.rateLimitHits ?? inferred.rateLimitHits,
    })

    const alerts = this.buildAlerts({
      status,
      tokenExpiresAt: row?.tokenExpiresAt ?? null,
      failureStreak: row?.failureStreak ?? inferred.failureStreak,
      rateLimitHits: row?.rateLimitHits ?? inferred.rateLimitHits,
      lastFailureAt: row?.lastFailureAt ?? inferred.lastFailureAt,
      lastSuccessAt: row?.lastSuccessAt ?? inferred.lastSuccessAt,
    })

    return {
      connectorId,
      displayName: catalog.displayName,
      status,
      lastSuccessAt: (row?.lastSuccessAt ?? inferred.lastSuccessAt)?.toISOString() ?? null,
      lastFailureAt: (row?.lastFailureAt ?? inferred.lastFailureAt)?.toISOString() ?? null,
      lastError: row?.lastError ?? inferred.lastError,
      tokenExpiresAt: row?.tokenExpiresAt?.toISOString() ?? null,
      p95LatencyMs: row?.p95LatencyMs ?? null,
      rateLimitHits: row?.rateLimitHits ?? inferred.rateLimitHits,
      failureStreak: row?.failureStreak ?? inferred.failureStreak,
      alerts,
      updatedAt: row?.updatedAt.toISOString() ?? inferred.updatedAt.toISOString(),
    }
  }

  private inferConnectorStateFromLocalData(input: {
    connectorId: KnownConnectorId
    connectedTools: ConnectedToolRecord[]
    devices: LinkedChannelRecord[]
    telegramChats: LinkedChannelRecord[]
    slackWorkspaces: LinkedChannelRecord[]
    discordServers: LinkedChannelRecord[]
  }) {
    const { connectorId, connectedTools, devices, telegramChats, slackWorkspaces, discordServers } = input
    const now = new Date()
    if (connectorId === 'whatsapp') {
      return this.inferLinkedChannelState('WhatsApp', devices, now)
    }

    if (connectorId === 'telegram') {
      return this.inferLinkedChannelState('Telegram', telegramChats, now)
    }

    if (connectorId === 'slack') {
      return this.inferLinkedChannelState('Slack', slackWorkspaces, now)
    }

    if (connectorId === 'discord') {
      return this.inferLinkedChannelState('Discord', discordServers, now)
    }

    const toolNames = new Set<string>([...CONNECTOR_CATALOG[connectorId].toolNames])
    const relevant = connectedTools.filter((row) => toolNames.has(row.tool.name))
    if (relevant.length === 0) {
      return {
        status: 'down' as const,
        lastSuccessAt: null,
        lastFailureAt: null,
        failureStreak: 0,
        rateLimitHits: 0,
        lastError: 'Connector has no linked tools.',
        updatedAt: now,
      }
    }

    const anyConnected = relevant.some((row) => row.status === 'connected')
    const anyErrored = relevant.some((row) => row.status === 'error')
    const latestConnected = [...relevant]
      .sort((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime())[0]

    return {
      status: anyConnected ? 'connected' as const : (anyErrored ? 'down' as const : 'degraded' as const),
      lastSuccessAt: anyConnected ? latestConnected?.connectedAt ?? null : null,
      lastFailureAt: anyErrored ? now : null,
      failureStreak: anyErrored ? 1 : 0,
      rateLimitHits: 0,
      lastError: anyErrored ? 'Connector reported errors in linked tools.' : null,
      updatedAt: relevant
        .map((row) => row.updatedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? now,
    }
  }

  private inferLinkedChannelState(label: string, records: LinkedChannelRecord[], now: Date) {
    if (records.length === 0) {
      return {
        status: 'down' as const,
        lastSuccessAt: null,
        lastFailureAt: null,
        failureStreak: 0,
        rateLimitHits: 0,
        lastError: `No linked ${label.toLowerCase()} routes.`,
        updatedAt: now,
      }
    }

    const latestSeen = records
      .map((record) => record.lastSeenAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

    const latestLinkedAt = records
      .map((record) => record.linkedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? now

    const recent = latestSeen
      ? now.getTime() - latestSeen.getTime() <= CHANNEL_ACTIVITY_RECENT_WINDOW_HOURS * 60 * 60 * 1000
      : false

    return {
      status: recent ? ('connected' as const) : ('degraded' as const),
      lastSuccessAt: latestSeen,
      lastFailureAt: null,
      failureStreak: 0,
      rateLimitHits: 0,
      lastError: recent ? null : `No ${label} activity in the recent window.`,
      updatedAt: latestSeen ?? latestLinkedAt,
    }
  }

  private buildAlerts(input: {
    status: ConnectorStatus
    tokenExpiresAt: Date | null
    failureStreak: number
    rateLimitHits: number
    lastFailureAt: Date | null
    lastSuccessAt: Date | null
  }): ConnectorHealthAlert[] {
    const alerts: ConnectorHealthAlert[] = []

    if (input.status === 'down') {
      alerts.push({
        code: 'connector_down',
        severity: 'critical',
        message: 'Connector is currently down.',
      })
    }
    if (input.failureStreak >= 6) {
      alerts.push({
        code: 'failure_streak_critical',
        severity: 'critical',
        message: `Connector has failed ${input.failureStreak} times in a row.`,
      })
    } else if (input.failureStreak >= 3) {
      alerts.push({
        code: 'failure_streak_warning',
        severity: 'warning',
        message: `Connector has ${input.failureStreak} consecutive failures.`,
      })
    }

    if (input.rateLimitHits > 0) {
      alerts.push({
        code: 'rate_limited',
        severity: input.rateLimitHits >= 5 ? 'critical' : 'warning',
        message: `Connector hit rate limits ${input.rateLimitHits} time(s).`,
      })
    }

    if (input.tokenExpiresAt) {
      const hoursRemaining = (input.tokenExpiresAt.getTime() - Date.now()) / (60 * 60 * 1000)
      if (hoursRemaining <= 0) {
        alerts.push({
          code: 'token_expired',
          severity: 'critical',
          message: 'Connector token has expired.',
        })
      } else if (hoursRemaining <= TOKEN_EXPIRY_WARNING_HOURS) {
        alerts.push({
          code: 'token_expiring',
          severity: 'warning',
          message: `Connector token expires in ${Math.ceil(hoursRemaining)} hour(s).`,
        })
      }
    }

    if (input.lastFailureAt && (!input.lastSuccessAt || input.lastFailureAt > input.lastSuccessAt)) {
      alerts.push({
        code: 'latest_operation_failed',
        severity: 'warning',
        message: 'Most recent connector operation failed.',
      })
    }

    return alerts
  }

  private computeStatus(input: {
    baseStatus: ConnectorStatus
    failureStreak: number
    tokenExpiresAt: Date | null
    lastFailureAt: Date | null
    lastSuccessAt: Date | null
    rateLimitHits: number
  }): ConnectorStatus {
    if (input.failureStreak >= 6) return 'down'

    const tokenExpired = input.tokenExpiresAt ? input.tokenExpiresAt.getTime() <= Date.now() : false
    if (tokenExpired) return 'down'

    const latestFailed = input.lastFailureAt && (!input.lastSuccessAt || input.lastFailureAt > input.lastSuccessAt)
    if (input.failureStreak >= 3 || latestFailed || input.rateLimitHits >= 3) {
      return input.baseStatus === 'down' ? 'down' : 'degraded'
    }

    const tokenExpiringSoon = input.tokenExpiresAt
      ? (input.tokenExpiresAt.getTime() - Date.now()) <= TOKEN_EXPIRY_WARNING_HOURS * 60 * 60 * 1000
      : false
    if (tokenExpiringSoon && input.baseStatus === 'connected') return 'degraded'

    return input.baseStatus
  }

  private isGoogleConnector(connectorId: KnownConnectorId): connectorId is GoogleConnectorId {
    return connectorId === 'google_gmail' || connectorId === 'google_calendar'
  }

  private normalizeScopes(scopes: string[] | undefined) {
    if (!Array.isArray(scopes)) return []
    const values = new Set<string>()
    for (const scope of scopes) {
      const normalized = this.optionalText(scope)
      if (!normalized) continue
      values.add(normalized)
      if (values.size >= 40) break
    }
    return [...values]
  }

  private normalizeIso(value: string | undefined) {
    const parsed = this.parseIso(value)
    return parsed ? parsed.toISOString() : null
  }

  private async ensureConnectorTools(
    userId: string,
    connectorId: GoogleConnectorId,
    payload: StoredConnectorTokens,
  ) {
    const encryptedTokens = this.encryptTokens(payload)
    for (const toolName of CONNECTOR_CATALOG[connectorId].toolNames) {
      const seed = CONNECTOR_TOOL_SEEDS[toolName]
      const tool = await this.prisma.tool.upsert({
        where: { name: toolName },
        update: {
          displayName: seed.displayName,
          description: seed.description,
          category: seed.category,
          requiresApproval: seed.requiresApproval,
          inputSchema: '{}',
        },
        create: {
          name: toolName,
          displayName: seed.displayName,
          description: seed.description,
          category: seed.category,
          requiresApproval: seed.requiresApproval,
          inputSchema: '{}',
        },
      })

      await this.prisma.connectedTool.upsert({
        where: {
          userId_toolId: {
            userId,
            toolId: tool.id,
          },
        },
        update: {
          status: 'connected',
          encryptedTokens,
        },
        create: {
          userId,
          toolId: tool.id,
          status: 'connected',
          encryptedTokens,
        },
      })
    }
  }

  private async loadStoredTokens(userId: string, connectorId: GoogleConnectorId) {
    const record = await this.prisma.connectedTool.findFirst({
      where: {
        userId,
        tool: {
          name: {
            in: [...CONNECTOR_CATALOG[connectorId].toolNames],
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })
    return this.parseStoredTokens(record?.encryptedTokens ?? null)
  }

  private async persistStoredTokens(
    userId: string,
    connectorId: GoogleConnectorId,
    payload: StoredConnectorTokens,
  ) {
    await this.ensureConnectorTools(userId, connectorId, {
      ...payload,
      updatedAt: new Date().toISOString(),
    })
    await this.prisma.connectorHealth.updateMany({
      where: {
        userId,
        connectorId,
      },
      data: {
        tokenExpiresAt: this.parseIso(payload.tokenExpiresAt),
      },
    })
  }

  private async getValidGoogleAccessToken(userId: string, connectorId: GoogleConnectorId) {
    const stored = await this.loadStoredTokens(userId, connectorId)
    if (!stored?.accessToken) {
      throw new BadRequestException(`Connector "${connectorId}" is not connected.`)
    }

    const expiresAt = this.parseIso(stored.tokenExpiresAt)
    const expiringSoon = expiresAt
      ? (expiresAt.getTime() - Date.now()) <= GOOGLE_TOKEN_REFRESH_WINDOW_MS
      : false
    if (!expiringSoon) {
      return stored.accessToken
    }

    if (!stored.refreshToken) {
      throw new BadRequestException(`Connector "${connectorId}" token expired and no refresh token is available.`)
    }

    const refreshed = await this.refreshGoogleAccessToken(userId, connectorId, stored)
    return refreshed.accessToken
  }

  private async performGoogleFetch(
    userId: string,
    connectorId: GoogleConnectorId,
    url: string,
    init: RequestInit,
    retryOnUnauthorized: boolean,
  ): Promise<Response> {
    const accessToken = await this.getValidGoogleAccessToken(userId, connectorId)
    const headers = new Headers(init.headers ?? {})
    headers.set('Authorization', `Bearer ${accessToken}`)

    const response = await fetch(url, {
      ...init,
      headers,
    })

    if (response.status !== 401 || !retryOnUnauthorized) {
      return response
    }

    const stored = await this.loadStoredTokens(userId, connectorId)
    if (!stored?.refreshToken) {
      return response
    }

    await this.refreshGoogleAccessToken(userId, connectorId, stored)
    return this.performGoogleFetch(userId, connectorId, url, init, false)
  }

  private async refreshGoogleAccessToken(
    userId: string,
    connectorId: GoogleConnectorId,
    stored: StoredConnectorTokens,
  ) {
    const clientId = this.optionalText(process.env.GOOGLE_CLIENT_ID)
    const clientSecret = this.optionalText(process.env.GOOGLE_CLIENT_SECRET)
    if (!clientId || !clientSecret) {
      throw new BadRequestException('Google refresh requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.')
    }
    if (!stored.refreshToken) {
      throw new BadRequestException(`Connector "${connectorId}" has no refresh token.`)
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: stored.refreshToken,
      grant_type: 'refresh_token',
    })

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    if (!response.ok) {
      const errorBody = await this.safeReadBody(response)
      throw new BadRequestException(
        `Google token refresh failed (${response.status}): ${errorBody.slice(0, 300)}`,
      )
    }

    const payload = await response.json() as {
      access_token?: string
      expires_in?: number
      scope?: string
    }
    const accessToken = this.optionalText(payload.access_token)
    if (!accessToken) {
      throw new BadRequestException('Google token refresh returned no access token.')
    }

    const next: StoredConnectorTokens = {
      ...stored,
      accessToken,
      updatedAt: new Date().toISOString(),
      ...(typeof payload.expires_in === 'number'
        ? { tokenExpiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString() }
        : {}),
      ...(this.optionalText(payload.scope)
        ? { scopes: this.normalizeScopes(payload.scope!.split(/\s+/)) }
        : {}),
    }
    await this.persistStoredTokens(userId, connectorId, next)
    return next
  }

  private encryptTokens(payload: StoredConnectorTokens) {
    const key = this.resolveEncryptionKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv)
    const plaintext = JSON.stringify(payload)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return JSON.stringify({
      v: 1,
      iv: iv.toString('base64'),
      tag: authTag.toString('base64'),
      data: encrypted.toString('base64'),
    })
  }

  private parseStoredTokens(raw: string | null | undefined): StoredConnectorTokens | null {
    const value = this.optionalText(raw)
    if (!value) return null
    try {
      const parsed = JSON.parse(value) as { v?: number; iv?: string; tag?: string; data?: string }
      if (parsed && typeof parsed.iv === 'string' && typeof parsed.tag === 'string' && typeof parsed.data === 'string') {
        const decrypted = this.decryptTokens({
          iv: parsed.iv,
          tag: parsed.tag,
          data: parsed.data,
        })
        if (decrypted) return decrypted
      }
    } catch {
      // Fall through to legacy plain JSON parse.
    }

    try {
      const parsed = JSON.parse(value) as Partial<StoredConnectorTokens>
      if (!parsed || typeof parsed !== 'object') return null
      const accessToken = this.optionalText(parsed.accessToken)
      if (!accessToken) return null
      return {
        accessToken,
        ...(this.optionalText(parsed.refreshToken) ? { refreshToken: this.optionalText(parsed.refreshToken)! } : {}),
        ...(this.normalizeIso(parsed.tokenExpiresAt) ? { tokenExpiresAt: this.normalizeIso(parsed.tokenExpiresAt)! } : {}),
        scopes: this.normalizeScopes(parsed.scopes),
        ...(this.optionalText(parsed.accountEmail) ? { accountEmail: this.optionalText(parsed.accountEmail)! } : {}),
        connectedAt: this.normalizeIso(parsed.connectedAt) ?? new Date().toISOString(),
        updatedAt: this.normalizeIso(parsed.updatedAt) ?? new Date().toISOString(),
      }
    } catch {
      return null
    }
  }

  private decryptTokens(payload: { iv: string; tag: string; data: string }) {
    try {
      const key = this.resolveEncryptionKey()
      const decipher = createDecipheriv(
        ENCRYPTION_ALGORITHM,
        key,
        Buffer.from(payload.iv, 'base64'),
      )
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.data, 'base64')),
        decipher.final(),
      ]).toString('utf8')
      const parsed = JSON.parse(decrypted) as Partial<StoredConnectorTokens>
      const accessToken = this.optionalText(parsed.accessToken)
      if (!accessToken) return null
      return {
        accessToken,
        ...(this.optionalText(parsed.refreshToken) ? { refreshToken: this.optionalText(parsed.refreshToken)! } : {}),
        ...(this.normalizeIso(parsed.tokenExpiresAt) ? { tokenExpiresAt: this.normalizeIso(parsed.tokenExpiresAt)! } : {}),
        scopes: this.normalizeScopes(parsed.scopes),
        ...(this.optionalText(parsed.accountEmail) ? { accountEmail: this.optionalText(parsed.accountEmail)! } : {}),
        connectedAt: this.normalizeIso(parsed.connectedAt) ?? new Date().toISOString(),
        updatedAt: this.normalizeIso(parsed.updatedAt) ?? new Date().toISOString(),
      }
    } catch {
      return null
    }
  }

  private resolveEncryptionKey() {
    const raw = this.optionalText(process.env.ENCRYPTION_KEY) ?? 'openagents-local-dev-key'
    const normalizedHex = raw.replace(/^0x/i, '')
    if (/^[0-9a-f]{64}$/i.test(normalizedHex)) {
      return Buffer.from(normalizedHex, 'hex')
    }
    return createHash('sha256').update(raw).digest()
  }

  private async safeReadBody(response: Response) {
    try {
      return await response.text()
    } catch {
      return ''
    }
  }

  private parseStatus(value: string | null | undefined): ConnectorStatus | null {
    if (value === 'connected' || value === 'degraded' || value === 'down') return value
    return null
  }

  private normalizeConnectorId(raw: string): KnownConnectorId {
    const value = raw.trim().toLowerCase()
    if (value in CONNECTOR_CATALOG) return value as KnownConnectorId
    throw new BadRequestException(`Unsupported connector id: ${raw}`)
  }

  private mapToolToConnector(toolName: string): KnownConnectorId | null {
    const value = toolName.trim().toLowerCase()
    if (this.gmailTools.has(value)) return 'google_gmail'
    if (this.calendarTools.has(value)) return 'google_calendar'
    return null
  }

  private clampLatency(value: number | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    const rounded = Math.round(value)
    return Math.max(0, Math.min(rounded, MAX_LATENCY_MS))
  }

  private parseIso(value: string | undefined) {
    if (!value) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private serializeMetadata(value: Record<string, unknown> | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  }
}
