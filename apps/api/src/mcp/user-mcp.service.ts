import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EncryptionService } from '../security/encryption.service'
import { McpService } from '../tools/mcp.service'
import { assertPublicHttpUrl } from '../frontier/safe-fetch'

export interface UserMcpServerView {
  id: string
  name: string
  transport: 'stdio' | 'http'
  enabled: boolean
  command?: string
  args: string[]
  /** Non-secret env var names the user may see. Values are never returned. */
  envKeys: string[]
  url?: string
  /** Non-secret header names. */
  headerNames: string[]
  toolCount: number
  lastStatus: string
  lastError: string | null
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

const MAX_SERVERS = 25
const SECRET_MAX = 16_000

/**
 * User-managed MCP servers.
 *
 * Every user can connect their own MCP servers (stdio or HTTP). Secret values
 * (env vars, auth headers) are encrypted at rest and never returned — the UI
 * only sees the field names, exactly like the Secure Vault. Connection moves
 * are published on an SSE stream so the UI updates in real time.
 */
@Injectable()
export class UserMcpService {
  private readonly logger = new Logger(UserMcpService.name)

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private mcp: McpService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async list(userId: string): Promise<UserMcpServerView[]> {
    const rows = await this.prisma.mcpServerConfig.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toView(row))
  }

  async get(userId: string, id: string): Promise<UserMcpServerView> {
    const row = await this.prisma.mcpServerConfig.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('MCP server not found')
    return this.toView(row)
  }

  async create(
    userId: string,
    input: {
      name: string
      transport?: 'stdio' | 'http'
      command?: string
      args?: string[]
      cwd?: string
      env?: Record<string, string>
      secretEnv?: Record<string, string>
      url?: string
      headers?: Record<string, string>
      secretHeaders?: Record<string, string>
      enabled?: boolean
    },
    userRole?: string,
  ) {
    const name = String(input.name ?? '').trim().slice(0, 80)
    if (!name) throw new BadRequestException('Server name is required.')
    const transport = input.transport ?? 'stdio'
    if (transport === 'http') {
      if (!input.url?.trim()) {
        throw new BadRequestException('An http server needs a url.')
      }
      await assertPublicHttpUrl(input.url.trim()).catch((err) => {
        throw new BadRequestException(err instanceof Error ? err.message : 'Invalid or private MCP server URL.')
      })
    } else {
      if (userRole !== 'owner') {
        throw new ForbiddenException('Only workspace owners can register local stdio command MCP servers.')
      }
      if (!input.command?.trim()) {
        throw new BadRequestException('A stdio server needs a command.')
      }
    }

    const count = await this.prisma.mcpServerConfig.count({ where: { userId } })
    if (count >= MAX_SERVERS) throw new BadRequestException(`Server limit reached (${MAX_SERVERS}).`)

    const row = await this.prisma.mcpServerConfig.create({
      data: {
        userId,
        name,
        transport: input.transport ?? 'stdio',
        enabled: input.enabled ?? true,
        command: input.transport === 'http' ? null : (input.command?.trim() ?? null),
        args: JSON.parse(JSON.stringify(input.args ?? [])),
        cwd: input.cwd?.trim() || null,
        env: JSON.parse(JSON.stringify(input.env ?? {})),
        secretEnv: this.encryptMap(input.secretEnv),
        url: input.transport === 'http' ? input.url?.trim() ?? null : null,
        headers: JSON.parse(JSON.stringify(input.headers ?? {})),
        secretHeaders: this.encryptMap(input.secretHeaders),
      },
    })

    this.logger.log(`User ${userId} added MCP server "${name}"`)
    return this.toView(row)
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<{
      name: string
      enabled: boolean
      command: string
      args: string[]
      cwd: string
      env: Record<string, string>
      secretEnv: Record<string, string>
      url: string
      headers: Record<string, string>
      secretHeaders: Record<string, string>
      transport: 'stdio' | 'http'
    }>,
    userRole?: string,
  ) {
    const row = await this.prisma.mcpServerConfig.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('MCP server not found')

    const nextTransport = patch.transport ?? (row.transport === 'http' ? 'http' : 'stdio')
    if (nextTransport === 'stdio' && (patch.command !== undefined || patch.args !== undefined || patch.transport === 'stdio')) {
      if (userRole !== 'owner') {
        throw new ForbiddenException('Only workspace owners can configure local stdio command MCP servers.')
      }
    }
    if (patch.url !== undefined && patch.url.trim()) {
      await assertPublicHttpUrl(patch.url.trim()).catch((err) => {
        throw new BadRequestException(err instanceof Error ? err.message : 'Invalid or private MCP server URL.')
      })
    }

    const data: Record<string, unknown> = {}
    if (patch.name !== undefined) data.name = String(patch.name).trim().slice(0, 80) || row.name
    if (patch.enabled !== undefined) data.enabled = patch.enabled
    if (patch.command !== undefined) data.command = patch.command?.trim() || null
    if (patch.args !== undefined) data.args = JSON.parse(JSON.stringify(patch.args))
    if (patch.cwd !== undefined) data.cwd = patch.cwd?.trim() || null
    if (patch.env !== undefined) data.env = JSON.parse(JSON.stringify(patch.env))
    if (patch.secretEnv !== undefined) data.secretEnv = this.encryptMap(patch.secretEnv)
    if (patch.url !== undefined) data.url = patch.url?.trim() || null
    if (patch.headers !== undefined) data.headers = JSON.parse(JSON.stringify(patch.headers))
    if (patch.secretHeaders !== undefined) data.secretHeaders = this.encryptMap(patch.secretHeaders)
    if (patch.transport !== undefined) data.transport = patch.transport

    const updated = await this.prisma.mcpServerConfig.update({ where: { id }, data })
    return this.toView(updated)
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const row = await this.prisma.mcpServerConfig.findFirst({ where: { id, userId } })
    if (!row) return false
    await this.mcp.removeUserServer(userId, this.mcp.buildUserServerId(userId, row.id))
    await this.prisma.mcpServerConfig.delete({ where: { id } })
    this.mcp.publishUserStatus(userId, {
      serverId: row.id,
      serverName: row.name,
      status: 'removed',
    })
    return true
  }

  // ── Connect / test / live status ──────────────────────────────────────────

  /** Connects (or reconnects) a user's server and discovers its tools. */
  async connect(userId: string, id: string) {
    const row = await this.prisma.mcpServerConfig.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('MCP server not found')
    if (row.url) {
      await assertPublicHttpUrl(row.url).catch((err) => {
        throw new BadRequestException(err instanceof Error ? err.message : 'Invalid or private MCP server URL.')
      })
    }

    this.mcp.publishUserStatus(userId, { serverId: row.id, serverName: row.name, status: 'connecting' })

    const env = { ...(row.env as Record<string, string>), ...this.decryptMap(row.secretEnv as Record<string, string>) }
    const headers = { ...(row.headers as Record<string, string>), ...this.decryptMap(row.secretHeaders as Record<string, string>) }

    const result = await this.mcp.connectUserServer(userId, {
      serverId: row.id,
      name: row.name,
      command: row.command ?? undefined,
      args: row.args as string[],
      env,
      url: row.url ?? undefined,
      headers,
      // Discovery can be slow on first run (npx installs the server package);
      // allow up to two minutes for the handshake and tool listing.
      timeoutMs: 120_000,
    })

    await this.prisma.mcpServerConfig.update({
      where: { id },
      data: {
        toolCount: result.toolCount ?? 0,
        lastStatus: result.ok ? 'connected' : 'error',
        lastError: result.ok ? null : (result.error ?? 'Connection failed'),
        lastUsedAt: new Date(),
      },
    })

    this.mcp.publishUserStatus(userId, {
      serverId: row.id,
      serverName: row.name,
      status: result.ok ? 'connected' : 'error',
      toolCount: result.toolCount,
      error: result.ok ? undefined : result.error,
    })

    return { ok: result.ok, toolCount: result.toolCount, error: result.error, tools: result.tools }
  }

  /** Connects without persisting state — used by the "test" button. */
  async test(userId: string, id: string) {
    const row = await this.prisma.mcpServerConfig.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('MCP server not found')
    if (row.url) {
      await assertPublicHttpUrl(row.url).catch((err) => {
        throw new BadRequestException(err instanceof Error ? err.message : 'Invalid or private MCP server URL.')
      })
    }

    const env = { ...(row.env as Record<string, string>), ...this.decryptMap(row.secretEnv as Record<string, string>) }
    const headers = { ...(row.headers as Record<string, string>), ...this.decryptMap(row.secretHeaders as Record<string, string>) }

    const result = await this.mcp.connectUserServer(userId, {
      serverId: `test-${row.id}-${Date.now()}`,
      name: `${row.name} (test)`,
      command: row.command ?? undefined,
      args: row.args as string[],
      env,
      url: row.url ?? undefined,
      headers,
      timeoutMs: 120_000,
    })

    // Never leave the throwaway test server registered.
    await this.mcp.removeUserServer(userId, result.serverId).catch(() => undefined)

    if (!result.ok) throw new Error(result.error || 'Connection failed')
    return { ok: true, toolCount: result.toolCount, tools: result.tools }
  }

  /** Tools a user's server exposes right now. */
  async serverTools(userId: string, id: string) {
    const row = await this.prisma.mcpServerConfig.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('MCP server not found')
    const idNamespace = this.mcp.buildUserServerId(userId, row.id)
    const tools = await this.mcp.listServerTools(idNamespace)
    return tools.map((t) => t.def)
  }

  /** Subscribe to a user's live MCP status events. */
  subscribe(userId: string, cb: (event: unknown) => void): () => void {
    return this.mcp.subscribeStatus(userId, cb)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private encryptMap(map?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(map ?? {})) {
      const trimmedKey = key.trim()
      const strValue = String(value ?? '')
      if (!trimmedKey || !strValue) continue
      if (strValue.length > SECRET_MAX) throw new Error(`Secret "${trimmedKey}" is too large.`)
      out[trimmedKey] = this.encryption.encryptApiKey(strValue)
    }
    return out
  }

  private decryptMap(encrypted: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(encrypted ?? {})) {
      const plain = this.decryptSecretValue(value)
      if (typeof plain === 'string') out[key] = plain
    }
    return out
  }

  private decryptSecretValue(stored: string): string | null {
    try {
      return this.encryption.decryptApiKey(stored)
    } catch {
      return null
    }
  }

  private toView(row: {
    id: string
    name: string
    transport: string
    enabled: boolean
    command: string | null
    args: unknown
    env: unknown
    secretEnv: unknown
    url: string | null
    headers: unknown
    secretHeaders: unknown
    toolCount: number
    lastStatus: string
    lastError: string | null
    lastUsedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): UserMcpServerView {
    return {
      id: row.id,
      name: row.name,
      transport: row.transport === 'http' ? 'http' : 'stdio',
      enabled: row.enabled,
      command: row.command ?? undefined,
      args: Array.isArray(row.args) ? (row.args as string[]) : [],
      envKeys: Object.keys((row.env as Record<string, unknown>) ?? {}),
      url: row.url ?? undefined,
      headerNames: Object.keys((row.headers as Record<string, unknown>) ?? {}),
      toolCount: row.toolCount,
      lastStatus: row.lastStatus,
      lastError: row.lastError,
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}