import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { Public } from '../common/public.decorator'
import { PublicAgentsService, type PublicAgentInput, type PublicChatInput } from './public-agents.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

function clientIp(req: any): string {
  const cfIp = String(req.headers?.['cf-connecting-ip'] ?? '').trim()
  if (cfIp) return cfIp
  const realIp = String(req.headers?.['x-real-ip'] ?? '').trim()
  if (realIp) return realIp
  const parts = String(req.headers?.['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const fwd = parts.length > 0 ? parts[parts.length - 1]! : ''
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown'
}

/** Owner-facing management endpoints (JWT). */
@ApiTags('public-agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('public-agents')
export class PublicAgentsController {
  constructor(private readonly service: PublicAgentsService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(uid(req))
  }

  @Get('library-documents')
  docs(@Req() req: any) {
    return this.service.listLibraryDocuments(uid(req))
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.service.get(uid(req), id)
  }

  @Post()
  create(@Req() req: any, @Body() body: PublicAgentInput) {
    return this.service.create(uid(req), body ?? {})
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: PublicAgentInput) {
    return this.service.update(uid(req), id, body ?? {})
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(uid(req), id)
  }
}

/** Anonymous endpoints used by the hosted page and the embeddable widget. */
@ApiTags('public-agents')
@Public()
@Controller('public/agents')
export class PublicAgentsPublicController {
  constructor(private readonly service: PublicAgentsService) {}

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.service.getPublic(slug)
  }

  @Post(':slug/chat')
  chat(
    @Param('slug') slug: string,
    @Body() body: PublicChatInput,
    @Req() req: any,
    @Query('embed') embed?: string,
    @Headers('x-embed-origin') embedOrigin?: string,
    @Headers('origin') origin?: string,
  ) {
    const isEmbed = embed === '1' || Boolean(embedOrigin)
    return this.service.chat(slug, body, {
      ip: clientIp(req),
      // For iframe embeds the request origin is our own web app; the widget passes the host page origin.
      origin: isEmbed ? (embedOrigin || origin) : origin,
      embed: isEmbed,
    })
  }
}
