import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { LibraryService } from './library.service'

@ApiTags('library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  list(@Req() req: any) {
    return this.library.listDocuments(req.user.id)
  }

  @Post()
  add(@Req() req: any, @Body() body: { title: string; content: string; source?: string; mimeType?: string }) {
    return this.library.addText(req.user.id, body)
  }

  @Get('search')
  async search(@Req() req: any, @Query('q') q: string, @Query('topK') topK?: string) {
    return this.library.search(req.user.id, q ?? '', topK ? Number(topK) : 6)
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.library.removeDocument(req.user.id, id)
  }
}
