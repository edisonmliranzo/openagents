import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import { HttpService } from '@nestjs/axios'
import * as fs from 'fs/promises'
import * as path from 'path'
import FormData from 'form-data'

import type { 
  TTSRequest, 
  TTSResponse, 
  TTSVoiceConfig, 
  StreamingTTSChunk 
} from '@openagents/shared/src/types/tts'
import type { TTSProvider } from '@openagents/shared/src/types/tts'



@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name)
  private readonly tempDir = path.join(process.cwd(), 'tmp', 'tts')

  constructor(
    private config: ConfigService,
    private http: HttpService,
  ) {}

  async generateTTS(request: TTSRequest): Promise<TTSResponse> {
    const provider = (request.voice?.provider || 'openai') as TTSProvider
    switch (provider) {
      case 'openai':
        return this.openaiTts(request)
      case 'elevenlabs':
        return this.elevenlabsTts(request)
      default:
        throw new Error(`Unsupported TTS provider: ${provider}`)
    }
  }

  private async openaiTts(request: TTSRequest): Promise<TTSResponse> {
    const apiKey = this.config.get('OPENAI_API_KEY')
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

    const formData = new FormData()
    formData.append('model', 'tts-1')
    formData.append('input', request.text)
    formData.append('voice', request.voice?.voiceId || 'alloy')

    if (request.outputFormat) formData.append('response_format', request.outputFormat)
    if (request.sampleRate) formData.append('sample_rate', request.sampleRate.toString())

    const headers = formData.getHeaders()

    const response = await firstValueFrom(
      this.http.post('https://api.openai.com/v1/audio/speech', formData, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...headers,
        },
        responseType: 'arraybuffer',
      }),
    ) as any

    const audioBuffer = Buffer.from(response.data as ArrayBuffer)
    const filePath = await this.saveTempAudio(audioBuffer, 'openai', request.outputFormat || 'mp3')
    
    return {
      audioUrl: `/api/tts/audio/${path.basename(filePath)}`,
      duration: this.estimateDuration(request.text.length),
      format: request.outputFormat || 'mp3',
      provider: TTSProvider.OPENAI,
    }
  }

  private async elevenlabsTts(request: TTSRequest): Promise<TTSResponse> {
    const apiKey = this.config.get('ELEVENLABS_API_KEY')
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured')

    const params: Record<string, any> = {
      text: request.text,
      voice_id: request.voice?.voiceId || '21m00Tcm4TlvDq8ikWAM',
      model_id: 'eleven_monolingual_v1',
      optimize_streaming_latency: 1,
    }

    const response = await firstValueFrom(
      this.http.post('https://api.elevenlabs.io/v1/text-to-speech/' + params.voice_id, params, {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }),
    ) as any

    const audioBuffer = Buffer.from(response.data as ArrayBuffer)
    const filePath = await this.saveTempAudio(audioBuffer, 'elevenlabs', 'mp3')
    
    return {
      audioUrl: `/api/tts/audio/${path.basename(filePath)}`,
      duration: this.estimateDuration(request.text.length),
      format: 'mp3',
      provider: TTSProvider.ELEVENLABS,
    }
  }

  async streamTTS(request: TTSRequest): Promise<ReadableStream<StreamingTTSChunk>> {
    // Implement streaming TTS (WebSocket or chunked HTTP)
    // Placeholder for now - return non-streaming as chunks
    const response = await this.generateTTS(request)
    const audioBuffer = await fs.readFile(this.getTempPath(response.audioUrl))
    
    const chunkSize = 1024 * 4 // 4KB chunks
    const chunks: StreamingTTSChunk[] = []
    
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      const chunk = audioBuffer.slice(i, i + chunkSize)
      chunks.push({
        audioData: chunk.toString('base64'),
        timestamp: Date.now(),
        isFinal: i + chunkSize >= audioBuffer.length,
      })
    }
    
    return new ReadableStream({
      start(controller) {
        chunks.forEach(chunk => controller.enqueue(chunk))
        controller.close()
      }
    })
  }

  private async saveTempAudio(buffer: Buffer, provider: string, format: string): Promise<string> {
    await fs.mkdir(this.tempDir, { recursive: true })
    const timestamp = Date.now()
    const filename = `tts-${provider}-${timestamp}.${format}`
    const filePath = path.join(this.tempDir, filename)
    await fs.writeFile(filePath, buffer)
    
    // Auto-cleanup after 1 hour
    setTimeout(() => fs.unlink(filePath).catch(() => {}), 60 * 60 * 1000)
    
    return filePath
  }

  private estimateDuration(textLength: number): number {
    // Rough estimate: 150 words per minute = 2.5 words per second
    const words = textLength / 5 // average word length
    return words / 2.5
  }

  public getTempPath(audioUrl: string): string {
    return path.join(this.tempDir, path.basename(audioUrl))
  }


}

