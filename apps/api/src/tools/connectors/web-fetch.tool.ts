import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { PromptGuardService } from '../prompt-guard.service'
import { OutboundGuardService } from '../outbound-guard.service'

const MAX_CONTENT_LENGTH = 10_000 // chars
const MAX_RAW_HTML_LENGTH = 60_000
const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 10_000

@Injectable()
export class WebFetchTool {
  private readonly logger = new Logger(WebFetchTool.name)

  constructor(
    private promptGuard: PromptGuardService,
    private outboundGuard: OutboundGuardService,
  ) {}

  get def(): ToolDefinition {
    return {
      name: 'web_fetch',
      displayName: 'Web Fetch',
      description:
        'Fetch the text content of a public webpage. Safe mode: HTTPS only, SSRF-guarded, no cookies, prompt-guard sanitized.',
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
      const { response, finalUrl } = await this.outboundGuard.fetchWithRedirectProtection(input.url, {
        headers: { 'User-Agent': 'OpenAgents-Bot/1.0' },
      }, {
        context: 'Web fetch',
        maxRedirects: MAX_REDIRECTS,
        timeoutMs: FETCH_TIMEOUT_MS,
      })

      if (!response.ok) {
        return { success: false, output: null, error: `HTTP ${response.status}` }
      }

      const text = await response.text()
      const stripped = this.extractText(text)
      const guarded = this.promptGuard.guardText(stripped)
      const truncated = guarded.text.slice(0, MAX_CONTENT_LENGTH)

      return {
        success: true,
        output: {
          url: finalUrl,
          content: truncated,
          truncated: guarded.text.length > MAX_CONTENT_LENGTH,
          promptGuard: {
            flagged: guarded.flagged,
            redactedSegments: guarded.redactedSegments,
            findings: guarded.findings,
            warning: guarded.warning ?? null,
          },
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err.message }
    }
  }

  private extractText(html: string) {
    const bounded = html.slice(0, MAX_RAW_HTML_LENGTH)
    const withoutScripts = bounded
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    return withoutScripts
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
