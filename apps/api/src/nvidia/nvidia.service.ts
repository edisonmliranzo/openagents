import { Injectable } from '@nestjs/common'
import { NimApi } from '@nvidia/nim-sdk' // Pseudo-import, use actual SDK

@Injectable()
export class NvidiaService {
  private nim: NimApi

  constructor() {
    this.nim = new NimApi({
      apiKey: process.env.NVIDIA_NIM_API_KEY,
      endpoint: process.env.NVIDIA_NIM_ENDPOINT || 'https://api.nvidia.com/nim',
    })
  }

  async chatCompletion(prompt: string, model = 'meta/llama3-70b-instruct') {
    const response = await this.nim.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    })
    return { content: response.choices[0].message.content }
  }
}


