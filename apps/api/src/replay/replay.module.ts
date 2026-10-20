import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ReplayController } from './replay.controller'
import { ReplayService } from './replay.service'

@Module({
  imports: [PrismaModule],
  providers: [ReplayService],
  controllers: [ReplayController],
  exports: [ReplayService],
})
export class ReplayModule {}
