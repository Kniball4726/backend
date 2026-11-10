import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle } from '../../common/decorators/throttle.decorator';
import { AuthenticatedUser } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimiterGuard } from '../../common/guards/rate-limiter.guard';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';

@ApiTags('Auth (Autenticación Mobile-First)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(RateLimiterGuard)
  @Throttle({ limit: 12, ttlSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Iniciar sesión en app móvil (Devuelve Access Token, Refresh Token y Rol: ADMIN | CRM | CASHIER)',
  })
  login(@Body() dto: LoginDto, @Req() req: any) {
    const rawIp =
      req?.headers?.['x-forwarded-for'] ||
      req?.headers?.['x-real-ip'] ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      '127.0.0.1';
    const clientIp = String(Array.isArray(rawIp) ? rawIp[0] : rawIp)
      .split(',')[0]
      .trim();
    return this.authService.login(dto, clientIp);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotar Access Token y Refresh Token para mantener sesión móvil activa',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión e invalidar Refresh Token' })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.sub);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil y rol del operador autenticado' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
