import { Controller, Get, Query, Res, UseGuards, Req } from '@nestjs/common'
import { Response } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ExportService } from './export.service'

@Controller('export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('conversations')
  async exportConversations(
    @Req() req: any,
    @Query('format') format: 'json' | 'markdown' = 'json',
    @Res() res: Response,
  ) {
    const userId = req.user?.id
    const content = await this.exportService.exportConversations(userId, format)
    const ext = format === 'markdown' ? 'md' : 'json'
    const mime = format === 'markdown' ? 'text/markdown' : 'application/json'
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `attachment; filename="conversations_${Date.now()}.${ext}"`)
    res.send(content)
  }

  @Get('memory')
  async exportMemory(@Req() req: any, @Res() res: Response) {
    const userId = req.user?.id
    const content = await this.exportService.exportMemory(userId)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="memory_${Date.now()}.json"`)
    res.send(content)
  }

  @Get('workflows')
  async exportWorkflows(@Req() req: any, @Res() res: Response) {
    const userId = req.user?.id
    const content = await this.exportService.exportWorkflows(userId)
    res.setHeader('Content-Type', 'text/yaml')
    res.setHeader('Content-Disposition', `attachment; filename="workflows_${Date.now()}.yaml"`)
    res.send(content)
  }
}
