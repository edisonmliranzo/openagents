import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class BrowserScreenshotTool {
  private readonly logger = new Logger(BrowserScreenshotTool.name)

  get def(): ToolDefinition {
    return {
      name: 'browser_screenshot',
      displayName: 'Browser Screenshot',
      description:
        'Take a screenshot of any public URL and return the image as base64. Uses the Screenshotone API (SCREENSHOTONE_API_KEY) or falls back to a free service.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The public URL to screenshot.',
          },
          width: {
            type: 'number',
            description: 'Viewport width in pixels. Defaults to 1280.',
          },
          height: {
            type: 'number',
            description: 'Viewport height in pixels. Defaults to 800.',
          },
          full_page: {
            type: 'boolean',
            description: 'If true, capture the full page height. Defaults to false.',
          },
        },
        required: ['url'],
      },
    }
  }

  async screenshot(
    input: {
      url: string
      width?: number
      height?: number
      full_page?: boolean
    },
    _userId: string,
  ): Promise<ToolResult> {
    const { url, width = 1280, height = 800, full_page = false } = input

    if (!url) return { success: false, output: null, error: 'url is required.' }

    this.logger.log(`browser_screenshot: ${url} ${width}x${height} full_page=${full_page}`)

    try {
      const apiKey = process.env.SCREENSHOTONE_API_KEY

      if (apiKey) {
        // Use Screenshotone API
        const params = new URLSearchParams({
          access_key: apiKey,
          url,
          viewport_width: String(width),
          viewport_height: String(height),
          full_page_screenshot: String(full_page),
          format: 'png',
          response_type: 'base64',
        })

        const apiUrl = `https://api.screenshotone.com/take?${params.toString()}`
        const res = await fetch(apiUrl)

        if (!res.ok) {
          const errText = await res.text()
          return {
            success: false,
            output: null,
            error: `Screenshotone error ${res.status}: ${errText.slice(0, 400)}`,
          }
        }

        const base64 = await res.text()
        return {
          success: true,
          output: {
            image_base64: base64,
            url,
            width,
            height,
          },
        }
      }

      // Fallback: apiflash free tier (returns image URL)
      const params = new URLSearchParams({
        access_key: 'free',
        url: encodeURIComponent(url),
        width: String(width),
        height: String(height),
        format: 'png',
      })

      const imageUrl = `https://api.apiflash.com/v1/urltoimage?${params.toString()}`

      return {
        success: true,
        output: {
          image_url: imageUrl,
          url,
          width,
          height,
        },
      }
    } catch (err: any) {
      this.logger.error(`browser_screenshot error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }
}
