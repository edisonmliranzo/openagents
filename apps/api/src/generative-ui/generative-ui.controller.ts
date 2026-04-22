import { Controller, Post, Get, Param, Body, Patch } from '@nestjs/common'
import { GenerativeUIService } from './generative-ui.service'

@Controller('api/v1/generative-ui')
export class GenerativeUIController {
  constructor(private readonly service: GenerativeUIService) {}

  @Post()
  create(@Body() body: any) { return this.service.createComponent(body) }

  @Get('conversation/:id')
  list(@Param('id') id: string) { return this.service.listForConversation(id) }

  @Get(':id')
  get(@Param('id') id: string) { return this.service.getComponent(id) }

  @Patch(':id/props')
  updateProps(@Param('id') id: string, @Body() body: any) { return this.service.updateComponentProps(id, body) }
}
