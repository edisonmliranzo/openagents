import { Module } from '@nestjs/common'
import { VisionService } from './vision.service'
import { ImageUploadService } from './image-upload.service'

@Module({
  providers: [VisionService, ImageUploadService],
  exports: [VisionService, ImageUploadService],
})
export class VisionModule {}
