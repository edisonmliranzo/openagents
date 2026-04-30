import { Controller, Post, Body, Get, Param, Res, StreamableFile } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Response } from 'express'
import { TtsService } from './tts.service'
import type { TTSRequest, TTSResponse, TTSVoiceConfig } from '@openagents/shared/src/types/tts'
import type { StreamableFile } from '@nestjs/common'

@ApiTags('tts')
@Controller('tts')
export class TtsController {
  constructor(private tts: TtsService) {}

  @Post('speak')
  @ApiOperation({ summary: 'Generate speech from text' })
  @ApiResponse({ status: 200, description: 'TTS generated successfully' })
  async speak(@Body() request: TTSRequest): Promise<TTSResponse> {
    return this.tts.generateTTS(request)
  }

@Post('stream')
  @ApiOperation({ summary: 'Stream speech from text (WebSocket/SSE compatible)' })
  async stream(@Body() request: TTSRequest, @Res() res: Response) {
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    
    const stream = await this.tts.streamTTS(request)
    ;(stream as any).pipe(res)
  }

  @Get('voices')
  @ApiOperation({ summary: 'List available voices' })
  voices() {
    // Return cached or fetched voice list
    return [
      { id: 'alloy', name: 'Alloy', provider: 'openai', gender: 'neutral' },
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Adam', provider: 'elevenlabs', gender: 'male' },
    ]
  }

  @Get('audio/:filename')
  @ApiOperation({ summary: 'Serve TTS audio file' })
  async getAudio(@Param('filename') filename: string, @Res() res: Response): Promise<StreamableFile> {
    // Security: validate filename
    if (filename.includes('..') || !filename.match(/\.mp3$/)) {
      throw new Error('Invalid filename')
    }
    
    const filePath = this.tts.getTempPath(`/api/tts/audio/${filename}`)
    return new StreamableFile(filePath, {
      type: 'audio/mpeg',
      disposition: 'inline',
    })
  }
}

