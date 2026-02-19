import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

const ALLOWED_PROTOCOLS = ['https:']
const MAX_CONTENT_LENGTH = 10_000 // chars

@Injectable()
export class WebFetchTool {
  private readonly logger = new Logger(WebFetchTool.name)

  get def(): ToolDefinition {
    return {
      name: 'web_fetch',
      displayName: 'Web Fetch',
      description: 'Fetch the text content of a public webpage. Safe mode: HTTPS only, no cookies.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'HTTPS URL to fetch' },
        },
        required: ['url'],
      },
    }
  }

  async fetch(input: { url: string }, _userId: string): Promise<ToolResult> {
    try {
      const parsed = new URL(input.url)

      if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return { success: false, output: null, error: 'Only HTTPS URLs are allowed.' }
      }

      const res = await globalThis.fetch(input.url, {
        headers: { 'User-Agent': 'OpenAgents-Bot/1.0' },
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        return { success: false, output: null, error: `HTTP ${res.status}` }
      }

      const text = await res.text()
      // Strip HTML tags (basic)
      const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const truncated = stripped.slice(0, MAX_CONTENT_LENGTH)

      return { success: true, output: { url: input.url, content: truncated, truncated: stripped.length > MAX_CONTENT_LENGTH } }
    } catch (err: any) {
      return { success: false, output: null, error: err.message }
    }
  }
}
