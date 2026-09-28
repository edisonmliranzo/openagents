import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { LibraryService } from '../../library/library.service'

@Injectable()
export class LibrarySearchTool {
  constructor(private readonly library: LibraryService) {}

  get def(): ToolDefinition {
    return {
      name: 'library_search',
      displayName: 'Library Search',
      description:
        'Semantic search over the user\'s personal document library (contracts, notes, books, research). Returns the most relevant passages with document titles for citation. Use before answering questions about the user\'s own files.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look for in the library' },
          topK: { type: 'number', description: 'Max passages to return (default 6)' },
        },
        required: ['query'],
      },
    }
  }

  async run(input: { query: string; topK?: number }, userId: string): Promise<ToolResult> {
    const query = String(input.query ?? '').trim()
    if (!query) return { success: false, output: null, error: 'query is required.' }
    try {
      const hits = await this.library.search(userId, query, input.topK ?? 6)
      if (hits.length === 0) {
        return { success: true, output: { count: 0, note: 'No library passages matched. The library may be empty — add documents in Settings → Library.' } }
      }
      return {
        success: true,
        output: {
          count: hits.length,
          passages: hits.map((h) => ({ document: h.title, relevance: Number(h.score.toFixed(3)), text: h.text.slice(0, 700) })),
        },
      }
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Library search failed.' }
    }
  }
}
