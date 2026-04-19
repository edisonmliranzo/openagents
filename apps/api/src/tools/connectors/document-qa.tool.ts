import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

const DEFAULT_MODEL = 'gpt-4.1-mini'
const SYSTEM_PROMPT = 'You are a document analyst. Answer based only on the provided document.'

@Injectable()
export class DocumentQATool {
  private readonly logger = new Logger(DocumentQATool.name)
  private openaiClient: OpenAI | null = null

  private get openai(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    return this.openaiClient
  }

  get def(): ToolDefinition {
    return {
      name: 'document_qa',
      displayName: 'Document Q&A',
      description:
        'Answer questions about a document from a URL or base64 content. Fetches the document, extracts text, and answers the question using the LLM context.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question to answer about the document.',
          },
          url: {
            type: 'string',
            description: 'URL of the document to fetch and analyze.',
          },
          content: {
            type: 'string',
            description: 'Raw document text content (used if url is not provided).',
          },
          max_chars: {
            type: 'number',
            description: 'Maximum characters of document text to use. Defaults to 12000.',
          },
        },
        required: ['question'],
      },
    }
  }

  async answer(
    input: {
      question: string
      url?: string
      content?: string
      max_chars?: number
    },
    _userId: string,
  ): Promise<ToolResult> {
    if (!input.question) {
      return { success: false, output: null, error: 'question is required.' }
    }

    if (!input.url && !input.content) {
      return { success: false, output: null, error: 'Either url or content must be provided.' }
    }

    const maxChars = input.max_chars ?? 12000

    this.logger.log(`document_qa: question="${input.question.slice(0, 80)}" url=${input.url ?? '(content)'}`)

    let rawText: string

    try {
      if (input.url) {
        rawText = await this.fetchDocumentText(input.url)
      } else {
        rawText = input.content!
      }
    } catch (err: any) {
      this.logger.error(`document_qa fetch error: ${err.message}`)
      return { success: false, output: null, error: `Failed to fetch document: ${err.message}` }
    }

    const text = rawText.slice(0, maxChars)
    const charsUsed = text.length

    const apiKey = process.env.OPENAI_API_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY

    try {
      let answerText: string
      let modelUsed: string

      if (apiKey) {
        // Use OpenAI gpt-4.1-mini
        modelUsed = DEFAULT_MODEL
        const response = await this.openai.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Document:\n\n${text}\n\n---\n\nQuestion: ${input.question}`,
            },
          ],
        })
        answerText = response.choices[0]?.message?.content ?? ''
      } else if (anthropicKey) {
        // Fallback to Anthropic
        modelUsed = 'claude-3-haiku-20240307'
        const { default: Anthropic } = await import('@anthropic-ai/sdk')
        const anthropic = new Anthropic({ apiKey: anthropicKey })
        const response = await anthropic.messages.create({
          model: modelUsed,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Document:\n\n${text}\n\n---\n\nQuestion: ${input.question}`,
            },
          ],
        })
        const block = response.content[0]
        answerText = block.type === 'text' ? block.text : ''
      } else {
        return { success: false, output: null, error: 'No AI API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY).' }
      }

      return {
        success: true,
        output: {
          answer: answerText,
          source_url: input.url ?? null,
          chars_used: charsUsed,
          model: modelUsed,
        },
      }
    } catch (err: any) {
      this.logger.error(`document_qa LLM error: ${err.message}`)
      return { success: false, output: null, error: err.message }
    }
  }

  private async fetchDocumentText(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'OpenAgents/1.0 DocumentQA' },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }

    const contentType = response.headers.get('content-type') ?? ''

    // Try pdf-parse for PDF content
    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParseModule = require('pdf-parse')
        const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const parsed = await pdfParse(buffer)
        return parsed.text
      } catch (_pdfErr) {
        // Fallback to raw text
        const arrayBuffer = await response.arrayBuffer()
        return Buffer.from(arrayBuffer).toString('utf-8')
      }
    }

    // Default: plain text / HTML
    return response.text()
  }
}
