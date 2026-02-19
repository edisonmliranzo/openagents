import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { GmailTool } from './connectors/gmail.tool'
import { CalendarTool } from './connectors/calendar.tool'
import { WebFetchTool } from './connectors/web-fetch.tool'
import { NotesTool } from './connectors/notes.tool'
import { WebSearchTool } from './connectors/web-search.tool'
import { TimeTool } from './connectors/time.tool'
import { CronTool } from './connectors/cron.tool'
import type { ToolResult } from '@openagents/shared'

export interface ToolDefinition {
  name: string
  displayName: string
  description: string
  requiresApproval: boolean
  inputSchema: Record<string, unknown>
}

@Injectable()
export class ToolsService {
  private registry: Map<string, { def: ToolDefinition; execute: (input: any, userId: string) => Promise<ToolResult> }>

  constructor(
    private prisma: PrismaService,
    private gmail: GmailTool,
    private calendar: CalendarTool,
    private webFetch: WebFetchTool,
    private notes: NotesTool,
    private webSearch: WebSearchTool,
    private time: TimeTool,
    private cron: CronTool,
  ) {
    this.registry = new Map([
      ['gmail_search', { def: this.gmail.searchDef, execute: this.gmail.search.bind(this.gmail) }],
      ['gmail_draft_reply', { def: this.gmail.draftReplyDef, execute: this.gmail.draftReply.bind(this.gmail) }],
      ['calendar_get_availability', { def: this.calendar.availabilityDef, execute: this.calendar.getAvailability.bind(this.calendar) }],
      ['calendar_create_event', { def: this.calendar.createEventDef, execute: this.calendar.createEvent.bind(this.calendar) }],
      ['web_fetch', { def: this.webFetch.def, execute: this.webFetch.fetch.bind(this.webFetch) }],
      ['web_search', { def: this.webSearch.def, execute: this.webSearch.search.bind(this.webSearch) }],
      ['get_current_time', { def: this.time.def, execute: this.time.getCurrentTime.bind(this.time) }],
      ['cron_add', { def: this.cron.addDef, execute: this.cron.add.bind(this.cron) }],
      ['cron_list', { def: this.cron.listDef, execute: this.cron.list.bind(this.cron) }],
      ['cron_remove', { def: this.cron.removeDef, execute: this.cron.remove.bind(this.cron) }],
      ['notes_create', { def: this.notes.createDef, execute: this.notes.create.bind(this.notes) }],
      ['notes_list', { def: this.notes.listDef, execute: this.notes.list.bind(this.notes) }],
    ])
  }

  async getAvailableForUser(userId: string): Promise<ToolDefinition[]> {
    // For MVP: return all tools; later filter by connected tools
    return Array.from(this.registry.values()).map((t) => t.def)
  }

  async execute(toolName: string, input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const tool = this.registry.get(toolName)
    if (!tool) return { success: false, output: null, error: `Unknown tool: ${toolName}` }
    try {
      return await tool.execute(input, userId)
    } catch (err: any) {
      return { success: false, output: null, error: err.message }
    }
  }

  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.registry.values()).map((t) => t.def)
  }
}
