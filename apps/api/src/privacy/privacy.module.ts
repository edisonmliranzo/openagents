import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { PrivacyController } from './privacy.controller'
import { PrivacyService } from './privacy.service'

@Module({
  imports: [PrismaModule],
  providers: [PrivacyService],
  controllers: [PrivacyController],
  exports: [PrivacyService],
})
export class PrivacyModule {}
