import { Controller, Post, Get, Param, Body, Patch, Delete, NotFoundException, Query } from '@nestjs/common'
import { GenerativeUIService } from './generative-ui.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'

@Controller('generative-ui')
export class GenerativeUIController {
  constructor(private readonly service: GenerativeUIService) {}

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body() body: { name?: string; code: string; language?: 'react' | 'html'; conversationId?: string; props?: Record<string, unknown> },
  ) {
    // The owner always comes from the token.
    return this.service.createComponent({ ...body, userId })
  }

  @Get('conversation/:id')
  listForConversation(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.listForConversation(userId, id)
  }

  @Get('user')
  listForUser(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '50', 10)
    return this.service.listForUser(userId, Number.isFinite(parsed) ? parsed : 50)
  }

  @Get(':id')
  async get(@CurrentUserId() userId: string, @Param('id') id: string) {
    const component = await this.service.getComponent(userId, id)
    if (!component) throw new NotFoundException('Component not found')
    return component
  }

  @Patch(':id/props')
  async updateProps(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: { props?: Record<string, unknown> } | Record<string, unknown>,
  ) {
    const props = ('props' in body && body.props && typeof body.props === 'object'
      ? body.props
      : body) as Record<string, unknown>
    const component = await this.service.updateComponentProps(userId, id, props)
    if (!component) throw new NotFoundException('Component not found')
    return component
  }

  @Delete(':id')
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    const ok = await this.service.deleteComponent(userId, id)
    if (!ok) throw new NotFoundException('Component not found')
    return { ok: true }
  }
}
