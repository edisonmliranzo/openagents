import { Controller, Post, Get, Delete, Param, Body, Query } from '@nestjs/common'
import { TemplateService } from './template.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('templates')
export class TemplateController {
  constructor(private templates: TemplateService) {}

  @Get()
  list(@CurrentUserId() userId?: string, @Query('category') category?: string) {
    return this.templates.list(userId, category)
  }

  @Get('categories')
  categories(@CurrentUserId() userId?: string) { return this.templates.getCategories(userId) }

  @Get(':id')
  get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.templates.get(id, userId)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: any) {
    // The owner always comes from the token.
    return this.templates.create({ ...body, userId })
  }

  @Post(':id/use')
  recordUse(@Param('id') id: string) { return this.templates.recordUse(id) }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.templates.delete(id, userId)
  }
}
