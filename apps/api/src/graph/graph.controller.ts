import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { GraphService } from './graph.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('graph')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('graph')
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  get(@Req() req: any, @Query('q') q?: string) {
    return this.graph.getGraph(uid(req), q)
  }

  @Get('entity/:id')
  entity(@Req() req: any, @Param('id') id: string) {
    return this.graph.getEntity(uid(req), id)
  }

  @Post('rebuild')
  rebuild(@Req() req: any, @Query('full') full?: string) {
    return this.graph.rebuild(uid(req), full === 'true' || full === '1')
  }
}
