export interface VisionConfig {
  provider: 'anthropic' | 'openai' | 'google'
  model?: string
  maxTokens?: number
}

export interface VisionInput {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    images?: string[]
  }>
}

export interface VisionResult {
  success: boolean
  content?: string
  error?: string
}

export interface ImageMessage {
  type: 'image'
  source: {
    type: 'base64' | 'url'
    media_type: string
    data: string
  }
}

export interface TextMessage {
  type: 'text'
  text: string
}

export type MessageContent = ImageMessage | TextMessage

export class VisionEngine {
  private config: VisionConfig

  constructor(config: VisionConfig) {
    this.config = config
  }

  async process(input: VisionInput): Promise<VisionResult> {
    try {
      switch (this.config.provider) {
        case 'anthropic':
          return await this.anthropicVision(input)
        case 'openai':
          return await this.openaiVision(input)
        case 'google':
          return await this.googleVision(input)
        default:
          return { success: false, error: 'Unknown provider' }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Vision processing failed',
      }
    }
  }

  private async anthropicVision(input: VisionInput): Promise<VisionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { success: false, error: 'Anthropic API key not configured' }
    }

    const messages = input.messages.map((msg) => ({
      role: msg.role,
      content: msg.images?.length
        ? [
            { type: 'text', text: msg.content },
            ...msg.images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: this.guessMediaType(img),
                data: this.extractBase64(img),
              },
            })),
          ]
        : msg.content,
    }))

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-opus-20240229',
        max_tokens: this.config.maxTokens || 4096,
        messages,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const data = (await response.json()) as { content?: Array<{ text: string }> }
    return {
      success: true,
      content: data.content?.[0]?.text || '',
    }
  }

  private async openaiVision(input: VisionInput): Promise<VisionResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { success: false, error: 'OpenAI API key not configured' }
    }

    const messages = input.messages.map((msg) => ({
      role: msg.role,
      content: msg.images?.length
        ? [
            { type: 'text', text: msg.content },
            ...msg.images.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${this.extractBase64(img)}` },
            })),
          ]
        : msg.content,
    }))

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-4-turbo',
        messages,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const data = (await response.json()) as {
      choices?: Array<{ message: { content: string } }>
    }
    return {
      success: true,
      content: data.choices?.[0]?.message?.content || '',
    }
  }

  private async googleVision(input: VisionInput): Promise<VisionResult> {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      return { success: false, error: 'Google API key not configured' }
    }

    const lastMsg = input.messages[input.messages.length - 1]
    if (!lastMsg?.images?.length) {
      return { success: false, error: 'No images provided' }
    }

    const parts = lastMsg.images.map((img) => ({
      inlineData: {
        mimeType: this.guessMediaType(img),
        data: this.extractBase64(img),
      },
    }))

    parts.push({ text: lastMsg.content })

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${this.config.model || 'gemini-pro-vision'}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      },
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return {
      success: true,
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    }
  }

  private extractBase64(dataUrl: string): string {
    if (dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/)
      return match?.[1] || dataUrl
    }
    return dataUrl
  }

  private guessMediaType(data: string): string {
    if (data.startsWith('/9j/')) return 'image/jpeg'
    if (data.startsWith('iVBOR')) return 'image/png'
    if (data.startsWith('GIF')) return 'image/gif'
    if (data.startsWith('UklGR')) return 'image/webp'
    return 'image/jpeg'
  }
}

export function createVisionClient(config: VisionConfig): VisionEngine {
  return new VisionEngine(config)
}
