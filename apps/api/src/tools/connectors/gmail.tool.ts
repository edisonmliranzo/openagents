import { BadRequestException, Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { ConnectorsService } from '../../connectors/connectors.service'

/**
 * Gmail tool connector.
 * MVP: stubs that can be wired to Google API once OAuth tokens are stored.
 */
@Injectable()
export class GmailTool {
  constructor(private readonly connectors: ConnectorsService) {}

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
    const query = `${input.query ?? ''}`.trim()
    if (!query) {
      throw new BadRequestException('Gmail search query is required.')
    }
    const maxResults = Math.max(1, Math.min(Number(input.maxResults ?? 10) || 10, 10))
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    listUrl.searchParams.set('q', query)
    listUrl.searchParams.set('maxResults', String(maxResults))

    const listResponse = await this.connectors.fetchGoogle(userId, 'google_gmail', listUrl.toString())
    const listPayload = await listResponse.json() as {
      messages?: Array<{ id: string; threadId: string }>
      resultSizeEstimate?: number
    }

    const messages = Array.isArray(listPayload.messages) ? listPayload.messages.slice(0, maxResults) : []
    if (messages.length === 0) {
      return {
        success: true,
        output: {
          emails: [],
          resultSizeEstimate: listPayload.resultSizeEstimate ?? 0,
          note: 'No Gmail messages matched the query.',
        },
      }
    }

    const emails = await Promise.all(
      messages.map(async (message) => {
        const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}`)
        detailUrl.searchParams.set('format', 'metadata')
        detailUrl.searchParams.set('metadataHeaders', 'From')
        detailUrl.searchParams.append('metadataHeaders', 'Subject')
        detailUrl.searchParams.append('metadataHeaders', 'Date')

        const detailResponse = await this.connectors.fetchGoogle(userId, 'google_gmail', detailUrl.toString())
        const detail = await detailResponse.json() as {
          id?: string
          threadId?: string
          snippet?: string
          internalDate?: string
          payload?: { headers?: Array<{ name?: string; value?: string }> }
        }
        const headers = this.headerMap(detail.payload?.headers)
        return {
          id: detail.id ?? message.id,
          threadId: detail.threadId ?? message.threadId,
          from: headers.from ?? 'unknown',
          subject: headers.subject ?? '(no subject)',
          date: headers.date ?? this.formatInternalDate(detail.internalDate),
          snippet: detail.snippet ?? '',
        }
      }),
    )

    return {
      success: true,
      output: {
        emails,
        resultSizeEstimate: listPayload.resultSizeEstimate ?? emails.length,
      },
    }
  }

  async draftReply(input: { threadId: string; body: string }, userId: string): Promise<ToolResult> {
    const threadId = `${input.threadId ?? ''}`.trim()
    const body = `${input.body ?? ''}`.trim()
    if (!threadId || !body) {
      throw new BadRequestException('Thread ID and reply body are required.')
    }

    const threadUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`)
    threadUrl.searchParams.set('format', 'metadata')
    threadUrl.searchParams.set('metadataHeaders', 'Subject')
    threadUrl.searchParams.append('metadataHeaders', 'From')
    threadUrl.searchParams.append('metadataHeaders', 'To')
    threadUrl.searchParams.append('metadataHeaders', 'Message-ID')
    threadUrl.searchParams.append('metadataHeaders', 'References')

    const threadResponse = await this.connectors.fetchGoogle(userId, 'google_gmail', threadUrl.toString())
    const thread = await threadResponse.json() as {
      messages?: Array<{ payload?: { headers?: Array<{ name?: string; value?: string }> } }>
    }
    const latest = Array.isArray(thread.messages) ? thread.messages[thread.messages.length - 1] : null
    const headers = this.headerMap(latest?.payload?.headers)
    const recipient = headers.from ?? headers.to ?? ''
    if (!recipient) {
      throw new BadRequestException('Could not determine reply recipient from the Gmail thread.')
    }

    const subject = this.replySubject(headers.subject)
    const mimeLines = [
      `To: ${recipient}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      ...(headers['message-id'] ? [`In-Reply-To: ${headers['message-id']}`] : []),
      ...(headers.references || headers['message-id']
        ? [`References: ${[headers.references, headers['message-id']].filter(Boolean).join(' ').trim()}`]
        : []),
      '',
      body,
    ]
    const raw = Buffer.from(mimeLines.join('\r\n'), 'utf8').toString('base64url')

    const createResponse = await this.connectors.fetchGoogle(
      userId,
      'google_gmail',
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            threadId,
            raw,
          },
        }),
      },
    )
    const draft = await createResponse.json() as { id?: string }
    return {
      success: true,
      output: {
        drafted: true,
        threadId,
        draftId: draft.id ?? null,
        to: recipient,
        subject,
      },
    }
  }

  private headerMap(headers: Array<{ name?: string; value?: string }> | undefined) {
    const out: Record<string, string> = {}
    for (const header of headers ?? []) {
      const name = `${header.name ?? ''}`.trim().toLowerCase()
      const value = `${header.value ?? ''}`.trim()
      if (!name || !value) continue
      out[name] = value
    }
    return out as Record<'from' | 'subject' | 'date' | 'to' | 'message-id' | 'references', string>
  }

  private formatInternalDate(value: string | undefined) {
    const parsed = Number.parseInt(`${value ?? ''}`, 10)
    if (!Number.isFinite(parsed)) return ''
    return new Date(parsed).toISOString()
  }

  private replySubject(value: string | undefined) {
    const subject = `${value ?? ''}`.trim() || '(no subject)'
    return /^re:/i.test(subject) ? subject : `Re: ${subject}`
  }
}
