import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class TelegramSendTool {
  readonly def: ToolDefinition = {
    name: 'telegram_send',
    displayName: 'Telegram Send Message',
    description: 'Send a Telegram message to a chat ID via Bot API (requires TELEGRAM_BOT_TOKEN env var). Use chat ID (number) or @username.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      required: ['chat_id', 'message'],
      properties: {
        chat_id: { type: 'string', description: 'Telegram chat ID (numeric) or @username' },
        message: { type: 'string', description: 'Message text to send (supports Markdown)' },
        parse_mode: {
          type: 'string',
          enum: ['Markdown', 'HTML', 'MarkdownV2'],
          description: 'Telegram parse mode for formatting (default: Markdown)',
        },
        disable_notification: { type: 'boolean', description: 'Send silently without notification sound' },
      },
    },
  }

  async send(
    input: { chat_id: string; message: string; parse_mode?: string; disable_notification?: boolean },
    _userId: string,
  ): Promise<ToolResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return {
        success: false,
        output: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN environment variable.',
      }
    }

    const message = (input.message ?? '').slice(0, 4096)

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.chat_id,
          text: message,
          parse_mode: input.parse_mode ?? 'Markdown',
          disable_notification: input.disable_notification ?? false,
        }),
      })
      const data: any = await res.json()
      if (!data.ok) {
        return { success: false, output: `Telegram error: ${data?.description ?? JSON.stringify(data)}` }
      }
      return {
        success: true,
        output: `Message sent to ${input.chat_id}. Message ID: ${data?.result?.message_id ?? 'unknown'}`,
      }
    } catch (err: any) {
      return { success: false, output: `Failed to send Telegram message: ${err?.message ?? err}` }
    }
  }
}
