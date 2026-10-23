import { Module } from '@nestjs/common'
import { MemoryService } from './memory.service'
import { MemoryController } from './memory.controller'
import { EmbeddingService } from './embedding.service'
import { DeepDreamService } from './deep-dream.service'
import { LessonsStoreModule } from '../reflection/lessons-store.module'

@Module({
  imports: [LessonsStoreModule],
  providers: [MemoryService, EmbeddingService, DeepDreamService],
  controllers: [MemoryController],
  exports: [MemoryService, EmbeddingService, DeepDreamService],
})
export class MemoryModule {}
