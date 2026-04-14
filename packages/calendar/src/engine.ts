export interface CalendarEvent {
  id?: string
  summary: string
  description?: string
  location?: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  attendees?: Array<{ email: string; displayName?: string }>
  reminders?: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> }
}

export interface CalendarConfig {
  accessToken: string
  refreshToken?: string
  calendarId?: string
}

export interface CalendarResult {
  success: boolean
  events?: CalendarEvent[]
  event?: CalendarEvent
  error?: string
}

export interface AvailabilitySlot {
  start: string
  end: string
}

export class CalendarClient {
  private config: CalendarConfig

  constructor(config: CalendarConfig) {
    this.config = config
  }

  async listEvents(input: {
    timeMin: string
    timeMax: string
    maxResults?: number
  }): Promise<CalendarResult> {
    try {
      const { google } = await import('googleapis')

      const auth = new google.auth.OAuth2()
      auth.setCredentials({ access_token: this.config.accessToken })

      const calendar = google.calendar({ version: 'v3', auth })

      const response = await calendar.events.list({
        calendarId: this.config.calendarId || 'primary',
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        maxResults: input.maxResults || 10,
        singleEvents: true,
        orderBy: 'startTime',
      })

      const events: CalendarEvent[] = (response.data.items || []).map((item) => ({
        id: item.id,
        summary: item.summary || '',
        description: item.description,
        location: item.location,
        start: item.start || { dateTime: '' },
        end: item.end || { dateTime: '' },
      }))

      return { success: true, events }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to list events',
      }
    }
  }

  async createEvent(event: CalendarEvent): Promise<CalendarResult> {
    try {
      const { google } = await import('googleapis')

      const auth = new google.auth.OAuth2()
      auth.setCredentials({ access_token: this.config.accessToken })

      const calendar = google.calendar({ version: 'v3', auth })

      const response = await calendar.events.insert({
        calendarId: this.config.calendarId || 'primary',
        requestBody: event,
      })

      return { success: true, event: response.data as CalendarEvent }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create event',
      }
    }
  }

  async updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<CalendarResult> {
    try {
      const { google } = await import('googleapis')

      const auth = new google.auth.OAuth2()
      auth.setCredentials({ access_token: this.config.accessToken })

      const calendar = google.calendar({ version: 'v3', auth })

      const response = await calendar.events.patch({
        calendarId: this.config.calendarId || 'primary',
        eventId,
        requestBody: event,
      })

      return { success: true, event: response.data as CalendarEvent }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update event',
      }
    }
  }

  async deleteEvent(eventId: string): Promise<CalendarResult> {
    try {
      const { google } = await import('googleapis')

      const auth = new google.auth.OAuth2()
      auth.setCredentials({ access_token: this.config.accessToken })

      const calendar = google.calendar({ version: 'v3', auth })

      await calendar.events.delete({
        calendarId: this.config.calendarId || 'primary',
        eventId,
      })

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete event',
      }
    }
  }

  async getAvailability(input: {
    timeMin: string
    timeMax: string
  }): Promise<{ success: boolean; slots?: AvailabilitySlot[]; error?: string }> {
    const events = await this.listEvents(input)

    if (!events.success) {
      return { success: false, error: events.error }
    }

    const busySlots: AvailabilitySlot[] = (events.events || []).map((e) => ({
      start: e.start.dateTime,
      end: e.end.dateTime,
    }))

    return { success: true, slots: busySlots }
  }

  async freeBusy(input: {
    timeMin: string
    timeMax: string
    emails?: string[]
  }): Promise<{
    success: boolean
    calendars?: Record<string, AvailabilitySlot[]>
    error?: string
  }> {
    try {
      const { google } = await import('googleapis')

      const auth = new google.auth.OAuth2()
      auth.setCredentials({ access_token: this.config.accessToken })

      const calendar = google.calendar({ version: 'v3', auth })

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          items: (input.emails || [this.config.calendarId || 'primary']).map((email) => ({
            id: email,
          })),
        },
      })

      const calendars: Record<string, AvailabilitySlot[]> = {}
      for (const [email, data] of Object.entries(response.data.calendars || {})) {
        calendars[email] = (data.busy || []).map((slot) => ({
          start: slot.start || '',
          end: slot.end || '',
        }))
      }

      return { success: true, calendars }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get free/busy',
      }
    }
  }
}

export function createCalendarClient(config: CalendarConfig): CalendarClient {
  return new CalendarClient(config)
}
