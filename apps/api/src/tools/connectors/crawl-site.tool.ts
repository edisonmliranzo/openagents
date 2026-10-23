import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { PromptGuardService } from '../prompt-guard.service'
import { OutboundGuardService } from '../outbound-guard.service'
import { LibraryService } from '../../library/library.service'
import { extractLinks, extractPageTitle, extractTextFromHtml, normalizeCrawlUrl } from './crawl-links'

const MAX_PAGES = 20
const MAX_DEPTH = 3
const FETCH_TIMEOUT_MS = 10_000
const POLITENESS_DELAY_MS = 350
const TOTAL_DEADLINE_MS = 45_000
const PER_PAGE_TEXT_LIMIT = 6_000
const PREVIEW_LIMIT = 240
const RAW_HTML_LIMIT = 120_000

interface CrawledPage {
  url: string
  title: string
  chars: number
  preview: string
  text: string
}

@Injectable()
export class CrawlSiteTool {
  private readonly logger = new Logger(CrawlSiteTool.name)

  constructor(
    private promptGuard: PromptGuardService,
    private outboundGuard: OutboundGuardService,
    private readonly library: LibraryService,
  ) {}

  get def(): ToolDefinition {
    return {
      name: 'web_crawl',
      displayName: 'Web Crawl (Site Ingestion)',
      description:
        "Crawl a public website with a bounded same-origin breadth-first walk starting at a URL, extract clean text from every page, and save the whole crawl into the user's library for retrieval (library_search). Use to ingest documentation sites, guides, or multi-page references in one call. HTTPS-only, SSRF-guarded, prompt-guard sanitized, polite (delays between fetches).",
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'HTTPS URL to start crawling from' },
          maxPages: { type: 'number', description: 'Maximum pages to fetch (1-20, default 5)' },
          maxDepth: { type: 'number', description: 'Link hops from the start page (0-3, default 1)' },
          saveToLibrary: { type: 'boolean', description: 'Save the crawl as a retrievable library document (default true)' },
        },
        required: ['url'],
      },
    }
  }

  async run(
    input: { url: string; maxPages?: number; maxDepth?: number; saveToLibrary?: boolean },
    userId: string,
  ): Promise<ToolResult> {
    const startUrl = normalizeCrawlUrl(input.url ?? '')
    if (!startUrl || !startUrl.startsWith('https://')) {
      return { success: false, output: null, error: 'A valid HTTPS start URL is required.' }
    }

    const maxPages = Math.min(Math.max(1, Math.floor(Number(input.maxPages) || 5)), MAX_PAGES)
    const maxDepth = Math.min(Math.max(0, Math.floor(Number(input.maxDepth) ?? 1)), MAX_DEPTH)
    const saveToLibrary = input.saveToLibrary !== false

    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }]
    const visited = new Set<string>([startUrl])
    const pages: CrawledPage[] = []
    let fetchFailures = 0
    let skippedNonHtml = 0
    const deadline = Date.now() + TOTAL_DEADLINE_MS

    while (queue.length > 0 && pages.length < maxPages) {
      if (Date.now() > deadline) break
      const { url, depth } = queue.shift()!

      try {
        const { response, finalUrl } = await this.outboundGuard.fetchWithRedirectProtection(
          url,
          { headers: { 'User-Agent': 'OpenAgents-Bot/1.0', Accept: 'text/html, */*;q=0.5' } },
          { context: 'Web crawl', maxRedirects: 3, timeoutMs: FETCH_TIMEOUT_MS },
        )
        if (!response.ok) {
          fetchFailures++
          continue
        }
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType && !contentType.toLowerCase().includes('html')) {
          skippedNonHtml++
          continue
        }

        const raw = (await response.text()).slice(0, RAW_HTML_LIMIT)
        const title = extractPageTitle(raw) || url
        const guarded = this.promptGuard.guardText(extractTextFromHtml(raw))
        pages.push({
          url: finalUrl,
          title,
          chars: guarded.text.length,
          preview: guarded.text.slice(0, PREVIEW_LIMIT),
          text: guarded.text.slice(0, PER_PAGE_TEXT_LIMIT),
        })

        if (depth < maxDepth) {
          for (const link of extractLinks(raw, finalUrl)) {
            if (visited.has(link) || pages.length + queue.length >= maxPages) continue
            visited.add(link)
            queue.push({ url: link, depth: depth + 1 })
          }
        }

        if (queue.length > 0 && pages.length < maxPages) {
          await new Promise((resolve) => setTimeout(resolve, POLITENESS_DELAY_MS))
        }
      } catch (err: any) {
        this.logger.debug(`web_crawl skipping ${url}: ${err?.message ?? String(err)}`)
        fetchFailures++
      }
    }

    if (pages.length === 0) {
      return {
        success: false,
        output: null,
        error: `No pages could be fetched (failures: ${fetchFailures}). Check the URL.`,
      }
    }

    let savedLibrary: { documentId: string; chunks: number; title: string } | null = null
    if (saveToLibrary) {
      const host = new URL(startUrl).host
      const content = pages
        .map((p) => `## ${p.title}\n\nSource: ${p.url}\n\n${p.text}`)
        .join('\n\n---\n\n')
      try {
        const doc = await this.library.addText(userId, {
          title: `Crawl: ${host} (${pages.length} page${pages.length === 1 ? '' : 's'})`,
          content,
          source: 'agent',
        })
        savedLibrary = { documentId: doc.id, chunks: doc.chunkCount, title: `Crawl: ${host}` }
      } catch (err: any) {
        this.logger.warn(`web_crawl library save failed for user ${userId}: ${err?.message}`)
      }
    }

    return {
      success: true,
      output: {
        startUrl,
        pagesFetched: pages.length,
        failedFetches: fetchFailures,
        skippedNonHtml,
        hitLimits: pages.length >= maxPages || Date.now() > deadline,
        pages: pages.map(({ url, title, chars, preview }) => ({ url, title, chars, preview })),
        savedLibrary,
        note: savedLibrary
          ? 'Full crawl saved to the library — use library_search to retrieve page content.'
          : 'Crawl not saved to library (disabled or save failed); previews only.',
      },
    }
  }
}
