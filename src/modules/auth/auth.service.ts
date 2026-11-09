import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  AuthenticatedUser,
  BranchName,
} from '../../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';

const LOGIN_WINDOW_MS = 60_000;
const MAX_FAILED_LOGIN_ATTEMPTS = 8;

@Injectable()
export class AuthService {
  private static failedAttempts = new Map<
    string,
    { count: number; firstAttemptAt: number }
  >();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  static resetRateLimitForTesting(): void {
    AuthService.failedAttempts.clear();
  }

  private checkLoginRateLimit(key: string): void {
    const now = Date.now();
    const record = AuthService.failedAttempts.get(key);
    if (!record) return;

    if (now - record.firstAttemptAt > LOGIN_WINDOW_MS) {
      AuthService.failedAttempts.delete(key);
      return;
    }

    if (record.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
      throw new HttpException(
        {
          code: 'TOO_MANY_LOGIN_ATTEMPTS',
          message:
            'Demasiados intentos fallidos de inicio de sesión. Espere 60 segundos antes de volver a intentar.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedLogin(key: string): void {
    const now = Date.now();
    const record = AuthService.failedAttempts.get(key);
    if (!record || now - record.firstAttemptAt > LOGIN_WINDOW_MS) {
      AuthService.failedAttempts.set(key, { count: 1, firstAttemptAt: now });
    } else {
      record.count += 1;
    }
  }

  async login(dto: LoginDto) {
    const rateKey = dto.email.toLowerCase().trim();
    this.checkLoginRateLimit(rateKey);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      this.recordFailedLogin(rateKey);
      throw new UnauthorizedException('Credenciales inválidas o cuenta inactiva');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      this.recordFailedLogin(rateKey);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    AuthService.failedAttempts.delete(rateKey);

    const branch = user.branch || BranchName.LOCALES;
    const payload: AuthenticatedUser = {
      sub: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      branch,
    };

    const tokens = await this.issueTokens(payload);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.updateRefreshTokenHash(payload.sub, refreshTokenHash);

    return {
      user: {
        id: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        role: payload.role,
        branch,
      },
      ...tokens,
    };
  }

  async refreshTokens(dto: RefreshTokenDto) {
    const user = await this.usersService.findById(dto.userId);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Sesión expirada. Inicia sesión nuevamente.');
    }

    const matches = await bcrypt.compare(dto.refreshToken, user.refreshTokenHash);
    if (!matches) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const payload: AuthenticatedUser = {
      sub: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      branch: user.branch || BranchName.LOCALES,
    };

    const tokens = await this.issueTokens(payload);
    const newRefreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.updateRefreshTokenHash(payload.sub, newRefreshHash);

    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshTokenHash(userId, null);
    return { loggedOut: true };
  }

  private async issueTokens(payload: AuthenticatedUser) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>(
          'JWT_ACCESS_SECRET',
          'justimobile_dev_access_secret_key_2026_pos_crm',
        ),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '8h'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'justimobile_dev_refresh_secret_key_2026_pos_crm',
        ),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
