import { Controller, Delete, Get, HttpCode, Param, Patch, Query, Req, UseGuards, Body } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { SessionPatchInput } from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { SessionsService } from './sessions.service'

@ApiTags('sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private sessions: SessionsService) {}

  @Get()
  list(
    @Req() req: any,
    @Query('activeMinutes') activeMinutes?: string,
    @Query('limit') limit?: string,
    @Query('includeGlobal') includeGlobal?: string,
    @Query('includeUnknown') includeUnknown?: string,
  ) {
    return this.sessions.list(req.user.id, {
      activeMinutes: activeMinutes ? Number(activeMinutes) : undefined,
      limit: limit ? Number(limit) : undefined,
      includeGlobal: this.toBoolean(includeGlobal, true),
      includeUnknown: this.toBoolean(includeUnknown, false),
    })
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Req() req: any, @Body() patch: SessionPatchInput) {
    return this.sessions.patch(id, req.user.id, patch)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.sessions.delete(id, req.user.id)
  }

  private toBoolean(value: string | undefined, fallback: boolean) {
    if (value === undefined) return fallback
    const normalized = value.toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
    return fallback
  }
}
