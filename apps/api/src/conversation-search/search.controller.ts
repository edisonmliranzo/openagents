import { Controller, Get, Query } from '@nestjs/common'
import { ConversationSearchService } from './search.service'

@Controller('api/v1/conversations/search')
export class ConversationSearchController {
  constructor(private search: ConversationSearchService) {}

  @Get()
  searchConversations(
    @Query('q') query: string,
    @Query('userId') userId: string,
    @Query('conversationId') conversationId?: string,
    @Query('role') role?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.search.search({
      query: query ?? '',
      userId,
      conversationId,
      role: role as any,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      dateFrom,
      dateTo,
    })
  }
}
