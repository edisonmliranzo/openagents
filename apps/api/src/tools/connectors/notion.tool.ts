import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class NotionTool {
  private get token(): string | undefined {
    return process.env.NOTION_TOKEN
  }

  private async call(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Notion ${method} ${path} → ${res.status}: ${text}`)
    }
    return res.json() as Promise<unknown>
  }

  // ── Read page ─────────────────────────────────────────────────────────────

  readonly readPageDef: ToolDefinition = {
    name: 'notion_read_page',
    displayName: 'Notion: Read Page',
    description: 'Read the content blocks of a Notion page.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['page_id'],
      properties: {
        page_id: { type: 'string', description: 'Notion page ID or URL' },
      },
    },
  }

  async readPage(input: { page_id: string }): Promise<ToolResult> {
    try {
      const pageId = input.page_id.replace(/-/g, '').replace(/.*\//, '').split('?')[0]
      const blocks = await this.call(`/blocks/${pageId}/children`) as { results: Array<{ type: string; [k: string]: any }> }
      const lines = blocks.results.map((block) => {
        const rich = (block[block.type]?.rich_text ?? []) as Array<{ plain_text?: string }>
        return rich.map((r) => r.plain_text ?? '').join('')
      }).filter(Boolean)
      return { success: true, output: lines.join('\n') }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Create page ───────────────────────────────────────────────────────────

  readonly createPageDef: ToolDefinition = {
    name: 'notion_create_page',
    displayName: 'Notion: Create Page',
    description: 'Create a new page inside a Notion database.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      required: ['database_id', 'title'],
      properties: {
        database_id: { type: 'string', description: 'Notion database ID' },
        title:       { type: 'string', description: 'Page title' },
        content:     { type: 'string', description: 'Body text (plain text)' },
      },
    },
  }

  async createPage(input: { database_id: string; title: string; content?: string }): Promise<ToolResult> {
    try {
      const children = input.content
        ? [{
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: input.content } }] },
          }]
        : []

      const page = await this.call('/pages', 'POST', {
        parent: { database_id: input.database_id },
        properties: {
          title: { title: [{ type: 'text', text: { content: input.title } }] },
        },
        children,
      }) as { url: string; id: string }
      return { success: true, output: `Created page: ${page.url}` }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }

  // ── Query database ────────────────────────────────────────────────────────

  readonly queryDatabaseDef: ToolDefinition = {
    name: 'notion_query_database',
    displayName: 'Notion: Query Database',
    description: 'Query rows from a Notion database.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      required: ['database_id'],
      properties: {
        database_id: { type: 'string' },
        filter:      { type: 'object', description: 'Notion filter object (optional)' },
      },
    },
  }

  async queryDatabase(input: { database_id: string; filter?: unknown }): Promise<ToolResult> {
    try {
      const body: Record<string, unknown> = { page_size: 20 }
      if (input.filter) body['filter'] = input.filter
      const result = await this.call(`/databases/${input.database_id}/query`, 'POST', body) as {
        results: Array<{ id: string; properties: Record<string, any> }>
      }
      if (result.results.length === 0) return { success: true, output: 'No results found.' }
      const lines = result.results.map((page) => {
        const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as any
        const title = titleProp?.title?.map((t: any) => t.plain_text).join('') ?? page.id
        return `[${page.id}] ${title}`
      })
      return { success: true, output: lines.join('\n') }
    } catch (e: any) {
      return { success: false, output: '', error: e.message }
    }
  }
}
