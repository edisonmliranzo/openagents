import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './guards/jwt.guard'

class RegisterDto {
  @IsEmail() email: string
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message: 'Password must include uppercase, lowercase, number, and symbol.',
  })
  password: string
  @IsString() @IsOptional() name?: string
}

class LoginDto {
  @IsEmail() email: string
  @IsString() password: string
}

class RefreshDto {
  @IsString() refreshToken: string
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.auth.register(dto.email, dto.password, dto.name, this.getClientIp(req), this.getUserAgent(req))
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.auth.login(dto.email, dto.password, this.getClientIp(req), this.getUserAgent(req))
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken)
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logout(@Req() req: any) {
    return this.auth.logout(req.user.id)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@Req() req: any) {
    return req.user
  }

  private getClientIp(req: any) {
    const forwarded = req?.headers?.['x-forwarded-for']
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return String(forwarded[0]).split(',')[0].trim()
    }
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim() ?? 'unknown'
    }
    return String(req?.ip ?? req?.socket?.remoteAddress ?? 'unknown').trim()
  }

  private getUserAgent(req: any) {
    const raw = req?.headers?.['user-agent']
    if (Array.isArray(raw) && raw.length > 0) {
      return String(raw[0]).trim()
    }
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim()
    }
    return 'unknown'
  }
}
