import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ReplayController } from './replay.controller'
import { ReplayService } from './replay.service'
import { ReplayForkService } from './replay-fork.service'

@Module({
  imports: [PrismaModule],
  providers: [ReplayService, ReplayForkService],
  controllers: [ReplayController],
  exports: [ReplayService],
})
export class ReplayModule {}

