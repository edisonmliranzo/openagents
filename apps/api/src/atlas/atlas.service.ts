import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'


@Injectable()
export class AtlasService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.ATLASCLOUD_API_KEY,
      baseURL: 'https://api.atlascloud.ai/v1',
    })
  }

  async chatCompletion(messages: any[], model = 'owl', options = {}) {
    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
      stream: options.stream || false,
      ...options,
    })
    return response
  }
  
  async fetch(url: string, options: RequestInit = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ATLASCLOUD_API_KEY}`,
        ...(options.headers as any),
      },
    })
    return response.json()
  }
}

