import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { LibraryService } from '../../library/library.service'

@Injectable()
export class LibrarySaveTool {
  constructor(private readonly library: LibraryService) {}

  get def(): ToolDefinition {
    return {
      name: 'library_save',
      displayName: 'Save to Library',
      description:
        'Persist a durable reference note to the user\'s library (research findings, procedures, facts worth keeping). Use after studying a topic or completing notable research so it can be cited later.',
      requiresApproval: false,
      hidden: true,
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title (e.g. "Solana staking — reference")' },
          content: { type: 'string', description: 'The note content, markdown, under 8000 chars' },
        },
        required: ['title', 'content'],
      },
    }
  }

  async run(input: { title: string; content: string }, userId: string): Promise<ToolResult> {
    const title = String(input.title ?? '').trim()
    const content = String(input.content ?? '').trim()
    if (!title || !content) {
      return { success: false, output: null, error: 'title and content are required.' }
    }
    try {
      const doc = await this.library.addText(userId, { title, content: content.slice(0, 200_000), source: 'agent' })
      return { success: true, output: { saved: true, documentId: doc.id, chunks: doc.chunkCount } }
    } catch (error: any) {
      return { success: false, output: null, error: error?.message ?? 'Failed to save note.' }
    }
  }
}
