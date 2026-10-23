import { Module } from '@nestjs/common'
import { ReactionService } from './reaction.service'
import { ReactionController } from './reaction.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [ReactionService],
  controllers: [ReactionController],
  exports: [ReactionService],
})
export class ReactionsModule {}
