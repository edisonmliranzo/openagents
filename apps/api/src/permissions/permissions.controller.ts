import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ToolPermissionsService } from './tool-permissions.service'

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: ToolPermissionsService) {}

  /** The user's ordered tool-permission rules (first match wins). */
  @Get()
  get(@Req() req: any) {
    return this.permissions.get(req.user.id)
  }

  /** Replace the full rule list. Body: { rules: [{ tool, effect, note?, id? }] } */
  @Put()
  set(@Req() req: any, @Body() body: { rules?: unknown }) {
    return this.permissions.set(req.user.id, body?.rules)
  }

  /** Dry-run: how would this tool name resolve against the current rules? */
  @Post('test')
  test(@Req() req: any, @Body() body: { toolName?: string }) {
    const toolName = String(body?.toolName ?? '').trim()
    if (!toolName) return { effect: 'error', reason: 'toolName is required' }
    return this.permissions.preview(req.user.id, toolName)
  }
}
