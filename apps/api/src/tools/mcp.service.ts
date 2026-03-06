import { createHash } from 'node:crypto'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  CallToolResultSchema,
  type CallToolResult,
  type CompatibilityCallToolResult,
  type Tool as McpTool,
} from '@modelcontextprotocol/sdk/types.js'
import { API_VERSION, type ToolResult } from '@openagents/shared'
import type { ToolDefinition } from './tools.service'

type McpStdioMode = 'inherit' | 'ignore' | 'pipe'

interface McpServerConfig {
  id: string
  displayName: string
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  enabled: boolean
  stderr: McpStdioMode
  timeoutMs: number
}

interface McpRegisteredTool {
  def: ToolDefinition
  serverId: string
  originalName: string
}

interface McpServerState {
  config: McpServerConfig
  client: Client | null
  transport: StdioClientTransport | null
  tools: McpRegisteredTool[] | null
  connectPromise: Promise<void> | null
  listPromise: Promise<McpRegisteredTool[]> | null
}

@Injectable()
export class McpService implements OnModuleDestroy {
  private readonly logger = new Logger(McpService.name)
  private readonly defaultTimeoutMs: number
  private readonly serverConfigs: McpServerConfig[]
  private readonly serverStates = new Map<string, McpServerState>()
  private readonly toolIndex = new Map<string, McpRegisteredTool>()

  constructor(private readonly config: ConfigService) {
    this.defaultTimeoutMs = this.readTimeoutMs(
      this.config.get<string>('MCP_REQUEST_TIMEOUT_MS'),
      20_000,
    )
    this.serverConfigs = this.loadServerConfigs()

    for (const serverConfig of this.serverConfigs) {
      this.serverStates.set(serverConfig.id, {
        config: serverConfig,
        client: null,
        transport: null,
        tools: null,
        connectPromise: null,
        listPromise: null,
      })
    }

    if (this.serverConfigs.length > 0) {
      this.logger.log(
        `Loaded ${this.serverConfigs.length} MCP server configuration(s): ${this.serverConfigs.map((server) => server.id).join(', ')}`,
      )
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled(
      [...this.serverStates.values()].map((state) => this.disposeState(state)),
    )
  }

  isEnabled() {
    return this.serverConfigs.length > 0
  }

  async listToolDefinitions(): Promise<ToolDefinition[]> {
    if (!this.isEnabled()) return []

    const settled = await Promise.allSettled(
      this.serverConfigs.map(async (serverConfig) => {
        const tools = await this.listToolsForServer(serverConfig.id)
        return tools.map((tool) => tool.def)
      }),
    )

    const definitions: ToolDefinition[] = []
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        definitions.push(...result.value)
      }
    }
    return definitions
  }

  async hasTool(toolName: string) {
    return Boolean(await this.findTool(toolName))
  }

  async execute(toolName: string, input: Record<string, unknown>, _userId: string): Promise<ToolResult> {
    const tool = await this.findTool(toolName)
    if (!tool) {
      return { success: false, output: null, error: `Unknown MCP tool: ${toolName}` }
    }

    const state = this.requireState(tool.serverId)

    try {
      await this.ensureConnected(state)
      const response = await state.client!.callTool(
        {
          name: tool.originalName,
          arguments: input,
        },
        CallToolResultSchema,
        { timeout: state.config.timeoutMs },
      )

      return this.normalizeToolResult(tool, response)
    } catch (error) {
      const message = this.safeError(error)
      await this.disposeState(state)
      return {
        success: false,
        output: null,
        error: `MCP ${tool.serverId}/${tool.originalName} failed: ${message}`,
      }
    }
  }

  private async findTool(toolName: string) {
    const cached = this.toolIndex.get(toolName)
    if (cached) return cached

    await this.listToolDefinitions()
    return this.toolIndex.get(toolName) ?? null
  }

  private async listToolsForServer(serverId: string): Promise<McpRegisteredTool[]> {
    const state = this.requireState(serverId)
    if (state.tools) return state.tools
    if (state.listPromise) return state.listPromise

    state.listPromise = this.fetchToolsForServer(state)
    try {
      return await state.listPromise
    } finally {
      state.listPromise = null
    }
  }

  private async fetchToolsForServer(state: McpServerState): Promise<McpRegisteredTool[]> {
    await this.ensureConnected(state)

    try {
      const response = await state.client!.listTools(undefined, { timeout: state.config.timeoutMs })
      const tools = response.tools.map((tool) => this.toRegisteredTool(state.config, tool))
      state.tools = tools
      this.replaceToolIndexForServer(state.config.id, tools)
      return tools
    } catch (error) {
      this.logger.warn(`Failed to load MCP tools from ${state.config.id}: ${this.safeError(error)}`)
      await this.disposeState(state)
      return []
    }
  }

  private async ensureConnected(state: McpServerState) {
    if (state.client && state.transport) return
    if (state.connectPromise) {
      await state.connectPromise
      return
    }

    state.connectPromise = this.connectState(state)
    try {
      await state.connectPromise
    } finally {
      state.connectPromise = null
    }
  }

  private async connectState(state: McpServerState) {
    const transport = new StdioClientTransport({
      command: state.config.command,
      args: state.config.args,
      ...(state.config.cwd ? { cwd: state.config.cwd } : {}),
      ...(state.config.env ? { env: state.config.env } : {}),
      stderr: state.config.stderr,
    })
    const client = new Client(
      { name: 'openagents-mcp-client', version: API_VERSION },
      { capabilities: {} },
    )

    if (transport.stderr && 'on' in transport.stderr) {
      transport.stderr.on('data', (chunk: Buffer | string) => {
        const text = String(chunk ?? '').trim()
        if (!text) return
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed) continue
          this.logger.warn(`[MCP:${state.config.id}] ${trimmed.slice(0, 500)}`)
        }
      })
    }

    transport.onclose = () => {
      if (state.transport !== transport) return
      this.logger.warn(`MCP server connection closed: ${state.config.id}`)
      this.clearState(state)
    }
    transport.onerror = (error) => {
      if (state.transport !== transport) return
      this.logger.warn(`MCP transport error (${state.config.id}): ${this.safeError(error)}`)
    }

    try {
      await client.connect(transport, { timeout: state.config.timeoutMs })
      state.client = client
      state.transport = transport
      state.tools = null
    } catch (error) {
      await transport.close().catch(() => {})
      this.clearState(state)
      throw error
    }
  }

  private async disposeState(state: McpServerState) {
    const transport = state.transport
    this.clearState(state)
    if (transport) {
      await transport.close().catch(() => {})
    }
  }

  private clearState(state: McpServerState) {
    state.client = null
    state.transport = null
    state.tools = null
    state.connectPromise = null
    state.listPromise = null
    this.replaceToolIndexForServer(state.config.id, [])
  }

  private replaceToolIndexForServer(serverId: string, tools: McpRegisteredTool[]) {
    for (const [toolName, tool] of this.toolIndex.entries()) {
      if (tool.serverId === serverId) {
        this.toolIndex.delete(toolName)
      }
    }

    for (const tool of tools) {
      this.toolIndex.set(tool.def.name, tool)
    }
  }

  private toRegisteredTool(serverConfig: McpServerConfig, tool: McpTool): McpRegisteredTool {
    const originalName = tool.name.trim()
    const exposedName = this.buildToolName(serverConfig.id, originalName)
    const title = tool.title?.trim() || tool.annotations?.title?.trim() || originalName
    const descriptionParts = [
      tool.description?.trim() || `Tool exposed by MCP server "${serverConfig.displayName}".`,
      `MCP server: ${serverConfig.displayName}. Original tool: ${originalName}.`,
    ].filter(Boolean)

    return {
      serverId: serverConfig.id,
      originalName,
      def: {
        name: exposedName,
        displayName: `${serverConfig.displayName} / ${title}`,
        description: descriptionParts.join(' '),
        requiresApproval: tool.annotations?.readOnlyHint === true ? false : true,
        inputSchema: this.normalizeInputSchema(tool.inputSchema),
        source: 'mcp',
        serverId: serverConfig.id,
        originalName,
      },
    }
  }

  private normalizeToolResult(
    tool: McpRegisteredTool,
    response: CallToolResult | CompatibilityCallToolResult,
  ): ToolResult {
    if ('toolResult' in response) {
      return {
        success: true,
        output: {
          serverId: tool.serverId,
          tool: tool.originalName,
          result: response.toolResult,
        },
      }
    }

    const blocks = response.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: this.clip(block.text, 4_000) }
      }
      if (block.type === 'image') {
        return {
          type: 'image' as const,
          mimeType: block.mimeType,
          bytes: this.estimateBase64Bytes(block.data),
        }
      }
      if (block.type === 'audio') {
        return {
          type: 'audio' as const,
          mimeType: block.mimeType,
          bytes: this.estimateBase64Bytes(block.data),
        }
      }
      if (block.type === 'resource') {
        const resource = block.resource
        if ('text' in resource) {
          return {
            type: 'resource' as const,
            uri: resource.uri,
            mimeType: resource.mimeType ?? null,
            text: this.clip(resource.text, 4_000),
          }
        }
        return {
          type: 'resource' as const,
          uri: resource.uri,
          mimeType: resource.mimeType ?? null,
          bytes: this.estimateBase64Bytes(resource.blob),
        }
      }
      return {
        type: 'resource_link' as const,
        uri: block.uri,
        name: block.name,
        description: block.description ?? null,
        mimeType: block.mimeType ?? null,
      }
    })

    const text = blocks
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n')
      .trim()

    const output: Record<string, unknown> = {
      serverId: tool.serverId,
      tool: tool.originalName,
    }
    if (text) output.text = text
    if (blocks.length > 0) output.content = blocks
    if (response.structuredContent !== undefined) {
      output.structuredContent = response.structuredContent
    }

    return {
      success: !response.isError,
      output,
      ...(response.isError
        ? { error: text || `MCP tool ${tool.originalName} reported an error.` }
        : {}),
    }
  }

  private buildToolName(serverId: string, originalName: string) {
    const sanitize = (value: string) => value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')

    const base = sanitize(`mcp_${serverId}_${originalName}`) || 'mcp_tool'
    if (base.length <= 64) return base

    const hash = createHash('sha1')
      .update(`${serverId}:${originalName}`)
      .digest('hex')
      .slice(0, 8)

    return `${base.slice(0, 55)}_${hash}`
  }

  private normalizeInputSchema(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { type: 'object', properties: {} }
    }
    return value as Record<string, unknown>
  }

  private loadServerConfigs(): McpServerConfig[] {
    const raw = this.config.get<string>('MCP_SERVERS_JSON')
      ?? this.config.get<string>('MCP_SERVERS')
      ?? ''
    if (!raw.trim()) return []

    try {
      const parsed = JSON.parse(raw) as unknown
      const entries = Array.isArray(parsed)
        ? parsed.map((value, index) => [undefined, value] as const)
        : (parsed && typeof parsed === 'object'
          ? Object.entries(parsed as Record<string, unknown>)
          : [])

      const configs = entries
        .map(([key, value], index) => this.normalizeServerConfig(value, key ?? `server-${index + 1}`))
        .filter((config): config is McpServerConfig => Boolean(config && config.enabled))

      return configs
    } catch (error) {
      this.logger.error(`Failed to parse MCP_SERVERS_JSON: ${this.safeError(error)}`)
      return []
    }
  }

  private normalizeServerConfig(value: unknown, fallbackId: string): McpServerConfig | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.logger.warn(`Skipping MCP server config "${fallbackId}" because it is not an object.`)
      return null
    }

    const record = value as Record<string, unknown>
    const id = this.normalizeIdentifier(record.id ?? fallbackId)
    const command = this.optionalText(record.command)
    if (!command) {
      this.logger.warn(`Skipping MCP server "${id}" because command is missing.`)
      return null
    }

    const args = Array.isArray(record.args)
      ? record.args
        .map((entry) => this.optionalText(entry))
        .filter((entry): entry is string => Boolean(entry))
      : []
    const displayName = this.optionalText(record.displayName) ?? id
    const cwd = this.normalizeCwd(record.cwd)
    const env = this.normalizeEnv(record.env)
    const enabled = record.enabled === undefined ? true : Boolean(record.enabled)
    const stderr = this.normalizeStderrMode(record.stderr)
    const timeoutMs = this.readTimeoutMs(record.timeoutMs, this.defaultTimeoutMs)

    return {
      id,
      displayName,
      command,
      args,
      ...(cwd ? { cwd } : {}),
      ...(env ? { env } : {}),
      enabled,
      stderr,
      timeoutMs,
    }
  }

  private normalizeEnv(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

    const out: Record<string, string> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = this.optionalText(key)
      const normalizedValue = this.optionalText(raw)
      if (!normalizedKey || normalizedValue == null) continue
      out[normalizedKey] = this.resolveEnvPlaceholders(normalizedValue)
    }

    return Object.keys(out).length > 0 ? out : undefined
  }

  private resolveEnvPlaceholders(value: string) {
    return value.replace(/\$(?:\{([A-Za-z0-9_]+)\}|([A-Za-z0-9_]+))/g, (_full, braced, bare) => {
      const key = braced || bare
      return process.env[key] ?? ''
    })
  }

  private normalizeCwd(value: unknown) {
    const cwd = this.optionalText(value)
    if (!cwd) return undefined
    return isAbsolute(cwd) ? cwd : resolvePath(process.cwd(), cwd)
  }

  private normalizeIdentifier(value: unknown) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)

    return normalized || 'mcp-server'
  }

  private normalizeStderrMode(value: unknown): McpStdioMode {
    const normalized = this.optionalText(value)?.toLowerCase()
    if (normalized === 'inherit' || normalized === 'ignore' || normalized === 'pipe') {
      return normalized
    }
    return 'pipe'
  }

  private readTimeoutMs(value: unknown, fallback: number) {
    const parsed = typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? ''), 10)

    if (!Number.isFinite(parsed)) return fallback
    return Math.max(1_000, Math.min(Math.round(parsed), 120_000))
  }

  private estimateBase64Bytes(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return 0
    return Math.ceil((trimmed.length * 3) / 4)
  }

  private requireState(serverId: string) {
    const state = this.serverStates.get(serverId)
    if (!state) {
      throw new Error(`Unknown MCP server: ${serverId}`)
    }
    return state
  }

  private clip(value: string, limit: number) {
    if (value.length <= limit) return value
    return `${value.slice(0, Math.max(0, limit - 3))}...`
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
  }
}
