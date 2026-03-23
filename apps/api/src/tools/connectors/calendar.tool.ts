import { BadRequestException, Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { ConnectorsService } from '../../connectors/connectors.service'

@Injectable()
export class CalendarTool {
  constructor(private readonly connectors: ConnectorsService) {}

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
    const startDate = new Date(input.startDate)
    const endDate = new Date(input.endDate)
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate >= endDate) {
      throw new BadRequestException('Valid startDate and endDate are required.')
    }

    const response = await this.connectors.fetchGoogle(
      userId,
      'google_calendar',
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: 'primary' }],
        }),
      },
    )
    const payload = await response.json() as {
      calendars?: {
        primary?: {
          busy?: Array<{ start?: string; end?: string }>
        }
      }
    }
    const busy = (payload.calendars?.primary?.busy ?? [])
      .map((slot) => ({
        start: new Date(`${slot.start ?? ''}`),
        end: new Date(`${slot.end ?? ''}`),
      }))
      .filter((slot) => Number.isFinite(slot.start.getTime()) && Number.isFinite(slot.end.getTime()))
      .sort((a, b) => a.start.getTime() - b.start.getTime())

    const freeSlots: Array<{ start: string; end: string }> = []
    let cursor = startDate
    for (const slot of busy) {
      if (slot.start > cursor) {
        freeSlots.push({ start: cursor.toISOString(), end: slot.start.toISOString() })
      }
      if (slot.end > cursor) {
        cursor = slot.end
      }
    }
    if (cursor < endDate) {
      freeSlots.push({ start: cursor.toISOString(), end: endDate.toISOString() })
    }

    return {
      success: true,
      output: {
        freeSlots,
        busy: busy.map((slot) => ({ start: slot.start.toISOString(), end: slot.end.toISOString() })),
      },
    }
  }

  async createEvent(input: { title: string; startTime: string; endTime: string; description?: string; attendees?: string[] }, userId: string): Promise<ToolResult> {
    const title = `${input.title ?? ''}`.trim()
    const startTime = new Date(input.startTime)
    const endTime = new Date(input.endTime)
    if (!title || !Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime >= endTime) {
      throw new BadRequestException('Valid title, startTime, and endTime are required.')
    }

    const response = await this.connectors.fetchGoogle(
      userId,
      'google_calendar',
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: title,
          description: `${input.description ?? ''}`.trim() || undefined,
          start: { dateTime: startTime.toISOString() },
          end: { dateTime: endTime.toISOString() },
          attendees: (input.attendees ?? [])
            .map((email) => `${email}`.trim())
            .filter(Boolean)
            .map((email) => ({ email })),
        }),
      },
    )
    const event = await response.json() as {
      id?: string
      htmlLink?: string
      status?: string
    }
    return {
      success: true,
      output: {
        created: true,
        eventId: event.id ?? null,
        htmlLink: event.htmlLink ?? null,
        status: event.status ?? 'confirmed',
      },
    }
  }
}
