import { Injectable, Logger } from '@nestjs/common'
import { createWorker, Worker } from 'tesseract.js'
import { Buffer } from 'buffer'

export interface ImageExtractionResult {
  success: boolean
  text: string
  confidence: number
  language: string
  error?: string
}

export interface PreprocessedMessage {
  content: string
  hasExtractedText: boolean
  extractedFrom?: string
  isImageFallback?: boolean
}

@Injectable()
export class ImagePreprocessorService {
  private readonly logger = new Logger(ImagePreprocessorService.name)
  private worker: Worker | null = null
  private isInitialized = false

  async onModuleInit() {
    await this.initializeWorker()
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }

  private async initializeWorker() {
    try {
      this.worker = await createWorker('eng')
      this.isInitialized = true
      this.logger.log('OCR worker initialized')
    } catch (error) {
      this.logger.error('Failed to initialize OCR worker', error)
    }
  }

  extractTextFromDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return null
    return { mediaType: match[1], data: match[2] }
  }

  isImageMediaType(mediaType: string): boolean {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
    return imageTypes.includes(mediaType.toLowerCase())
  }

  async extractText(
    imageData: string | Buffer,
    language: string = 'eng',
  ): Promise<ImageExtractionResult> {
    try {
      if (!this.isInitialized) {
        await this.initializeWorker()
      }

      if (!this.worker) {
        return {
          success: false,
          text: '',
          confidence: 0,
          language,
          error: 'OCR worker not available',
        }
      }

      let buffer: Buffer
      if (typeof imageData === 'string') {
        const extracted = this.extractTextFromDataUrl(imageData)
        if (!extracted) {
          return {
            success: false,
            text: '',
            confidence: 0,
            language,
            error: 'Invalid image data URL',
          }
        }
        buffer = Buffer.from(extracted.data, 'base64')
      } else {
        buffer = imageData
      }

      const result = await this.worker.recognize(buffer)
      const text = result.data.text.trim()

      this.logger.log(
        `Extracted ${text.length} characters with ${result.data.confidence.toFixed(1)}% confidence`,
      )

      return {
        success: true,
        text: text || '',
        confidence: result.data.confidence,
        language,
      }
    } catch (error) {
      this.logger.error('OCR extraction failed', error)
      return {
        success: false,
        text: '',
        confidence: 0,
        language,
        error: error instanceof Error ? error.message : 'Extraction failed',
      }
    }
  }

  async preprocessMessage(
    content: string,
    allowExtract: boolean = true,
  ): Promise<PreprocessedMessage> {
    if (!allowExtract) {
      return { content, hasExtractedText: false }
    }

    const extracted = this.extractTextFromDataUrl(content)
    if (!extracted || !this.isImageMediaType(extracted.mediaType)) {
      return { content, hasExtractedText: false }
    }

    const result = await this.extractText(content)

    if (result.success && result.text) {
      this.logger.log('Image processed, extracted text will be used')
      return {
        content: `[Image extracted text]\n${result.text}\n[End extracted text]`,
        hasExtractedText: true,
        extractedFrom: 'image',
        isImageFallback: true,
      }
    }

    return {
      content: '[Image could not be processed. Please describe what you see in the image.]',
      hasExtractedText: false,
      extractedFrom: 'image',
      isImageFallback: true,
    }
  }

  async preprocessMessages(
    messages: Array<{ role: string; content: string }>,
    allowExtract: boolean = true,
  ): Promise<Array<{ role: string; content: string }>> {
    const processed: Array<{ role: string; content: string }> = []

    for (const msg of messages) {
      const preprocessed = await this.preprocessMessage(msg.content, allowExtract)
      processed.push({ role: msg.role, content: preprocessed.content })
    }

    return processed
  }
}
