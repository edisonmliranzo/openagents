import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { GmailTool } from './connectors/gmail.tool'
import { CalendarTool } from './connectors/calendar.tool'
import { WebFetchTool } from './connectors/web-fetch.tool'
import { NotesTool } from './connectors/notes.tool'
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
  ) {
    this.registry = new Map([
      ['gmail_search', { def: this.gmail.searchDef, execute: this.gmail.search.bind(this.gmail) }],
      ['gmail_draft_reply', { def: this.gmail.draftReplyDef, execute: this.gmail.draftReply.bind(this.gmail) }],
      ['calendar_get_availability', { def: this.calendar.availabilityDef, execute: this.calendar.getAvailability.bind(this.calendar) }],
      ['calendar_create_event', { def: this.calendar.createEventDef, execute: this.calendar.createEvent.bind(this.calendar) }],
      ['web_fetch', { def: this.webFetch.def, execute: this.webFetch.fetch.bind(this.webFetch) }],
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
