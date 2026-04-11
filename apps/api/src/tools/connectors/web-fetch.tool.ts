import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { PromptGuardService } from '../prompt-guard.service'
import { OutboundGuardService } from '../outbound-guard.service'

const MAX_CONTENT_LENGTH = 10_000 // chars
const MAX_RAW_HTML_LENGTH = 60_000
const MAX_LLMS_TXT_LENGTH = 4_000
const MAX_LLMS_RAW_LENGTH = 24_000
const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 10_000
const LLMS_DISCOVERY_TIMEOUT_MS = 5_000
const LLMS_CANDIDATE_PATHS = ['/llms.txt', '/.well-known/llms.txt'] as const

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
        'Fetch the text content of a public webpage. Safe mode: HTTPS only, SSRF-guarded, no cookies, prompt-guard sanitized, with automatic llms.txt discovery when the site publishes one.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'HTTPS URL to fetch' },
          includeLlmsTxt: {
            type: 'boolean',
            description: 'Attempt site-level llms.txt discovery (default: true)',
          },
        },
        required: ['url'],
      },
    }
  }

  async fetch(input: { url: string; includeLlmsTxt?: boolean }, _userId: string): Promise<ToolResult> {
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
      const llmsTxt = input.includeLlmsTxt === false
        ? null
        : await this.discoverLlmsTxt(finalUrl)

      return {
        success: true,
        output: {
          url: finalUrl,
          content: truncated,
          truncated: guarded.text.length > MAX_CONTENT_LENGTH,
          llmsTxt,
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

  private async discoverLlmsTxt(finalUrl: string) {
    let parsed: URL
    try {
      parsed = new URL(finalUrl)
    } catch {
      return null
    }

    if (parsed.protocol !== 'https:') return null

    const currentPath = parsed.pathname.replace(/\/+$/, '') || '/'
    if (currentPath === '/llms.txt' || currentPath === '/.well-known/llms.txt') {
      return null
    }

    for (const candidatePath of LLMS_CANDIDATE_PATHS) {
      const candidateUrl = new URL(candidatePath, parsed.origin).toString()
      try {
        const { response, finalUrl: resolvedUrl } = await this.outboundGuard.fetchWithRedirectProtection(
          candidateUrl,
          {
            headers: {
              Accept: 'text/plain, text/markdown, text/*;q=0.9, */*;q=0.1',
              'User-Agent': 'OpenAgents-Bot/1.0',
            },
          },
          {
            context: 'llms.txt discovery',
            maxRedirects: 2,
            timeoutMs: LLMS_DISCOVERY_TIMEOUT_MS,
          },
        )

        if (!response.ok) continue

        const raw = (await response.text()).slice(0, MAX_LLMS_RAW_LENGTH)
        const contentType = response.headers.get('content-type') ?? ''
        const normalized = this.extractLlmsText(raw, contentType)
        if (!normalized) continue

        const guarded = this.promptGuard.guardText(normalized)
        const content = guarded.text.slice(0, MAX_LLMS_TXT_LENGTH)
        return {
          url: resolvedUrl,
          source: candidatePath === '/llms.txt' ? 'root' : 'well-known',
          content,
          truncated: guarded.text.length > MAX_LLMS_TXT_LENGTH,
          promptGuard: {
            flagged: guarded.flagged,
            redactedSegments: guarded.redactedSegments,
            findings: guarded.findings,
            warning: guarded.warning ?? null,
          },
        }
      } catch (error: any) {
        this.logger.debug(`llms.txt discovery skipped for ${candidateUrl}: ${error?.message ?? String(error)}`)
      }
    }

    return null
  }

  private extractLlmsText(raw: string, contentType: string) {
    const normalizedType = contentType.toLowerCase()
    const base = normalizedType.includes('html')
      ? this.extractText(raw)
      : raw

    return base
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
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
