import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { EvalService } from './eval.service'

@ApiTags('eval')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('eval')
export class EvalController {
  constructor(private readonly evalService: EvalService) {}

  @Get('golden')
  listGolden(@Req() req: any) {
    return this.evalService.listGoldenTasks(req.user.id)
  }

  @Post('golden')
  addGolden(@Req() req: any, @Body() body: { prompt: string; notes?: string }) {
    return this.evalService.addGoldenTask(req.user.id, body)
  }

  @Delete('golden/:id')
  removeGolden(@Req() req: any, @Param('id') id: string) {
    return this.evalService.deleteGoldenTask(req.user.id, id)
  }

  @Post('run')
  run(@Req() req: any) {
    return this.evalService.runSuite(req.user.id)
  }

  @Get('results')
  results(@Req() req: any) {
    return this.evalService.results(req.user.id)
  }
}
