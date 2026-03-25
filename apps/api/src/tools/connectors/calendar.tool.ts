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
          timeZone: { type: 'string', description: 'Optional IANA timezone override' },
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
          location: { type: 'string' },
          timeZone: { type: 'string', description: 'Optional IANA timezone for event rendering' },
          sendUpdates: { type: 'boolean', description: 'Whether to send invites/updates to attendees' },
        },
        required: ['title', 'startTime', 'endTime'],
      },
    }
  }

  get updateEventDef(): ToolDefinition {
    return {
      name: 'calendar_update_event',
      displayName: 'Calendar Update Event',
      description: 'Update a Google Calendar event. Requires approval.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          title: { type: 'string' },
          startTime: { type: 'string', description: 'ISO 8601 datetime' },
          endTime: { type: 'string', description: 'ISO 8601 datetime' },
          description: { type: 'string' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses' },
          location: { type: 'string' },
          timeZone: { type: 'string', description: 'Optional IANA timezone for event rendering' },
          sendUpdates: { type: 'boolean', description: 'Whether to send invites/updates to attendees' },
        },
        required: ['eventId'],
      },
    }
  }

  get cancelEventDef(): ToolDefinition {
    return {
      name: 'calendar_cancel_event',
      displayName: 'Calendar Cancel Event',
      description: 'Cancel a Google Calendar event. Requires approval.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          sendUpdates: { type: 'boolean', description: 'Whether to notify attendees about the cancellation' },
        },
        required: ['eventId'],
      },
    }
  }

  async getAvailability(input: { startDate: string; endDate: string; timeZone?: string }, userId: string): Promise<ToolResult> {
    const startDate = new Date(input.startDate)
    const endDate = new Date(input.endDate)
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate >= endDate) {
      throw new BadRequestException('Valid startDate and endDate are required.')
    }
    await this.connectors.assertGoogleToolAccess(userId, 'google_calendar', 'calendar_get_availability')

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
          ...(this.optionalText(input.timeZone) ? { timeZone: this.optionalText(input.timeZone) } : {}),
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

  async createEvent(
    input: {
      title: string
      startTime: string
      endTime: string
      description?: string
      attendees?: string[]
      location?: string
      timeZone?: string
      sendUpdates?: boolean
    },
    userId: string,
  ): Promise<ToolResult> {
    const title = `${input.title ?? ''}`.trim()
    const startTime = new Date(input.startTime)
    const endTime = new Date(input.endTime)
    if (!title || !Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime >= endTime) {
      throw new BadRequestException('Valid title, startTime, and endTime are required.')
    }
    await this.connectors.assertGoogleToolAccess(userId, 'google_calendar', 'calendar_create_event')

    const eventUrl = this.buildEventUrl('https://www.googleapis.com/calendar/v3/calendars/primary/events', input.sendUpdates)
    const response = await this.connectors.fetchGoogle(
      userId,
      'google_calendar',
      eventUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: title,
          description: `${input.description ?? ''}`.trim() || undefined,
          location: `${input.location ?? ''}`.trim() || undefined,
          start: this.buildDateTimePayload(startTime, input.timeZone),
          end: this.buildDateTimePayload(endTime, input.timeZone),
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

  async updateEvent(
    input: {
      eventId: string
      title?: string
      startTime?: string
      endTime?: string
      description?: string
      attendees?: string[]
      location?: string
      timeZone?: string
      sendUpdates?: boolean
    },
    userId: string,
  ): Promise<ToolResult> {
    const eventId = `${input.eventId ?? ''}`.trim()
    if (!eventId) {
      throw new BadRequestException('Event ID is required.')
    }
    await this.connectors.assertGoogleToolAccess(userId, 'google_calendar', 'calendar_update_event')

    const startTime = this.parseOptionalDate(input.startTime)
    const endTime = this.parseOptionalDate(input.endTime)
    if ((input.startTime && !startTime) || (input.endTime && !endTime)) {
      throw new BadRequestException('startTime and endTime must be valid ISO 8601 datetimes when provided.')
    }
    if (startTime && endTime && startTime >= endTime) {
      throw new BadRequestException('endTime must be after startTime.')
    }

    const payload: Record<string, unknown> = {}
    if (`${input.title ?? ''}`.trim()) payload.summary = `${input.title ?? ''}`.trim()
    if (input.description !== undefined) payload.description = `${input.description ?? ''}`.trim() || ''
    if (input.location !== undefined) payload.location = `${input.location ?? ''}`.trim() || ''
    if (Array.isArray(input.attendees)) {
      payload.attendees = input.attendees
        .map((email) => `${email}`.trim())
        .filter(Boolean)
        .map((email) => ({ email }))
    }
    if (startTime) payload.start = this.buildDateTimePayload(startTime, input.timeZone)
    if (endTime) payload.end = this.buildDateTimePayload(endTime, input.timeZone)

    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('Provide at least one field to update.')
    }

    const response = await this.connectors.fetchGoogle(
      userId,
      'google_calendar',
      this.buildEventUrl(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
        input.sendUpdates,
      ),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
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
        updated: true,
        eventId: event.id ?? eventId,
        htmlLink: event.htmlLink ?? null,
        status: event.status ?? 'confirmed',
      },
    }
  }

  async cancelEvent(input: { eventId: string; sendUpdates?: boolean }, userId: string): Promise<ToolResult> {
    const eventId = `${input.eventId ?? ''}`.trim()
    if (!eventId) {
      throw new BadRequestException('Event ID is required.')
    }
    await this.connectors.assertGoogleToolAccess(userId, 'google_calendar', 'calendar_cancel_event')

    await this.connectors.fetchGoogle(
      userId,
      'google_calendar',
      this.buildEventUrl(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
        input.sendUpdates,
      ),
      {
        method: 'DELETE',
      },
    )

    return {
      success: true,
      output: {
        deleted: true,
        eventId,
      },
    }
  }

  private buildEventUrl(baseUrl: string, sendUpdates: boolean | undefined) {
    const url = new URL(baseUrl)
    if (typeof sendUpdates === 'boolean') {
      url.searchParams.set('sendUpdates', sendUpdates ? 'all' : 'none')
    }
    return url.toString()
  }

  private buildDateTimePayload(date: Date, timeZone?: string) {
    const normalizedTimeZone = this.optionalText(timeZone)
    return normalizedTimeZone
      ? { dateTime: date.toISOString(), timeZone: normalizedTimeZone }
      : { dateTime: date.toISOString() }
  }

  private parseOptionalDate(value: string | undefined) {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }

  private optionalText(value: string | undefined) {
    const trimmed = `${value ?? ''}`.trim()
    return trimmed || null
  }
}
