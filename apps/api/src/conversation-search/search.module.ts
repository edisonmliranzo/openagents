import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ConversationSearchService } from './search.service'
import { ConversationSearchController } from './search.controller'

@Module({
  imports: [PrismaModule],
  providers: [ConversationSearchService],
  controllers: [ConversationSearchController],
  exports: [ConversationSearchService],
})
export class ConversationSearchModule {}
