import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './guards/jwt.guard'

class RegisterDto {
  @IsEmail() email: string
  @IsString() @MinLength(8) password: string
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
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.name)
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password)
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
}
