import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import type {
  CreateWorkspaceInput,
  CreateWorkspaceInvitationInput,
  CreateWorkspaceMemoryEntryInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
} from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { WorkspacesService } from './workspaces.service'
import { WorkspaceCollabService } from './workspace-collab.service'

class WorkspaceSettingsDto {
  @IsOptional()
  @IsBoolean()
  allowMemberInvites?: boolean

  @IsOptional()
  @IsBoolean()
  requireApprovalForNewMembers?: boolean

  @IsOptional()
  @IsString()
  defaultMemberRole?: WorkspaceRole

  @IsOptional()
  @IsBoolean()
  sharedMemoryEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  sharedAgentsEnabled?: boolean
}

class CreateWorkspaceDto implements CreateWorkspaceInput {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsObject()
  settings?: WorkspaceSettingsDto
}

class UpdateWorkspaceDto implements UpdateWorkspaceInput {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null

  @IsOptional()
  @IsObject()
  settings?: WorkspaceSettingsDto
}

class CreateWorkspaceInvitationDto implements CreateWorkspaceInvitationInput {
  @IsEmail()
  email!: string

  @IsOptional()
  @IsString()
  role?: WorkspaceRole

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number
}

class CreateWorkspaceMemoryEntryDto implements CreateWorkspaceMemoryEntryInput {
  @IsOptional()
  @IsString()
  type?: 'fact' | 'summary' | 'note'

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceRef?: string
}

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly collab: WorkspaceCollabService,
  ) {}

  @Get()
  list(@Req() req: any) {
    return this.workspaces.listForUser(req.user.id)
  }

  @Get('invitations/pending')
  listPending(@Req() req: any) {
    return this.workspaces.listPendingInvitations(req.user.id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(req.user.id, dto)
  }

  @Get(':id/briefing')
  briefing(@Req() req: any, @Param('id') id: string) {
    return this.workspaces.buildBriefing(req.user.id, id)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.workspaces.getForUser(req.user.id, id)
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaces.update(req.user.id, id, dto)
  }

  @Post(':id/invitations')
  invite(@Req() req: any, @Param('id') id: string, @Body() dto: CreateWorkspaceInvitationDto) {
    return this.workspaces.invite(req.user.id, id, dto)
  }

  @Post('invitations/:invitationId/accept')
  accept(@Req() req: any, @Param('invitationId') invitationId: string) {
    return this.workspaces.acceptInvitation(req.user.id, invitationId)
  }

  @Post(':id/memory')
  createMemory(@Req() req: any, @Param('id') id: string, @Body() dto: CreateWorkspaceMemoryEntryDto) {
    return this.workspaces.addMemoryEntry(req.user.id, id, dto)
  }

  @Post(':id/share/conversation/:conversationId')
  shareConversation(@Req() req: any, @Param('id') id: string, @Param('conversationId') conversationId: string) {
    return this.workspaces.shareConversation(req.user.id, id, conversationId)
  }

  @Post(':id/share/workflow/:workflowId')
  shareWorkflow(@Req() req: any, @Param('id') id: string, @Param('workflowId') workflowId: string) {
    return this.workspaces.shareWorkflow(req.user.id, id, workflowId)
  }

  @Post(':id/share/artifact/:artifactId')
  shareArtifact(@Req() req: any, @Param('id') id: string, @Param('artifactId') artifactId: string) {
    return this.workspaces.shareArtifact(req.user.id, id, artifactId)
  }

  @Get(':id/role')
  myRole(@Req() req: any, @Param('id') id: string) {
    return this.collab.myRole(req.user.id, id)
  }

  @Patch(':id/members/:memberUserId/role')
  updateMemberRole(
    @Req() req: any,
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @Body() body: { role?: string },
  ) {
    return this.collab.updateMemberRole(req.user.id, id, memberUserId, body?.role)
  }

  @Delete(':id/members/:memberUserId')
  removeMember(@Req() req: any, @Param('id') id: string, @Param('memberUserId') memberUserId: string) {
    return this.collab.removeMember(req.user.id, id, memberUserId)
  }

  @Delete(':id/invitations/:invitationId')
  revokeInvitation(@Req() req: any, @Param('id') id: string, @Param('invitationId') invitationId: string) {
    return this.collab.revokeInvitation(req.user.id, id, invitationId)
  }

  @Delete(':id/memory/:entryId')
  deleteMemory(@Req() req: any, @Param('id') id: string, @Param('entryId') entryId: string) {
    return this.collab.deleteMemoryEntry(req.user.id, id, entryId)
  }

  @Get(':id/threads')
  listThreads(@Req() req: any, @Param('id') id: string) {
    return this.collab.listThreads(req.user.id, id)
  }

  @Get(':id/threads/:threadId')
  getThread(@Req() req: any, @Param('id') id: string, @Param('threadId') threadId: string) {
    return this.collab.getThread(req.user.id, id, threadId)
  }

  @Post(':id/threads')
  createThread(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { title?: string; message?: string },
  ) {
    return this.collab.createThread(req.user.id, id, body ?? {})
  }

  @Delete(':id/threads/:threadId')
  deleteThread(@Req() req: any, @Param('id') id: string, @Param('threadId') threadId: string) {
    return this.collab.deleteThread(req.user.id, id, threadId)
  }

  @Post(':id/threads/:threadId/messages')
  postThreadMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Param('threadId') threadId: string,
    @Body() body: { content?: string },
  ) {
    return this.collab.postMessage(req.user.id, id, threadId, body ?? {})
  }
}
