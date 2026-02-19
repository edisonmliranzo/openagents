import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class CalendarTool {
  get availabilityDef(): ToolDefinition {
    return {
      name: 'calendar_get_availability',
      displayName: 'Calendar Availability',
      description: 'Get the user\'s availability for a given date range.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'ISO 8601 start date' },
          endDate: { type: 'string', description: 'ISO 8601 end date' },
        },
        required: ['startDate', 'endDate'],
      },
    }
  }

  get createEventDef(): ToolDefinition {
    return {
      name: 'calendar_create_event',
      displayName: 'Calendar Create Event',
      description: 'Create a calendar event. Requires approval.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          startTime: { type: 'string', description: 'ISO 8601 datetime' },
          endTime: { type: 'string', description: 'ISO 8601 datetime' },
          description: { type: 'string' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses' },
        },
        required: ['title', 'startTime', 'endTime'],
      },
    }
  }

  async getAvailability(input: { startDate: string; endDate: string }, userId: string): Promise<ToolResult> {
    // TODO: implement with Google Calendar API
    return {
      success: true,
      output: {
        freeSlots: [],
        note: 'Calendar integration requires Google OAuth connection.',
      },
    }
  }

  async createEvent(input: { title: string; startTime: string; endTime: string; description?: string; attendees?: string[] }, userId: string): Promise<ToolResult> {
    // TODO: implement with Google Calendar API
    return {
      success: true,
      output: { created: true, eventId: 'pending-oauth-connection' },
    }
  }
}
