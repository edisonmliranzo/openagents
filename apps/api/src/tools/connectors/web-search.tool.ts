import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

interface BraveSearchResult {
  title?: string
  url?: string
  description?: string
}

@Injectable()
export class WebSearchTool {
  get def(): ToolDefinition {
    return {
      name: 'web_search',
      displayName: 'Web Search',
      description: 'Search the web for current information via Brave Search API.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: { type: 'number', description: 'Number of results to return (1-10)' },
        },
        required: ['query'],
      },
    }
  }

  async search(input: { query: string; count?: number }, _userId: string): Promise<ToolResult> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim()
    if (!apiKey) {
      return {
        success: false,
        output: null,
        error: 'BRAVE_SEARCH_API_KEY is not configured.',
      }
    }

    const query = input.query?.trim()
    if (!query) {
      return { success: false, output: null, error: 'Query is required.' }
    }

    const count = Math.max(1, Math.min(10, Number(input.count ?? 5)))
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`

    try {
      const response = await fetch(url, {
        headers: {
          'X-Subscription-Token': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        return { success: false, output: null, error: `Brave API request failed with status ${response.status}` }
      }

      const payload = await response.json() as { web?: { results?: BraveSearchResult[] } }
      const results = (payload.web?.results ?? [])
        .slice(0, count)
        .map((result) => ({
          title: result.title ?? '',
          url: result.url ?? '',
          snippet: result.description ?? '',
        }))

      return {
        success: true,
        output: {
          query,
          count: results.length,
          results,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        output: null,
        error: error?.message ?? 'Web search failed',
      }
    }
  }
}
