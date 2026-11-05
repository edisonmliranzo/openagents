import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { SandboxExecService } from './sandbox-exec.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

class SandboxRunDto {
  @IsIn(['sh', 'node', 'python'])
  language!: 'sh' | 'node' | 'python'

  @IsString() @MaxLength(20_000)
  code!: string

  @IsOptional() @IsInt() @Min(500) @Max(60_000)
  timeoutMs?: number

  @IsOptional() @IsInt() @Min(32) @Max(2048)
  memoryMb?: number

  @IsOptional() @IsNumber() @Min(0.25) @Max(4)
  cpus?: number

  @IsOptional() @IsBoolean()
  network?: boolean

  @IsOptional() @IsIn(['auto', 'docker', 'restricted'])
  isolation?: 'auto' | 'docker' | 'restricted'
}

@ApiTags('sandbox-exec')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner')
@Controller('sandbox-exec')
export class SandboxExecController {
  constructor(private readonly sandbox: SandboxExecService) {}

  @Get('status')
  status() {
    return this.sandbox.status()
  }

  @Post('run')
  run(@Req() req: any, @Body() dto: SandboxRunDto) {
    return this.sandbox.run(uid(req), dto)
  }

  @Get('history')
  history(@Req() req: any) {
    return this.sandbox.getHistory(uid(req))
  }

  @Delete('history')
  clear(@Req() req: any) {
    return this.sandbox.clearHistory(uid(req))
  }
}
