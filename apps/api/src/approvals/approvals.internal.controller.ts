import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'
import { ApprovalsService } from './approvals.service'

class ContinueApprovalDto {
  @IsString()
  @IsNotEmpty()
  approvalId!: string
}

@ApiTags('approvals')
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
    if (!expected) return
    const actual = (token ?? '').trim()
    if (actual !== expected) {
      throw new UnauthorizedException('Invalid worker token')
    }
  }
}
