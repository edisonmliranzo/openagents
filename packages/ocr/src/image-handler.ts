import { OcrEngine } from './engine'

export interface ImageToTextOptions {
  language?: string
  enhanceImage?: boolean
}

export class ImageHandler {
  private ocr: OcrEngine

  constructor(options?: ImageToTextOptions) {
    this.ocr = new OcrEngine({ language: options?.language || 'eng' })
  }

  async processImage(imageData: Buffer | Uint8Array | string): Promise<{
    success: boolean
    text: string
    confidence: number
    error?: string
  }> {
    try {
      const result = await this.ocr.recognize({ imageData })

      if (result.success) {
        return {
          success: true,
          text: result.text,
          confidence: result.confidence,
        }
      }

      return {
        success: false,
        text: '',
        confidence: 0,
        error: result.error,
      }
    } catch (err) {
      return {
        success: false,
        text: '',
        confidence: 0,
        error: err instanceof Error ? err.message : 'Image processing failed',
      }
    }
  }

  async processImages(
    imageFiles: Array<{ filename: string; data: Buffer | Uint8Array | string }[]>,
  ): Promise<
    Array<{
      filename: string
      success: boolean
      text: string
      error?: string
    }>
  > {
    const results = []

    for (const file of imageFiles) {
      const result = await this.processImage(file.data)
      results.push({
        filename: file.filename,
        ...result,
      })
    }

    return results
  }
}

export function createImageHandler(options?: ImageToTextOptions): ImageHandler {
  return new ImageHandler(options)
}

export function isImageFile(filename: string): boolean {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif']
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return imageExtensions.includes(ext)
}

export function extractTextFromImageError(modelName: string): string {
  return `This model (${modelName}) does not support image input. The image has been processed using OCR and the extracted text will be used instead.`
}
