import { Module } from '@nestjs/common'
import { AbTestingController } from './ab-testing.controller'
import { AbTestingService } from './ab-testing.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [AbTestingController],
  providers: [AbTestingService],
  exports: [AbTestingService],
})
export class AbTestingModule {}
