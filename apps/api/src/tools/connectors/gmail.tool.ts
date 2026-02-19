import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

/**
 * Gmail tool connector.
 * MVP: stubs that can be wired to Google API once OAuth tokens are stored.
 */
@Injectable()
export class GmailTool {
  get searchDef(): ToolDefinition {
    return {
      name: 'gmail_search',
      displayName: 'Gmail Search',
      description: 'Search for emails in the user\'s Gmail inbox.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query (e.g. "from:boss subject:report")' },
          maxResults: { type: 'number', description: 'Max emails to return (default 10)' },
        },
        required: ['query'],
      },
    }
  }

  get draftReplyDef(): ToolDefinition {
    return {
      name: 'gmail_draft_reply',
      displayName: 'Gmail Draft Reply',
      description: 'Draft a reply to an email. Requires approval before sending.',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          threadId: { type: 'string', description: 'Gmail thread ID to reply to' },
          body: { type: 'string', description: 'Body of the reply email' },
        },
        required: ['threadId', 'body'],
      },
    }
  }

  async search(input: { query: string; maxResults?: number }, userId: string): Promise<ToolResult> {
    // TODO: implement with Google API client using stored OAuth tokens
    return {
      success: true,
      output: {
        emails: [],
        note: 'Gmail integration requires Google OAuth connection. Visit /tools/connect/gmail.',
      },
    }
  }

  async draftReply(input: { threadId: string; body: string }, userId: string): Promise<ToolResult> {
    // TODO: implement with Google API client
    return {
      success: true,
      output: { drafted: true, threadId: input.threadId },
    }
  }
}
