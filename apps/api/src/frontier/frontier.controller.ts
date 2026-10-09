import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ConsolidationService } from './consolidation.service'
import { TimelineService } from './timeline.service'
import { ProceduralService } from './procedural.service'
import { DebateService } from './debate.service'
import { WatchService } from './watch.service'
import { RoundtableService } from './roundtable.service'
import { AutodocService } from './autodoc.service'
import { PromptRepairService } from './prompt-repair.service'
import { AutopilotService } from './autopilot.service'
import { StakesService } from './stakes.service'
import { PiiRouterService } from './pii-router.service'

@ApiTags('frontier')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('frontier')
export class FrontierController {
  constructor(
    private readonly consolidation: ConsolidationService,
    private readonly timeline: TimelineService,
    private readonly procedural: ProceduralService,
    private readonly debate: DebateService,
    private readonly watch: WatchService,
    private readonly roundtable: RoundtableService,
    private readonly autodoc: AutodocService,
    private readonly promptRepair: PromptRepairService,
    private readonly autopilot: AutopilotService,
    private readonly stakes: StakesService,
    private readonly pii: PiiRouterService,
  ) {}

  @Get('status')
  status() {
    return {
      sleepConsolidation: this.consolidation.enabled,
      timeline: true,
      proceduralLearning: this.procedural.enabled,
      debate: true,
      watchTasks: this.watch.enabled,
      roundtable: true,
      autoDocs: this.autodoc.enabled,
      promptRepair: this.promptRepair.enabled,
      costAutopilot: this.autopilot.enabled,
      stakesAware: this.stakes.enabled,
      privacyRouter: this.pii.enabled,
    }
  }

  @Get('digest')
  digest(@Req() req: any) {
    return this.consolidation.latestDigest(req.user.id)
  }

  @Post('consolidate')
  async consolidate(@Req() req: any) {
    const digest = await this.consolidation.runForUser(req.user.id)
    return { ok: true, digest }
  }

  @Get('timeline')
  timelineQuery(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.timeline.query(req.user.id, { q, from, to, limit: limit ? Number(limit) : undefined })
  }

  @Post('procedural/mine')
  mine(@Req() req: any) {
    return this.procedural.mine(req.user.id)
  }

  @Post('debate')
  debateRun(@Req() req: any, @Body() body: { question: string }) {
    const question = String(body?.question ?? '').trim()
    if (!question) return { error: 'question required' }
    return this.debate.debate(req.user.id, question)
  }

  @Post('roundtable')
  roundtableRun(@Req() req: any, @Body() body: { topic: string }) {
    const topic = String(body?.topic ?? '').trim()
    if (!topic) return { error: 'topic required' }
    return this.roundtable.convene(req.user.id, topic)
  }

  @Post('autodoc')
  autodocRecord(
    @Req() req: any,
    @Body() body: { task: string; steps: string[]; result: string; source?: string },
  ) {
    const task = String(body?.task ?? '').trim()
    if (!task) return { error: 'task required' }
    return this.autodoc.record(req.user.id, {
      task,
      steps: Array.isArray(body.steps) ? body.steps.map(String).slice(0, 30) : [],
      result: String(body?.result ?? '').slice(0, 4000),
      source: body?.source,
    })
  }

  @Get('watches')
  watches(@Req() req: any) {
    return this.watch.list(req.user.id)
  }

  @Post('watches')
  watchCreate(
    @Req() req: any,
    @Body() body: { name: string; kind?: string; target: string; condition: string; intervalMin?: number },
  ) {
    if (!body?.name || !body?.target || !body?.condition) return { error: 'name, target and condition required' }
    return this.watch.create(req.user.id, body)
  }

  @Patch('watches/:id')
  watchPatch(@Req() req: any, @Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.watch.setEnabled(req.user.id, id, body?.enabled === true)
  }

  @Delete('watches/:id')
  watchDelete(@Req() req: any, @Param('id') id: string) {
    return this.watch.remove(req.user.id, id)
  }

  @Post('watches/:id/run')
  watchRun(@Req() req: any, @Param('id') id: string) {
    return this.watch.runNow(req.user.id, id)
  }

  @Get('patches')
  patches(@Req() req: any) {
    return this.promptRepair.list(req.user.id)
  }

  @Patch('patches/:id')
  patchPatch(@Req() req: any, @Param('id') id: string, @Body() body: { active: boolean }) {
    return this.promptRepair.setActive(req.user.id, id, body?.active === true)
  }

  @Delete('patches/:id')
  patchDelete(@Req() req: any, @Param('id') id: string) {
    return this.promptRepair.remove(req.user.id, id)
  }

  @Post('patches/run')
  patchesRun(@Req() req: any) {
    return this.promptRepair.repairFor(req.user.id, 'general').then((rules) => ({ ok: true, rules }))
  }

  @Get('autopilot')
  async autopilotStatus(@Req() req: any) {
    return this.autopilot.decide(req.user.id, 'medium')
  }
}
