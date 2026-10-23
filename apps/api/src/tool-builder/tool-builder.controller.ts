import { Controller, Post, Get, Patch, Delete, Param, Body, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ToolBuilderService } from './tool-builder.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('tool-builder')
export class ToolBuilderController {
  constructor(private toolBuilder: ToolBuilderService) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: any) {
    // The owner always comes from the token — never from the request body.
    return this.toolBuilder.create({ ...body, userId })
  }

  @Get()
  list(@CurrentUserId() userId: string) { return this.toolBuilder.list(userId) }

  @Get('definitions')
  definitions(@CurrentUserId() userId: string) { return this.toolBuilder.getToolDefinitions(userId) }

  @Get(':id')
  async get(@CurrentUserId() userId: string, @Param('id') id: string) {
    const tool = await this.toolBuilder.get(id)
    this.assertOwner(tool, userId)
    return tool
  }

  @Patch(':id')
  async update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: any) {
    const tool = await this.toolBuilder.get(id)
    this.assertOwner(tool, userId)
    return this.toolBuilder.update(id, userId, body)
  }

  @Post(':id/execute')
  async execute(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: any) {
    const tool = await this.toolBuilder.get(id)
    this.assertOwner(tool, userId)
    return this.toolBuilder.execute(id, body)
  }

  @Delete(':id')
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    const tool = await this.toolBuilder.get(id)
    this.assertOwner(tool, userId)
    return this.toolBuilder.delete(id, userId)
  }

  private assertOwner(tool: { userId: string } | null, userId: string) {
    if (!tool) throw new NotFoundException('Tool not found')
    if (tool.userId !== userId) throw new ForbiddenException('You do not own this tool.')
  }
}
