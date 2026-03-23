import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { DataLineageService } from './lineage.service'

@ApiTags('lineage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lineage')
export class DataLineageController {
  constructor(private lineage: DataLineageService) {}

  @Get('recent')
  recent(@Req() req: any, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '60', 10)
    const safe = Number.isFinite(parsed) ? parsed : 60
    return this.lineage.listRecent(req.user.id, safe)
  }

  @Get('conversation/:conversationId')
  byConversation(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '60', 10)
    const safe = Number.isFinite(parsed) ? parsed : 60
    return this.lineage.listConversation(req.user.id, conversationId, safe)
  }

  @Get('conversation/:conversationId/graph')
  graph(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '80', 10)
    const safe = Number.isFinite(parsed) ? parsed : 80
    return this.lineage.buildConversationGraph(req.user.id, conversationId, safe)
  }

  @Get('message/:messageId')
  byMessage(@Req() req: any, @Param('messageId') messageId: string) {
    return this.lineage.getByMessage(req.user.id, messageId)
  }

  @Get('anomalies')
  anomalies(@Req() req: any) {
    return this.lineage.detectAnomalies(req.user.id)
  }
}
