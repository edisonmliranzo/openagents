import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'
import { ApprovalsService } from './approvals.service'

class ContinueApprovalDto {
  @IsString()
  @IsNotEmpty()
  approvalId!: string
}

import { Public } from '../common/public.decorator'
@ApiTags('approvals')
@Public()
@Controller('approvals/internal')
export class ApprovalsInternalController {
  constructor(private approvals: ApprovalsService) {}

  @ApiExcludeEndpoint()
  @Post('continue')
  continue(
    @Body() dto: ContinueApprovalDto,
    @Headers('x-approval-worker-token') token?: string,
  ) {
    this.assertWorkerToken(token)
    return this.approvals.continueApprovedResolutionById(dto.approvalId, 'queue')
  }

  private assertWorkerToken(token?: string) {
    const expected = (process.env.APPROVAL_WORKER_TOKEN ?? '').trim()
    if (!expected) throw new UnauthorizedException('Worker token is not configured')
    const actual = (token ?? '').trim()
    if (!expected || actual !== expected) {
      throw new UnauthorizedException('Invalid worker token')
    }
  }
}
