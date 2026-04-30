import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs/promises'
import * as path from 'path'
import { VisionService } from './vision.service'
import type { ImageAnalysisResult } from './vision.service'

@Injectable()
export class ImageUploadService {
  private readonly tempDir = path.join(process.cwd(), 'tmp', 'uploads')

  constructor(
    private config: ConfigService,
    private vision: VisionService,
  ) {}

async handleImageUpload(file: any, userId: string): Promise<{ analysis: ImageAnalysisResult; artifact: any }> {
  // TODO: Integrate with Multer for file upload in controller
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }

    // Validate image
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only images are supported')
    }

    if (file.size > 20 * 1024 * 1024) { // 20MB limit
      throw new BadRequestException('File too large (max 20MB)')
    }

    // Save temp file
    await fs.mkdir(this.tempDir, { recursive: true })
    const filename = `${uuidv4()}.${file.originalname.split('.').pop() || 'jpg'}`
    const filepath = path.join(this.tempDir, filename)
    await fs.writeFile(filepath, file.buffer)

    try {
      // Analyze with vision service
    const analysis = await this.vision.analyzeImage({ imageUrl: filepath }, userId)

      return {
        analysis,
        artifact: {
          name: file.originalname,
          type: 'image' as const,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          url: `/api/vision/temp/${filename}`,
        summary: analysis.description,
        },
      }
    } finally {
      // Cleanup
      fs.unlink(filepath).catch(() => {})
    }
  }
}

