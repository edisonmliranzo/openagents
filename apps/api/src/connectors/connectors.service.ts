import { BadRequestException, Injectable } from '@nestjs/common'
import type {
  ConnectorHealthAlert,
  ConnectorHealthEntry,
  ConnectorHealthSnapshot,
  ConnectorStatus,
  ReconnectConnectorResult,
  RecordConnectorHealthInput,
} from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'

const TOKEN_EXPIRY_WARNING_HOURS = 72
const WHATSAPP_RECENT_WINDOW_HOURS = 24
const MAX_LATENCY_MS = 120_000

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
} as const

type KnownConnectorId = keyof typeof CONNECTOR_CATALOG

@Injectable()
export class ConnectorsService {
  private readonly gmailTools = new Set<string>([...CONNECTOR_CATALOG.google_gmail.toolNames])
  private readonly calendarTools = new Set<string>([...CONNECTOR_CATALOG.google_calendar.toolNames])

  constructor(private prisma: PrismaService) {}

  async listHealth(userId: string): Promise<ConnectorHealthSnapshot> {
    const connectorIds = Object.keys(CONNECTOR_CATALOG) as KnownConnectorId[]
    const [rows, connectedTools, devices] = await Promise.all([
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
        orderBy: { lastSeenAt: 'desc' },
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
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return {
      connectors: entries,
      generatedAt: new Date().toISOString(),
    }
  }

  async reconnect(userId: string, connectorId: string): Promise<ReconnectConnectorResult> {
    const normalized = this.normalizeConnectorId(connectorId)
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
    await this.report(userId, {
      connectorId: 'whatsapp',
      success: input.success,
      error: input.error,
    })
  }

  private toConnectorEntry(input: {
    connectorId: KnownConnectorId
    row: {
      status: string
      lastSuccessAt: Date | null
      lastFailureAt: Date | null
      lastError: string | null
      tokenExpiresAt: Date | null
      p95LatencyMs: number | null
      rateLimitHits: number
      failureStreak: number
      updatedAt: Date
    } | null
    connectedTools: Array<{
      status: string
      connectedAt: Date
      updatedAt: Date
      tool: { name: string }
    }>
    devices: Array<{
      lastSeenAt: Date | null
      linkedAt: Date
    }>
  }): ConnectorHealthEntry {
    const { connectorId, row } = input
    const catalog = CONNECTOR_CATALOG[connectorId]
    const inferred = this.inferConnectorStateFromLocalData(connectorId, input.connectedTools, input.devices)

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

  private inferConnectorStateFromLocalData(
    connectorId: KnownConnectorId,
    connectedTools: Array<{
      status: string
      connectedAt: Date
      updatedAt: Date
      tool: { name: string }
    }>,
    devices: Array<{
      lastSeenAt: Date | null
      linkedAt: Date
    }>,
  ) {
    const now = new Date()
    if (connectorId === 'whatsapp') {
      if (devices.length === 0) {
        return {
          status: 'down' as const,
          lastSuccessAt: null,
          lastFailureAt: null,
          failureStreak: 0,
          rateLimitHits: 0,
          lastError: null,
          updatedAt: now,
        }
      }

      const recent = devices.find((device) => {
        if (!device.lastSeenAt) return false
        return now.getTime() - device.lastSeenAt.getTime() <= WHATSAPP_RECENT_WINDOW_HOURS * 60 * 60 * 1000
      })
      const latestSeen = devices.find((device) => device.lastSeenAt)?.lastSeenAt ?? null
      return {
        status: recent ? ('connected' as const) : ('degraded' as const),
        lastSuccessAt: latestSeen,
        lastFailureAt: null,
        failureStreak: 0,
        rateLimitHits: 0,
        lastError: recent ? null : 'No WhatsApp activity in the recent window.',
        updatedAt: latestSeen ?? devices[0].linkedAt,
      }
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

  private parseStatus(value: string | null | undefined): ConnectorStatus | null {
    if (value === 'connected' || value === 'degraded' || value === 'down') return value
    return null
  }

  private normalizeConnectorId(raw: string): KnownConnectorId {
    const value = raw.trim().toLowerCase()
    if (value === 'google_gmail' || value === 'google_calendar' || value === 'whatsapp') return value
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
