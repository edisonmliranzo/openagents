import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUserId } from '../auth/current-user-id.decorator'
import { JanitorService } from './janitor.service'
import { InboxService } from './inbox.service'
import { CrmService } from './crm.service'
import { ClipsService } from './clips.service'
import { PodcastService } from './podcast.service'
import { RulesService } from './rules.service'
import { ShadowService } from './shadow.service'
import { ReplayService } from './replay.service'
import { AnticipationService } from './anticipation.service'
import { TokensService } from './tokens.service'

@ApiTags('life')
@ApiBearerAuth()
@Controller('life')
export class LifeController {
  constructor(
    private readonly janitor: JanitorService,
    private readonly inbox: InboxService,
    private readonly crm: CrmService,
    private readonly clips: ClipsService,
    private readonly podcast: PodcastService,
    private readonly rules: RulesService,
    private readonly shadow: ShadowService,
    private readonly replay: ReplayService,
    private readonly anticipation: AnticipationService,
    private readonly tokens: TokensService,
  ) {}

  // ---- Downloads janitor ----
  @Post('janitor/scan')
  janitorScan(@CurrentUserId() userId: string, @Body() body: { folder: string }) {
    return this.janitor.scan(userId, body.folder)
  }

  @Post('janitor/:id/apply')
  janitorApply(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.janitor.apply(userId, id)
  }

  @Get('janitor')
  janitorList(@CurrentUserId() userId: string) {
    return this.janitor.list(userId)
  }

  // ---- Inbox autopilot ----
  @Post('inbox/triage')
  inboxTriage(@CurrentUserId() userId: string, @Body() body: { query?: string }) {
    return this.inbox.triage(userId, body.query)
  }

  @Get('inbox')
  inboxList(@CurrentUserId() userId: string) {
    return this.inbox.list(userId)
  }

  // ---- Personal CRM ----
  @Get('crm')
  crmRoster(@CurrentUserId() userId: string, @Query('workspaceId') workspaceId?: string) {
    return this.crm.roster(userId, workspaceId || undefined)
  }

  @Post('crm/:id/nudge')
  crmNudge(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.crm.draftNudge(userId, id)
  }

  // ---- Screenshot / clip memory ----
  @Post('clips')
  createClip(
    @CurrentUserId() userId: string,
    @Body() body: { kind?: string; text?: string; sourceUrl?: string; imageBase64?: string; caption?: string },
  ) {
    return this.clips.create(userId, body)
  }

  @Get('clips')
  listClips(@CurrentUserId() userId: string, @Query('q') q?: string) {
    return this.clips.list(userId, q)
  }

  @Delete('clips/:id')
  deleteClip(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.clips.remove(userId, id)
  }

  // ---- Podcast mode ----
  @Get('podcast')
  podcastScript(@CurrentUserId() userId: string, @Query('scope') scope?: string) {
    return this.podcast.script(userId, scope === 'yesterday' ? 'yesterday' : 'today')
  }

  // ---- Approval delegation rules ----
  @Get('rules')
  listRules(@CurrentUserId() userId: string) {
    return this.rules.list(userId)
  }

  @Post('rules')
  createRule(@CurrentUserId() userId: string, @Body() body: { toolPattern: string; decision?: string; note?: string }) {
    return this.rules.create(userId, body)
  }

  @Post('rules/compile')
  compileRules(@CurrentUserId() userId: string, @Body() body: { sentence: string }) {
    return this.rules.compile(userId, body.sentence)
  }

  @Patch('rules/:id')
  updateRule(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: { enabled?: boolean; decision?: string }) {
    return this.rules.update(userId, id, body)
  }

  @Delete('rules/:id')
  deleteRule(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.rules.remove(userId, id)
  }

  // ---- Dry-run (shadow) mode ----
  @Get('shadow')
  getShadow(@CurrentUserId() userId: string) {
    return this.shadow.isEnabled(userId).then((shadowMode) => ({ shadowMode }))
  }

  @Post('shadow')
  setShadow(@CurrentUserId() userId: string, @Body() body: { enabled: boolean }) {
    return this.shadow.set(userId, Boolean(body.enabled))
  }

  // ---- Audit replay ----
  @Get('replay')
  replayDay(@CurrentUserId() userId: string, @Query('date') date: string) {
    return this.replay.day(userId, date)
  }

  // ---- Anticipatory reminders ----
  @Get('anticipations')
  listAnticipations(@CurrentUserId() userId: string) {
    return this.anticipation.list(userId)
  }

  @Post('anticipations/learn')
  learnAnticipations(@CurrentUserId() userId: string) {
    return this.anticipation.learn(userId)
  }

  @Patch('anticipations/:id')
  updateAnticipation(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: { status?: string; cadenceDays?: number },
  ) {
    return this.anticipation.update(userId, id, body)
  }

  // ---- Agent API tokens (third-party access) ----
  @Get('tokens')
  listTokens(@CurrentUserId() userId: string) {
    return this.tokens.list(userId)
  }

  @Post('tokens')
  createToken(@CurrentUserId() userId: string, @Body() body: { name: string; scopes?: string[]; budgetUsd?: number }) {
    return this.tokens.create(userId, body)
  }

  @Delete('tokens/:id')
  revokeToken(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.tokens.revoke(userId, id)
  }
}
