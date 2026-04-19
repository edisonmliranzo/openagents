import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface ApiKeyHealth {
  name: string
  envVar: string
  configured: boolean
  masked: string
  lastChecked: string | null
  status: 'healthy' | 'missing' | 'unknown'
}

const TRACKED_KEYS: Array<{ name: string; envVar: string }> = [
  { name: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { name: 'Google Gemini', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  { name: 'Perplexity', envVar: 'PERPLEXITY_API_KEY' },
  { name: 'AtlasCloud', envVar: 'ATLASCLOUD_API_KEY' },
  { name: 'MiniMax', envVar: 'MINIMAX_API_KEY' },
  { name: 'XAI / Grok', envVar: 'XAI_API_KEY' },
  { name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY' },
  { name: 'Mistral', envVar: 'MISTRAL_API_KEY' },
  { name: 'Groq', envVar: 'GROQ_API_KEY' },
  { name: 'WhatsApp', envVar: 'WHATSAPP_TOKEN' },
  { name: 'Telegram Bot', envVar: 'TELEGRAM_BOT_TOKEN' },
  { name: 'Slack Bot', envVar: 'SLACK_BOT_TOKEN' },
  { name: 'Airtable', envVar: 'AIRTABLE_API_KEY' },
  { name: 'HubSpot', envVar: 'HUBSPOT_ACCESS_TOKEN' },
  { name: 'ScreenshotOne', envVar: 'SCREENSHOTONE_API_KEY' },
]

function maskKey(val: string): string {
  if (!val || val.length < 8) return '••••••••'
  return val.slice(0, 4) + '••••••••' + val.slice(-4)
}

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  getHealth(): ApiKeyHealth[] {
    return TRACKED_KEYS.map((k) => {
      const val = process.env[k.envVar] ?? ''
      const configured = val.length > 4
      return {
        name: k.name,
        envVar: k.envVar,
        configured,
        masked: configured ? maskKey(val) : '—',
        lastChecked: new Date().toISOString(),
        status: configured ? 'healthy' : 'missing',
      }
    })
  }

  async rotateKey(envVar: string, newValue: string): Promise<{ success: boolean; message: string }> {
    // On self-hosted installs, write to the .env.prod file if it exists
    // This is a best-effort — env vars in the current process won't change until restart
    const envFilePath = process.env.ENV_FILE_PATH ?? '/app/infra/docker/.env.prod'
    try {
      const fs = await import('node:fs/promises')
      let content = await fs.readFile(envFilePath, 'utf-8')
      const regex = new RegExp(`^${envVar}=.*$`, 'm')
      if (regex.test(content)) {
        content = content.replace(regex, `${envVar}=${newValue}`)
      } else {
        content += `\n${envVar}=${newValue}\n`
      }
      await fs.writeFile(envFilePath, content, 'utf-8')
      // Update current process env
      process.env[envVar] = newValue
      return { success: true, message: `${envVar} updated in .env.prod. Restart containers to apply.` }
    } catch (err: any) {
      // Fallback: just update process.env for current session
      process.env[envVar] = newValue
      return {
        success: true,
        message: `${envVar} updated in memory. Could not write to env file: ${err?.message}. Set ENV_FILE_PATH to enable persistence.`,
      }
    }
  }
}
