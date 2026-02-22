import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { MemoryService } from './memory.service'

class UpdateMemoryFileDto {
  @IsString()
  content!: string
}

class BrowserCaptureDto {
  @IsString()
  url!: string

  @IsString()
  @IsOptional()
  title?: string

  @IsString()
  selection!: string

  @IsString()
  @IsOptional()
  note?: string

  @IsString()
  @IsOptional()
  conversationId?: string
}

@ApiTags('memory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('memory')
export class MemoryController {
  constructor(private memory: MemoryService) {}

  @Get()
  list(@Req() req: any) {
    return this.memory.getForUser(req.user.id)
  }

  @Post('files/sync')
  async syncFiles(@Req() req: any) {
    await this.memory.syncFiles(req.user.id)
    return { ok: true }
  }

  @Get('files')
  listFiles(@Req() req: any) {
    return this.memory.listFiles(req.user.id)
  }

  @Get('files/:name')
  readFile(@Param('name') name: string, @Req() req: any) {
    return this.memory.readFile(req.user.id, name)
  }

  @Put('files/:name')
  writeFile(@Param('name') name: string, @Body() dto: UpdateMemoryFileDto, @Req() req: any) {
    return this.memory.writeFile(req.user.id, name, dto.content)
  }

  @Post('capture')
  capture(@Req() req: any, @Body() dto: BrowserCaptureDto) {
    return this.memory.captureBrowserSelection(req.user.id, dto)
  }

  @Post('curate')
  curate(@Req() req: any) {
    return this.memory.curateNightly(req.user.id, 'manual')
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.memory.delete(id, req.user.id)
  }
}
