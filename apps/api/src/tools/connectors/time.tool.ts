import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class TimeTool {
  get def(): ToolDefinition {
    return {
      name: 'get_current_time',
      displayName: 'Get Current Time',
      description: 'Fetch the current date/time and timezone-aware formatted output.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'IANA timezone, e.g. "America/New_York" (optional)' },
          setSystemClock: { type: 'boolean', description: 'Not supported in API mode; always ignored.' },
        },
      },
    }
  }

  async getCurrentTime(input: { timezone?: string; setSystemClock?: boolean }, _userId: string): Promise<ToolResult> {
    if (input.setSystemClock) {
      return {
        success: false,
        output: null,
        error: 'Setting system clock is not supported in this environment.',
      }
    }

    const now = new Date()
    const timezone = input.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    try {
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now)

      return {
        success: true,
        output: {
          timezone,
          iso: now.toISOString(),
          unixMs: now.getTime(),
          formatted,
          source: 'local-system-clock',
        },
      }
    } catch {
      return {
        success: false,
        output: null,
        error: `Invalid timezone: ${timezone}`,
      }
    }
  }
}
