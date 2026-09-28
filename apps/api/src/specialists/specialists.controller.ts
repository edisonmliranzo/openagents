import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { SpecialistsService, type CreateSpecialistInput } from './specialists.service'

@ApiTags('specialists')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('specialists')
export class SpecialistsController {
  constructor(private readonly specialists: SpecialistsService) {}

  @Get()
  list(@Req() req: any) {
    return this.specialists.list(req.user.id)
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateSpecialistInput) {
    return this.specialists.create(req.user.id, body)
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: Partial<CreateSpecialistInput> & { enabled?: boolean }) {
    return this.specialists.update(req.user.id, id, body)
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.specialists.remove(req.user.id, id)
  }
}
