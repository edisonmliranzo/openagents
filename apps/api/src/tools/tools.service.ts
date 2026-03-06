import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { GmailTool } from './connectors/gmail.tool'
import { CalendarTool } from './connectors/calendar.tool'
import { WebFetchTool } from './connectors/web-fetch.tool'
import { NotesTool } from './connectors/notes.tool'
import { WebSearchTool } from './connectors/web-search.tool'
import { TimeTool } from './connectors/time.tool'
import { CronTool } from './connectors/cron.tool'
import { BybitTool } from './connectors/bybit.tool'
import { DeepResearchTool } from './connectors/deep-research.tool'
import { ComputerUseTool } from './connectors/computer-use.tool'
import type { ToolResult } from '@openagents/shared'
import { ConnectorsService } from '../connectors/connectors.service'
import { McpService } from './mcp.service'

export interface ToolDefinition {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
  source?: 'builtin' | 'mcp'
  serverId?: string
  originalName?: string
}

@Injectable()
export class ToolsService {
  private registry: Map<string, { def: ToolDefinition; execute: (input: any, userId: string) => Promise<ToolResult> }>

  constructor(
    private prisma: PrismaService,
    private connectors: ConnectorsService,
    private gmail: GmailTool,
    private calendar: CalendarTool,
    private webFetch: WebFetchTool,
    private notes: NotesTool,
    private webSearch: WebSearchTool,
    private time: TimeTool,
    private cron: CronTool,
    private bybit: BybitTool,
    private deepResearch: DeepResearchTool,
    private computerUse: ComputerUseTool,
    private mcp: McpService,
  ) {
    this.registry = new Map([
      ['gmail_search', { def: this.withBuiltinSource(this.gmail.searchDef), execute: this.gmail.search.bind(this.gmail) }],
      ['gmail_draft_reply', { def: this.withBuiltinSource(this.gmail.draftReplyDef), execute: this.gmail.draftReply.bind(this.gmail) }],
      ['calendar_get_availability', { def: this.withBuiltinSource(this.calendar.availabilityDef), execute: this.calendar.getAvailability.bind(this.calendar) }],
      ['calendar_create_event', { def: this.withBuiltinSource(this.calendar.createEventDef), execute: this.calendar.createEvent.bind(this.calendar) }],
      ['web_fetch', { def: this.withBuiltinSource(this.webFetch.def), execute: this.webFetch.fetch.bind(this.webFetch) }],
      ['web_search', { def: this.withBuiltinSource(this.webSearch.def), execute: this.webSearch.search.bind(this.webSearch) }],
      ['get_current_time', { def: this.withBuiltinSource(this.time.def), execute: this.time.getCurrentTime.bind(this.time) }],
      ['cron_add', { def: this.withBuiltinSource(this.cron.addDef), execute: this.cron.add.bind(this.cron) }],
      ['cron_list', { def: this.withBuiltinSource(this.cron.listDef), execute: this.cron.list.bind(this.cron) }],
      ['cron_remove', { def: this.withBuiltinSource(this.cron.removeDef), execute: this.cron.remove.bind(this.cron) }],
      ['notes_create', { def: this.withBuiltinSource(this.notes.createDef), execute: this.notes.create.bind(this.notes) }],
      ['notes_list', { def: this.withBuiltinSource(this.notes.listDef), execute: this.notes.list.bind(this.notes) }],
      ['bybit_get_ticker', { def: this.withBuiltinSource(this.bybit.tickerDef), execute: this.bybit.getTicker.bind(this.bybit) }],
      ['bybit_get_positions', { def: this.withBuiltinSource(this.bybit.positionsDef), execute: this.bybit.getPositions.bind(this.bybit) }],
      ['bybit_get_wallet_balance', { def: this.withBuiltinSource(this.bybit.walletBalanceDef), execute: this.bybit.getWalletBalance.bind(this.bybit) }],
      ['bybit_place_demo_order', { def: this.withBuiltinSource(this.bybit.placeDemoOrderDef), execute: this.bybit.placeDemoOrder.bind(this.bybit) }],
      ['deep_research', { def: this.withBuiltinSource(this.deepResearch.def), execute: this.deepResearch.run.bind(this.deepResearch) }],
      ['computer_session_start', { def: this.withBuiltinSource(this.computerUse.sessionStartDef), execute: this.computerUse.start.bind(this.computerUse) }],
      ['computer_navigate', { def: this.withBuiltinSource(this.computerUse.navigateDef), execute: this.computerUse.navigate.bind(this.computerUse) }],
      ['computer_click_link', { def: this.withBuiltinSource(this.computerUse.clickDef), execute: this.computerUse.click.bind(this.computerUse) }],
      ['computer_snapshot', { def: this.withBuiltinSource(this.computerUse.snapshotDef), execute: this.computerUse.snapshot.bind(this.computerUse) }],
      ['computer_session_end', { def: this.withBuiltinSource(this.computerUse.endSessionDef), execute: this.computerUse.end.bind(this.computerUse) }],
    ])
  }

  async getAvailableForUser(userId: string): Promise<ToolDefinition[]> {
    // For MVP: return all tools; later filter by connected tools
    const builtinTools = Array.from(this.registry.values()).map((t) => t.def)
    const mcpTools = await this.mcp.listToolDefinitions()
    return [...builtinTools, ...mcpTools]
  }

  async execute(toolName: string, input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const tool = this.registry.get(toolName)
    const startedAt = Date.now()
    try {
      const result = tool
        ? await tool.execute(input, userId)
        : await this.mcp.execute(toolName, input, userId)
      const latencyMs = Date.now() - startedAt
      await this.connectors.recordToolExecution(userId, toolName, {
        success: result.success,
        latencyMs,
        error: result.error ?? undefined,
        rateLimited: this.isRateLimitError(result.error),
      }).catch(() => {})
      return result
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await this.connectors.recordToolExecution(userId, toolName, {
        success: false,
        latencyMs: Date.now() - startedAt,
        error: errorMessage,
        rateLimited: this.isRateLimitError(errorMessage),
      }).catch(() => {})
      return { success: false, output: null, error: errorMessage }
    }
  }

  async getAllDefinitions(): Promise<ToolDefinition[]> {
    const builtinTools = Array.from(this.registry.values()).map((t) => t.def)
    const mcpTools = await this.mcp.listToolDefinitions()
    return [...builtinTools, ...mcpTools]
  }

  private isRateLimitError(message: string | undefined | null) {
    if (!message) return false
    return /rate\s*limit|too many requests|429/i.test(message)
  }

  private withBuiltinSource(def: ToolDefinition): ToolDefinition {
    return { ...def, source: 'builtin' }
  }
}
