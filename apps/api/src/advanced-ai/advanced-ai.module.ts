import { Module } from '@nestjs/common'
import { ReasoningService } from './reasoning.service'
import { ReflectionService } from './reflection.service'
import { AdvancedAIController } from './advanced-ai.controller'

@Module({
  providers: [ReasoningService, ReflectionService],
  controllers: [AdvancedAIController],
  exports: [ReasoningService, ReflectionService],
})
export class AdvancedAIModule {}