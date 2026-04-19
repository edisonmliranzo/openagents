import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class SlackSendTool {
  private readonly logger = new Logger(SlackSendTool.name)

  get def(): ToolDefinition {
    return {
      name: 'slack_send',
      displayName: 'Slack Send',
      description:
        'Send a message to a Slack channel or user via Incoming Webhook or Bot token. Requires SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL in environment.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'The Slack channel (e.g. "#general") or user (e.g. "@username") to send the message to.',
          },
          message: {
            type: 'string',
            description: 'The message text to send.',
          },
          blocks: {
            type: 'boolean',
            description:
              'If true, wraps the message in a Slack Block Kit section block. Defaults to false.',
          },
        },
        required: ['channel', 'message'],
      },
    }
  }

  async send(
    input: {
      channel: string
      message: string
      blocks?: boolean
    },
    _userId: string,
  ): Promise<ToolResult> {
    const { channel, message, blocks = false } = input

    if (!channel) return { success: false, output: null, error: 'channel is required.' }
    if (!message) return { success: false, output: null, error: 'message is required.' }

    const botToken = process.env.SLACK_BOT_TOKEN
    const webhookUrl = process.env.SLACK_WEBHOOK_URL

    if (!botToken && !webhookUrl) {
      return {
        success: false,
        output: null,
        error: 'Neither SLACK_BOT_TOKEN nor SLACK_WEBHOOK_URL is configured.',
      }
    }

    const body: Record<string, unknown> = { text: message }

    if (blocks) {
      body.blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message,
          },
        },
      ]
    }

    this.logger.log(`slack_send: sending to ${channel}`)

    try {
      // Prefer Bot Token
      if (botToken) {
        body.channel = channel
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${botToken}`,
          },
          body: JSON.stringify(body),
        })

        const data = (await res.json()) as any
        if (!data.ok) {
          return { success: false, output: null, error: data.error ?? 'Slack API error' }
        }

        return {
          success: true,
          output: { ok: true, channel: data.channel ?? channel, ts: data.ts },
        }
      }

      // Fallback to Webhook
      const res = await fetch(webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          output: null,
          error: `Slack webhook error ${res.status}: ${errText.slice(0, 400)}`,
        }
      }

      return {
        success: true,
        output: { ok: true, channel, ts: null },
      }
    } catch (err: any) {
      this.logger.error(`slack_send error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }
}
