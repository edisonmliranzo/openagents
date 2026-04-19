import { Injectable } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class WhatsAppSendTool {
  readonly def: ToolDefinition = {
    name: 'whatsapp_send',
    displayName: 'WhatsApp Send Message',
    description: 'Send a WhatsApp message to a phone number via Meta Cloud API (requires WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID env vars). Phone number must include country code, e.g. +12025551234.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      required: ['to', 'message'],
      properties: {
        to: { type: 'string', description: 'Recipient phone number with country code, e.g. +12025551234' },
        message: { type: 'string', description: 'Text message to send (max 4096 chars)' },
        preview_url: { type: 'boolean', description: 'Enable link preview in message (default false)' },
      },
    },
  }

  async send(input: { to: string; message: string; preview_url?: boolean }, _userId: string): Promise<ToolResult> {
    const token = process.env.WHATSAPP_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

    if (!token || !phoneNumberId) {
      return {
        success: false,
        output: 'WhatsApp not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID environment variables.',
      }
    }

    const to = input.to.replace(/\s+/g, '').replace(/^\+/, '')
    const message = (input.message ?? '').slice(0, 4096)

    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { body: message, preview_url: input.preview_url ?? false },
          }),
        },
      )
      const data: any = await res.json()
      if (!res.ok) {
        return { success: false, output: `WhatsApp API error: ${data?.error?.message ?? JSON.stringify(data)}` }
      }
      return {
        success: true,
        output: `Message sent to +${to}. Message ID: ${data?.messages?.[0]?.id ?? 'unknown'}`,
      }
    } catch (err: any) {
      return { success: false, output: `Failed to send WhatsApp message: ${err?.message ?? err}` }
    }
  }
}
