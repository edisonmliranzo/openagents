import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class PdfExtractTool {
  private readonly logger = new Logger(PdfExtractTool.name)

  get def(): ToolDefinition {
    return {
      name: 'pdf_extract',
      displayName: 'PDF Extract',
      description: 'Extract text content from a PDF URL. Returns the full extracted text with page count.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the PDF to extract text from.',
          },
          max_pages: {
            type: 'number',
            description: 'Maximum number of pages to extract. Defaults to 20.',
          },
        },
        required: ['url'],
      },
    }
  }

  async extract(
    input: {
      url: string
      max_pages?: number
    },
    _userId: string,
  ): Promise<ToolResult> {
    const { url, max_pages = 20 } = input

    if (!url) {
      return { success: false, output: null, error: 'url is required.' }
    }

    this.logger.log(`pdf_extract: fetching ${url}`)

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/pdf' },
      })

      if (!res.ok) {
        return {
          success: false,
          output: null,
          error: `Failed to fetch PDF: HTTP ${res.status}`,
        }
      }

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Try pdf-parse if available
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require('pdf-parse')
        const data = await pdfParse(buffer, { max: max_pages })
        const text = data.text ?? ''
        return {
          success: true,
          output: {
            text,
            pages: data.numpages ?? 0,
            chars: text.length,
            url,
          },
        }
      } catch (_pdfErr) {
        // Fallback: extract printable ASCII from raw buffer
        const text = buffer
          .toString('latin1')
          .replace(/[^\x20-\x7E\n]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        return {
          success: true,
          output: {
            text,
            pages: 0,
            chars: text.length,
            url,
          },
        }
      }
    } catch (err: any) {
      this.logger.error(`pdf_extract error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }
}
