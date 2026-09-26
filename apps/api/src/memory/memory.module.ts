import { Module } from '@nestjs/common'
import { MemoryService } from './memory.service'
import { MemoryController } from './memory.controller'
import { EmbeddingService } from './embedding.service'

@Module({
  providers: [MemoryService, EmbeddingService],
  controllers: [MemoryController],
  exports: [MemoryService, EmbeddingService],
})
export class MemoryModule {}
