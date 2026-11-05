import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min,
} from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { CONTACT_STAGES, ContactStage, ContactsService, InteractionDirection } from './contacts.service'
import { OUTREACH_CHANNELS, OUTREACH_STATUSES, OutreachChannel, OutreachService, OutreachStatus } from './outreach.service'
import { VoiceConsoleService } from './voice-console.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

// ---------- DTOs ----------
class TrackOutreachDto {
  @IsIn(OUTREACH_CHANNELS) channel!: OutreachChannel
  @IsString() @MaxLength(120) hook!: string
  @IsOptional() @IsString() @MaxLength(40) variant?: string
  @IsOptional() @IsString() @MaxLength(4000) variantText?: string
  @IsOptional() @IsString() @MaxLength(200) recipient?: string
  @IsOptional() @IsString() @MaxLength(200) contactName?: string
  @IsOptional() @IsString() @MaxLength(64) contactId?: string
  @IsOptional() @IsString() @MaxLength(1000) note?: string
  @IsOptional() @IsString() @MaxLength(64) sentAt?: string
}

class AdvanceOutreachDto {
  @IsIn(OUTREACH_STATUSES) status!: OutreachStatus
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) revenue?: number
  @IsOptional() @IsString() @MaxLength(1000) note?: string
}

class PromoteDto {
  @IsString() @MaxLength(120) hook!: string
  @IsOptional() @IsString() @MaxLength(40) variant?: string
  @IsOptional() @IsIn(['reply', 'conversion']) metric?: 'reply' | 'conversion'
}

class CreateContactDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string
  @IsOptional() @IsString() @MaxLength(320) email?: string
  @IsOptional() @IsString() @MaxLength(40) phone?: string
  @IsOptional() @IsString() @MaxLength(120) handle?: string
  @IsOptional() @IsString() @MaxLength(40) platform?: string
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags?: string[]
  @IsOptional() @IsString() @MaxLength(5000) notes?: string
  @IsOptional() @IsIn(CONTACT_STAGES) stage?: ContactStage
}

class UpdateContactDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags?: string[]
  @IsOptional() @IsString() @MaxLength(5000) notes?: string
  @IsOptional() @IsIn(CONTACT_STAGES) stage?: ContactStage
  @IsOptional() @IsString() @MaxLength(320) addEmail?: string
  @IsOptional() @IsString() @MaxLength(40) addPhone?: string
  @IsOptional() @IsString() @MaxLength(120) addHandle?: string
  @IsOptional() @IsString() @MaxLength(40) platform?: string
}

class InteractionDto {
  @IsString() @MaxLength(40) channel!: string
  @IsIn(['inbound', 'outbound', 'note']) direction!: InteractionDirection
  @IsString() @MaxLength(4000) text!: string
  @IsOptional() @IsString() @MaxLength(64) at?: string
  @IsOptional() @IsObject() meta?: Record<string, unknown>
}

class IngestDto extends InteractionDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string
  @IsOptional() @IsString() @MaxLength(320) email?: string
  @IsOptional() @IsString() @MaxLength(40) phone?: string
  @IsOptional() @IsString() @MaxLength(120) handle?: string
  @IsOptional() @IsString() @MaxLength(40) platform?: string
}

class MergeDto {
  @IsString() @MaxLength(64) primaryId!: string
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) duplicateIds!: string[]
}

class CreateVoiceSessionDto {
  @IsOptional() @IsIn(['inbound', 'outbound']) direction?: 'inbound' | 'outbound'
  @IsOptional() @IsString() @MaxLength(100) party?: string
  @IsOptional() @IsString() @MaxLength(2000) goal?: string
  /** Attach the console to a real call owned by the phone provider instead of simulating. */
  @IsOptional() @IsString() @MaxLength(64) phoneCallId?: string
}

class TextDto {
  @IsString() @MaxLength(2000) text!: string
}

class OptionalTextDto {
  @IsOptional() @IsString() @MaxLength(2000) text?: string
}

class TakeoverDto {
  @IsBoolean() enabled!: boolean
}

// ---------- Controllers ----------
@ApiTags('growth-outreach')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('growth/outreach')
export class OutreachController {
  constructor(private readonly outreach: OutreachService) {}

  @Get()
  list(@Req() req: any, @Query('channel') channel?: string, @Query('hook') hook?: string, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.outreach.list(uid(req), { channel, hook, status }, limit ? Number(limit) || 200 : 200)
  }

  @Post()
  track(@Req() req: any, @Body() dto: TrackOutreachDto) {
    return this.outreach.track(uid(req), dto)
  }

  @Get('analytics')
  analytics(@Req() req: any, @Query('days') days?: string) {
    return this.outreach.analytics(uid(req), days ? Number(days) || undefined : undefined)
  }

  @Get('experiments')
  experiments(@Req() req: any, @Query('metric') metric?: string) {
    return this.outreach.experiments(uid(req), metric === 'reply' ? 'reply' : 'conversion')
  }

  @Post('promote')
  @HttpCode(200)
  promote(@Req() req: any, @Body() dto: PromoteDto) {
    return this.outreach.promote(uid(req), dto.hook, dto.variant, dto.metric)
  }

  @Get('promotions')
  promotions(@Req() req: any) {
    return this.outreach.promotions(uid(req))
  }

  @Post(':id/advance')
  @HttpCode(200)
  advance(@Req() req: any, @Param('id') id: string, @Body() dto: AdvanceOutreachDto) {
    return this.outreach.advance(uid(req), id, dto.status, dto.revenue, dto.note)
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.outreach.remove(uid(req), id)
  }
}

@ApiTags('growth-contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('growth/contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService, private readonly outreach: OutreachService) {}

  @Get()
  list(@Req() req: any, @Query('q') q?: string, @Query('tag') tag?: string, @Query('stage') stage?: string) {
    return this.contacts.list(uid(req), q, tag, stage)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateContactDto) {
    return this.contacts.create(uid(req), dto)
  }

  @Post('ingest')
  @HttpCode(200)
  ingest(@Req() req: any, @Body() dto: IngestDto) {
    return this.contacts.ingest(uid(req), dto)
  }

  @Get('duplicates')
  duplicates(@Req() req: any) {
    return this.contacts.duplicates(uid(req))
  }

  @Post('merge')
  @HttpCode(200)
  merge(@Req() req: any, @Body() dto: MergeDto) {
    return this.contacts.merge(uid(req), dto.primaryId, dto.duplicateIds)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.contacts.get(uid(req), id)
  }

  /** Context brief the agent should read before replying to this contact. */
  @Get(':id/brief')
  async brief(@Req() req: any, @Param('id') id: string) {
    const items = await this.outreach.forContact(uid(req), id)
    return this.contacts.brief(uid(req), id, items)
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(uid(req), id, dto)
  }

  @Post(':id/interactions')
  addInteraction(@Req() req: any, @Param('id') id: string, @Body() dto: InteractionDto) {
    return this.contacts.addInteraction(uid(req), id, dto)
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.contacts.remove(uid(req), id)
  }
}

@ApiTags('voice-console')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('voice-console')
export class VoiceConsoleController {
  constructor(private readonly voice: VoiceConsoleService) {}

  @Get('status')
  status() {
    return this.voice.status()
  }

  @Get('sessions')
  list(@Req() req: any) {
    return this.voice.list(uid(req))
  }

  @Post('sessions')
  create(@Req() req: any, @Body() dto: CreateVoiceSessionDto) {
    return this.voice.create(uid(req), dto)
  }

  /** Polling feed: pass ?after=<lastSeq> to receive only new transcript turns. */
  @Get('sessions/:id')
  get(@Req() req: any, @Param('id') id: string, @Query('after') after?: string) {
    return this.voice.get(uid(req), id, after ? Number(after) || 0 : 0)
  }

  @Post('sessions/:id/steer')
  @HttpCode(200)
  steer(@Req() req: any, @Param('id') id: string, @Body() dto: TextDto) {
    return this.voice.steer(uid(req), id, dto.text)
  }

  @Post('sessions/:id/takeover')
  @HttpCode(200)
  takeover(@Req() req: any, @Param('id') id: string, @Body() dto: TakeoverDto) {
    return this.voice.takeover(uid(req), id, dto.enabled)
  }

  @Post('sessions/:id/say')
  @HttpCode(200)
  say(@Req() req: any, @Param('id') id: string, @Body() dto: TextDto) {
    return this.voice.say(uid(req), id, dto.text)
  }

  @Post('sessions/:id/caller')
  @HttpCode(200)
  caller(@Req() req: any, @Param('id') id: string, @Body() dto: OptionalTextDto) {
    return this.voice.callerSays(uid(req), id, dto.text)
  }

  @Post('sessions/:id/end')
  @HttpCode(200)
  end(@Req() req: any, @Param('id') id: string) {
    return this.voice.end(uid(req), id)
  }

  @Delete('sessions/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.voice.remove(uid(req), id)
  }
}
