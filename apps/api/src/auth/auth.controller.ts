import { Controller, Post, Get, Body, UseGuards, Req, HttpCode } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './guards/jwt.guard'
import { Throttle } from '@nestjs/throttler'
import { Public } from '../common/public.decorator'

// Brute-force protection on unauthenticated credential routes. The auth
// service also enforces per-identity lockout; this caps request volume per IP.
const AUTH_LIMITS = { default: { limit: 10, ttl: 60_000 } }

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

class ChangePasswordDto {
  @IsString() currentPassword: string
  @IsString()
  @MinLength(12)
  newPassword: string
}

class ForgotPasswordDto {
  @IsEmail() email: string
}

class ResetPasswordDto {
  @IsString() token: string
  @IsString()
  @MinLength(12)
  newPassword: string
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle(AUTH_LIMITS)
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.auth.register(dto.email, dto.password, dto.name, this.getClientIp(req), this.getUserAgent(req))
  }

  @Public()
  @Throttle(AUTH_LIMITS)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.auth.login(dto.email, dto.password, this.getClientIp(req), this.getUserAgent(req))
  }

  @Public()
  @Throttle(AUTH_LIMITS)
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

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: any) {
    return this.auth.changePassword(req.user.id, dto.currentPassword, dto.newPassword)
  }

  @Public()
  @Throttle(AUTH_LIMITS)
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    const baseUrl = (
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_BASE_URL ||
      (process.env.FRONTEND_URLS ?? '').split(',')[0] ||
      'http://localhost:3000'
    )
      .trim()
      .replace(/\/+$/, '')
    return this.auth.forgotPassword(dto.email, baseUrl)
  }

  @Public()
  @Throttle(AUTH_LIMITS)
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword)
  }

  private getClientIp(req: any) {
    const cfIp = req?.headers?.['cf-connecting-ip']
    if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim()
    const realIp = req?.headers?.['x-real-ip']
    if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
    const forwarded = req?.headers?.['x-forwarded-for']
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      const parts = String(forwarded[0]).split(',').map((s) => s.trim()).filter(Boolean)
      if (parts.length > 0) return parts[parts.length - 1]!
    }
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean)
      if (parts.length > 0) return parts[parts.length - 1]!
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
