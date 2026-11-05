import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { MAX_BLOB, SyncService } from './sync.service'

class RegisterDeviceDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string
  @IsOptional() @IsString() @MaxLength(40) platform?: string
}
class KeyringDto {
  @IsString() @MinLength(8) @MaxLength(256) salt!: string
  @IsInt() @Min(100000) @Max(2000000) iterations!: number
  @IsString() @MinLength(8) @MaxLength(2048) check!: string
  @IsOptional() @IsBoolean() reset?: boolean
}
class PushRecordDto {
  @IsString() @Matches(/^[a-zA-Z0-9:_.\-/]{1,160}$/) key!: string
  @IsInt() @Min(0) baseVersion!: number
  @IsString() @MaxLength(MAX_BLOB) blob!: string
  @IsOptional() @IsBoolean() deleted?: boolean
}
class PushDto {
  @IsString() @MaxLength(64) deviceId!: string
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PushRecordDto) records!: PushRecordDto[]
}
class PullDto {
  @IsString() @MaxLength(64) deviceId!: string
  @IsOptional() @IsInt() @Min(0) since?: number
}

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('state') state(@Req() req: any) { return this.sync.state(uid(req)) }
  @Get('keyring') keyring(@Req() req: any) { return this.sync.keyring(uid(req)) }
  @Put('keyring') setKeyring(@Req() req: any, @Body() dto: KeyringDto) {
    return this.sync.setKeyring(uid(req), { salt: dto.salt, iterations: dto.iterations, check: dto.check }, !!dto.reset)
  }
  @Post('devices') register(@Req() req: any, @Body() dto: RegisterDeviceDto) {
    return this.sync.registerDevice(uid(req), dto.name, dto.platform ?? 'web')
  }
  @Delete('devices/:id') revoke(@Req() req: any, @Param('id') id: string) { return this.sync.revokeDevice(uid(req), id) }
  @Post('push') push(@Req() req: any, @Body() dto: PushDto) { return this.sync.push(uid(req), dto.deviceId, dto.records) }
  @Post('pull') pull(@Req() req: any, @Body() dto: PullDto) { return this.sync.pull(uid(req), dto.deviceId, dto.since) }
  @Get('conflicts') conflicts(@Req() req: any, @Query('all') all?: string) { return this.sync.conflicts(uid(req), all === 'true') }
  @Post('conflicts/:id/resolve') resolve(@Req() req: any, @Param('id') id: string) { return this.sync.resolveConflict(uid(req), id) }
}
