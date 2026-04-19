import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

interface KBEntry {
  id: string
  title: string
  content: string
  createdAt: string
  tags: string[]
}

@Injectable()
export class KnowledgeBaseTool {
  private readonly logger = new Logger(KnowledgeBaseTool.name)

  get def(): ToolDefinition {
    return {
      name: 'knowledge_base',
      displayName: 'Knowledge Base',
      description:
        'Store and search a personal knowledge base. Actions: save (store a document/note with a title), search (semantic keyword search), list (list all entries).',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['save', 'search', 'list'],
            description: 'The action to perform: save, search, or list.',
          },
          title: {
            type: 'string',
            description: 'Title of the entry (required for save).',
          },
          content: {
            type: 'string',
            description: 'Content of the entry (required for save).',
          },
          query: {
            type: 'string',
            description: 'Search query (required for search).',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return for search/list. Defaults to 10.',
          },
        },
        required: ['action'],
      },
    }
  }

  async execute(
    input: {
      action: 'save' | 'search' | 'list'
      title?: string
      content?: string
      query?: string
      limit?: number
    },
    userId: string,
  ): Promise<ToolResult> {
    const kbDir = path.join('/data/kb', userId)

    try {
      await fs.promises.mkdir(kbDir, { recursive: true })
    } catch (err: any) {
      this.logger.error(`knowledge_base: failed to create dir ${kbDir}: ${err.message}`)
      return { success: false, output: null, error: `Failed to create knowledge base directory: ${err.message}` }
    }

    switch (input.action) {
      case 'save':
        return this.save(kbDir, input.title, input.content)
      case 'search':
        return this.search(kbDir, input.query, input.limit)
      case 'list':
        return this.list(kbDir, input.limit)
      default:
        return { success: false, output: null, error: `Unknown action: ${(input as any).action}` }
    }
  }

  // ── save ──────────────────────────────────────────────────────────────────

  private async save(kbDir: string, title?: string, content?: string): Promise<ToolResult> {
    if (!title) {
      return { success: false, output: null, error: 'title is required for save action.' }
    }
    if (!content) {
      return { success: false, output: null, error: 'content is required for save action.' }
    }

    const id = randomUUID()
    const entry: KBEntry = {
      id,
      title,
      content,
      createdAt: new Date().toISOString(),
      tags: [],
    }

    const filePath = path.join(kbDir, `${id}.json`)
    try {
      await fs.promises.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8')
      this.logger.log(`knowledge_base/save: id=${id} title="${title}"`)
      return {
        success: true,
        output: {
          id,
          title,
          saved: true,
        },
      }
    } catch (err: any) {
      this.logger.error(`knowledge_base/save error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }

  // ── search ────────────────────────────────────────────────────────────────

  private async search(kbDir: string, query?: string, limit?: number): Promise<ToolResult> {
    if (!query) {
      return { success: false, output: null, error: 'query is required for search action.' }
    }

    const entries = await this.loadAllEntries(kbDir)
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean)
    const maxResults = limit ?? 10

    const scored = entries
      .map((entry) => {
        const haystack = `${entry.title} ${entry.content}`.toLowerCase()
        const score = keywords.reduce((acc, kw) => {
          const count = (haystack.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length
          return acc + count
        }, 0)
        return { entry, score }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)

    const results = scored.map(({ entry, score }) => ({
      id: entry.id,
      title: entry.title,
      snippet: entry.content.slice(0, 200),
      score,
    }))

    this.logger.log(`knowledge_base/search: query="${query}" results=${results.length}`)

    return {
      success: true,
      output: {
        results,
        total_searched: entries.length,
        query,
      },
    }
  }

  // ── list ──────────────────────────────────────────────────────────────────

  private async list(kbDir: string, limit?: number): Promise<ToolResult> {
    const entries = await this.loadAllEntries(kbDir)
    const maxResults = limit ?? 10

    const sorted = [...entries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, maxResults)

    const results = sorted.map((entry) => ({
      id: entry.id,
      title: entry.title,
      createdAt: entry.createdAt,
      chars: entry.content.length,
    }))

    this.logger.log(`knowledge_base/list: total=${entries.length}`)

    return {
      success: true,
      output: {
        entries: results,
        total: entries.length,
      },
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async loadAllEntries(kbDir: string): Promise<KBEntry[]> {
    let files: string[]
    try {
      files = await fs.promises.readdir(kbDir)
    } catch {
      return []
    }

    const jsonFiles = files.filter((f) => f.endsWith('.json'))
    const entries: KBEntry[] = []

    for (const file of jsonFiles) {
      try {
        const raw = await fs.promises.readFile(path.join(kbDir, file), 'utf-8')
        const entry = JSON.parse(raw) as KBEntry
        entries.push(entry)
      } catch {
        // Skip malformed files
      }
    }

    return entries
  }
}
