import { Module } from '@nestjs/common'
import { ExtractionController } from './extraction.controller'
import { ExtractionInternalController } from './extraction.internal.controller'
import { ExtractionService } from './extraction.service'

@Module({
  controllers: [ExtractionController, ExtractionInternalController],
  providers: [ExtractionService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
