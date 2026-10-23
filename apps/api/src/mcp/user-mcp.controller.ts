import { Body, Controller, Delete, Get, Param, Post, Patch, Res, Query } from '@nestjs/common'
import { Response } from 'express'
import { UserMcpService } from './user-mcp.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'

/**
 * User-managed MCP servers.
 *
 * `GET /api/v1/mcp/servers/stream` is a Server-Sent Events stream that pushes
 * connection/tool-discovery status as it happens, so the UI can update live.
 */
@Controller('mcp')
export class UserMcpController {
  constructor(private mcp: UserMcpService) {}

  /** Live status stream. */
  @Get('servers/stream')
  stream(@CurrentUserId() userId: string, @Res() res: Response) {
    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n')
    }, 15_000)

    const unsubscribe = this.mcp.subscribe(userId, (event) => {
      res.write(`event: mcp_status\ndata: ${JSON.stringify(event)}\n\n`)
    })

    res.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  }

  @Get('servers')
  list(@CurrentUserId() userId: string) {
    return this.mcp.list(userId)
  }

  @Get('servers/:id')
  get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.mcp.get(userId, id)
  }

  @Post('servers')
  create(@CurrentUserId() userId: string, @Body() body: any) {
    return this.mcp.create(userId, body)
  }

  @Patch('servers/:id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: any) {
    return this.mcp.update(userId, id, body)
  }

  @Delete('servers/:id')
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return { ok: await this.mcp.remove(userId, id) }
  }

  /** Connect (or reconnect) a server and discover its tools. */
  @Post('servers/:id/connect')
  connect(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.mcp.connect(userId, id)
  }

  /** Test a server without persisting anything. */
  @Post('servers/:id/test')
  test(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.mcp.test(userId, id)
  }

  /** The tools a server currently exposes. */
  @Get('servers/:id/tools')
  tools(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.mcp.serverTools(userId, id)
  }
}