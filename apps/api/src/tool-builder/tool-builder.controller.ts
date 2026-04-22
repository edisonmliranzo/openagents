import { Controller, Post, Get, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { ToolBuilderService } from './tool-builder.service'

@Controller('api/v1/tool-builder')
export class ToolBuilderController {
  constructor(private toolBuilder: ToolBuilderService) {}

  @Post()
  create(@Body() body: any) { return this.toolBuilder.create(body) }

  @Get()
  list(@Query('userId') userId: string) { return this.toolBuilder.list(userId) }

  @Get(':id')
  get(@Param('id') id: string) { return this.toolBuilder.get(id) }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.toolBuilder.update(id, body) }

  @Post(':id/execute')
  execute(@Param('id') id: string, @Body() body: any) { return this.toolBuilder.execute(id, body) }

  @Delete(':id')
  delete(@Param('id') id: string) { return this.toolBuilder.delete(id) }

  @Get('definitions')
  definitions(@Query('userId') userId: string) { return this.toolBuilder.getToolDefinitions(userId) }
}
