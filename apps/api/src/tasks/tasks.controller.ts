import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { TasksService } from './tasks.service'

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { goal: string; successCriteria?: string; target?: string; maxSteps?: number },
  ) {
    return this.tasks.create(req.user.id, body)
  }

  @Get()
  list(@Req() req: any) {
    return this.tasks.list(req.user.id)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.tasks.get(req.user.id, id)
  }

  @Post(':id/approve')
  approve(@Req() req: any, @Param('id') id: string) {
    return this.tasks.approve(req.user.id, id)
  }

  @Post(':id/cancel')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.tasks.cancel(req.user.id, id)
  }
}
