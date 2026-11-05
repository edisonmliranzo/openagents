import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { TeamWorkspaceService } from './team-workspace.service'

const ROLE_INPUTS = ['admin', 'member', 'editor', 'viewer']

class InviteDto {
  @IsEmail() email!: string
  @IsOptional() @IsIn(ROLE_INPUTS) role?: string
  @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number
}

class RoleDto {
  @IsIn(['owner', ...ROLE_INPUTS]) role!: string
}

class RuleDto {
  @IsString() @MaxLength(100) approverId!: string
  @IsOptional() @IsString() @MaxLength(100) memberId?: string
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(64, { each: true }) tools?: string[]
  @IsOptional() @IsIn(['low', 'medium', 'high']) maxRisk?: 'low' | 'medium' | 'high'
  @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number
}

class ApproveDto {
  @IsBoolean() approve!: boolean
  @IsOptional() @IsString() @MaxLength(300) note?: string
}

class ScopeDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string
  @IsOptional() @IsIn(['admin', 'member', 'editor', 'viewer']) readRole?: string
  @IsOptional() @IsIn(['admin', 'member', 'editor', 'viewer']) writeRole?: string
}

class EntryDto {
  @IsString() @MinLength(1) @MaxLength(100) title!: string
  @IsString() @MinLength(1) @MaxLength(8000) content!: string
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[]
}

@ApiTags('team-workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('team-workspaces')
export class TeamWorkspaceController {
  constructor(private readonly svc: TeamWorkspaceService) {}

  @Get(':id/overview')
  overview(@Req() req: any, @Param('id') id: string) {
    return this.svc.overview(req.user.id, id)
  }

  @Post(':id/invites')
  invite(@Req() req: any, @Param('id') id: string, @Body() dto: InviteDto) {
    return this.svc.invite(req.user.id, id, dto)
  }

  @Delete(':id/invites/:invitationId')
  revokeInvite(@Req() req: any, @Param('id') id: string, @Param('invitationId') invitationId: string) {
    return this.svc.revokeInvitation(req.user.id, id, invitationId)
  }

  @Patch(':id/members/:memberUserId/role')
  changeRole(@Req() req: any, @Param('id') id: string, @Param('memberUserId') memberUserId: string, @Body() dto: RoleDto) {
    return this.svc.changeRole(req.user.id, id, memberUserId, dto.role)
  }

  @Delete(':id/members/:memberUserId')
  removeMember(@Req() req: any, @Param('id') id: string, @Param('memberUserId') memberUserId: string) {
    return this.svc.removeMember(req.user.id, id, memberUserId)
  }

  @Get(':id/activity')
  activity(@Req() req: any, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.svc.activity(req.user.id, id, Number.parseInt(limit ?? '100', 10) || 100)
  }

  @Get(':id/delegation')
  delegation(@Req() req: any, @Param('id') id: string) {
    return this.svc.delegation(req.user.id, id)
  }

  @Put(':id/approvers/:targetUserId')
  addApprover(@Req() req: any, @Param('id') id: string, @Param('targetUserId') targetUserId: string) {
    return this.svc.setApprover(req.user.id, id, targetUserId, true)
  }

  @Delete(':id/approvers/:targetUserId')
  removeApprover(@Req() req: any, @Param('id') id: string, @Param('targetUserId') targetUserId: string) {
    return this.svc.setApprover(req.user.id, id, targetUserId, false)
  }

  @Post(':id/delegation/rules')
  createRule(@Req() req: any, @Param('id') id: string, @Body() dto: RuleDto) {
    return this.svc.createRule(req.user.id, id, dto)
  }

  @Delete(':id/delegation/rules/:ruleId')
  deleteRule(@Req() req: any, @Param('id') id: string, @Param('ruleId') ruleId: string) {
    return this.svc.deleteRule(req.user.id, id, ruleId)
  }

  @Get(':id/delegation/pending')
  pending(@Req() req: any, @Param('id') id: string) {
    return this.svc.delegatedPending(req.user.id, id)
  }

  @Post(':id/delegation/approvals/:approvalId')
  approveOnBehalf(@Req() req: any, @Param('id') id: string, @Param('approvalId') approvalId: string, @Body() dto: ApproveDto) {
    return this.svc.approveOnBehalf(req.user.id, id, approvalId, dto.approve, dto.note)
  }

  @Get(':id/scopes')
  scopes(@Req() req: any, @Param('id') id: string) {
    return this.svc.scopes(req.user.id, id)
  }

  @Post(':id/scopes')
  createScope(@Req() req: any, @Param('id') id: string, @Body() dto: ScopeDto) {
    return this.svc.createScope(req.user.id, id, dto)
  }

  @Get(':id/scopes/:scopeId/entries')
  entries(@Req() req: any, @Param('id') id: string, @Param('scopeId') scopeId: string) {
    return this.svc.listEntries(req.user.id, id, scopeId)
  }

  @Post(':id/scopes/:scopeId/entries')
  addEntry(@Req() req: any, @Param('id') id: string, @Param('scopeId') scopeId: string, @Body() dto: EntryDto) {
    return this.svc.addEntry(req.user.id, id, scopeId, dto)
  }

  @Delete(':id/scopes/:scopeId/entries/:entryId')
  deleteEntry(@Req() req: any, @Param('id') id: string, @Param('scopeId') scopeId: string, @Param('entryId') entryId: string) {
    return this.svc.deleteEntry(req.user.id, id, scopeId, entryId)
  }
}
