import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'
import { CiHealerService } from './ci-healer.service'

class ProcessCiIncidentDto {
  @IsString()
  @IsNotEmpty()
  incidentId!: string
}

@ApiTags('ci')
@Controller('ci/internal')
export class CiHealerInternalController {
  constructor(private readonly ciHealer: CiHealerService) {}

  @ApiExcludeEndpoint()
  @Post('process')
  process(
    @Body() dto: ProcessCiIncidentDto,
    @Headers('x-ci-healer-worker-token') token?: string,
  ) {
    this.assertWorkerToken(token)
    return this.ciHealer.processIncident(dto.incidentId)
  }

  private assertWorkerToken(token?: string) {
    const expected = (process.env.CI_HEALER_WORKER_TOKEN ?? '').trim()
    if (!expected) return
    const actual = (token ?? '').trim()
    if (actual !== expected) {
      throw new UnauthorizedException('Invalid CI healer worker token')
    }
  }
}
