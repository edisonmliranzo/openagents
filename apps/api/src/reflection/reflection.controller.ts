import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Req, NotFoundException } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ReflectionService } from './reflection.service'
import { LessonsService } from './lessons.service'

@ApiTags('reflection')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reflection')
export class ReflectionController {
  constructor(
    private readonly reflection: ReflectionService,
    private readonly lessons: LessonsService,
  ) {}

  @Post('run')
  run(@Req() req: any) {
    return this.reflection.reflect(req.user.id)
  }

  @Get('lessons')
  listLessons(@Req() req: any) {
    return this.lessons.list(req.user.id)
  }

  @Get('lessons/preview')
  previewLessons(@Req() req: any) {
    return this.lessons.preview(req.user.id)
  }

  @Post('lessons/reflect')
  reflectNow(@Req() req: any, @Body() body: { conversationId?: string }) {
    return this.lessons.reflectOnConversation(req.user.id, body?.conversationId).then((r) => r ?? { skipped: true })
  }

  @Patch('lessons/:id/toggle')
  async toggleLesson(@Req() req: any, @Param('id') id: string, @Body() body: { enabled?: boolean }) {
    const lesson = await this.lessons.toggle(req.user.id, id, body?.enabled)
    if (!lesson) throw new NotFoundException('Lesson not found')
    return lesson
  }

  @Delete('lessons/:id')
  deleteLesson(@Req() req: any, @Param('id') id: string) {
    return this.lessons.remove(req.user.id, id)
  }
}
