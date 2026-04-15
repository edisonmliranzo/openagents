import { Module } from '@nestjs/common'
import { OrchestrationService } from './orchestration.service'
import { OrchestrationController } from './orchestration.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [OrchestrationController],
  providers: [OrchestrationService],
  exports: [OrchestrationService],
})
export class OrchestrationModule {}