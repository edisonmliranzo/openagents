import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'
import { ExtractionService } from './extraction.service'

class ProcessExtractionJobDto {
  @IsString()
  @IsNotEmpty()
  extractionId!: string
}

@ApiTags('extract')
@Controller('extract/internal')
export class ExtractionInternalController {
  constructor(private readonly extraction: ExtractionService) {}

  @ApiExcludeEndpoint()
  @Post('process')
  process(
    @Body() dto: ProcessExtractionJobDto,
    @Headers('x-extraction-worker-token') token?: string,
  ) {
    this.assertWorkerToken(token)
    return this.extraction.processJob(dto.extractionId)
  }

  private assertWorkerToken(token?: string) {
    const expected = (process.env.EXTRACTION_WORKER_TOKEN ?? '').trim()
    if (!expected) return
    const actual = (token ?? '').trim()
    if (actual !== expected) {
      throw new UnauthorizedException('Invalid extraction worker token')
    }
  }
}
