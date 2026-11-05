import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { KeyManagementService } from './key-management.service'

class RotateKeysDto {
  @IsOptional()
  @IsBoolean()
  rotateDataKeys?: boolean
}

class TextDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  value!: string
}

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('keys')
@ApiBearerAuth()
@Controller('keys')
export class KeyManagementController {
  constructor(private readonly keys: KeyManagementService) {}

  @Get('status')
  status(@Req() req: any) {
    return this.keys.status(uid(req))
  }

  @Get('history')
  history() {
    return this.keys.history()
  }

  /** Self-test: envelope-encrypt a value with the caller's data key. */
  @Post('encrypt')
  async encrypt(@Req() req: any, @Body() dto: TextDto) {
    return { value: await this.keys.encrypt(uid(req), dto.value) }
  }

  /** Decrypts enc:v2 and legacy enc:v1 values for the caller. */
  @Post('decrypt')
  async decrypt(@Req() req: any, @Body() dto: TextDto) {
    return { value: await this.keys.decrypt(uid(req), dto.value) }
  }

  @Post('rotate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  rotate(@Req() req: any, @Body() dto: RotateKeysDto) {
    return this.keys.rotate(uid(req), { rotateDataKeys: dto.rotateDataKeys })
  }
}
