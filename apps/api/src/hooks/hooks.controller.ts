import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { HooksService } from './hooks.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'

@Controller('hooks')
export class HooksController {
  constructor(private hooks: HooksService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.hooks.list(userId)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: any) {
    return this.hooks.create(userId, body)
  }

  @Patch(':id')
  async update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: any) {
    return this.hooks.update(userId, id, body)
  }

  @Delete(':id')
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return { ok: await this.hooks.delete(userId, id) }
  }
}
