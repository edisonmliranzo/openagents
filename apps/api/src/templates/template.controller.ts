import { Controller, Post, Get, Delete, Param, Body, Query } from '@nestjs/common'
import { TemplateService } from './template.service'

@Controller('api/v1/templates')
export class TemplateController {
  constructor(private templates: TemplateService) {}

  @Get()
  list(@Query('userId') userId?: string, @Query('category') category?: string) {
    return this.templates.list(userId, category)
  }

  @Get('categories')
  categories() { return this.templates.getCategories() }

  @Get(':id')
  get(@Param('id') id: string) { return this.templates.get(id) }

  @Post()
  create(@Body() body: any) { return this.templates.create(body) }

  @Post(':id/use')
  recordUse(@Param('id') id: string) { return this.templates.recordUse(id) }

  @Delete(':id')
  delete(@Param('id') id: string) { return this.templates.delete(id) }
}
