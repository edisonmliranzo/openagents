import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { AbTestingService, AbTestVariant } from './ab-testing.service'

@Controller('ab-tests')
@UseGuards(JwtAuthGuard)
export class AbTestingController {
  constructor(private readonly abTestingService: AbTestingService) {}

  @Get()
  list(@Req() req: any) {
    const userId = req.user?.id
    return this.abTestingService.list(userId)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id
    return this.abTestingService.get(userId, id) ?? { error: 'Not found' }
  }

  @Post()
  create(
    @Req() req: any,
    @Body() body: { name: string; description?: string; variants: AbTestVariant[] },
  ) {
    const userId = req.user?.id
    return this.abTestingService.create(userId, body)
  }

  @Post(':id/pick')
  pickVariant(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id
    const variant = this.abTestingService.pickVariant(userId, id)
    return variant ?? { error: 'No variant available' }
  }

  @Post(':id/record')
  recordResult(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { variantId: string; latencyMs: number; tokens: number; satisfaction?: number },
  ) {
    const userId = req.user?.id
    this.abTestingService.recordResult(userId, id, body.variantId, body)
    return { success: true }
  }

  @Post(':id/winner')
  setWinner(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { variantId: string },
  ) {
    const userId = req.user?.id
    return this.abTestingService.setWinner(userId, id, body.variantId) ?? { error: 'Not found' }
  }

  @Delete(':id')
  delete(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id
    return { success: this.abTestingService.delete(userId, id) }
  }
}
