import { Module } from '@nestjs/common'
import { CollaborationService } from './collaboration.service'
import { CollaborationController } from './collaboration.controller'

@Module({
  imports: [],
  controllers: [CollaborationController],
  providers: [CollaborationService],
  exports: [CollaborationService],
})
export class CollaborationModule {}