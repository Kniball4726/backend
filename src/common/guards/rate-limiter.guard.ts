import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  THROTTLE_LIMIT_KEY,
  ThrottleOptions,
} from '../decorators/throttle.decorator';

interface ClientWindow {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private static store = new Map<string, ClientWindow>();

  constructor(private readonly reflector: Reflector) {}

  static resetForTesting(): void {
    RateLimiterGuard.store.clear();
  }

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(
      THROTTLE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si la ruta no especifica decorador @Throttle, no aplica restricción estricta
    if (!options) {
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    // Bypass opcional para pruebas unitarias
    if (req.headers?.['x-bypass-rate-limit'] === 'true') {
      return true;
    }

    const rawIp =
      req.headers?.['x-forwarded-for'] ||
      req.headers?.['x-real-ip'] ||
      req.ip ||
      req.socket?.remoteAddress ||
      '127.0.0.1';

    const clientIp = String(Array.isArray(rawIp) ? rawIp[0] : rawIp)
      .split(',')[0]
      .trim();

    const handlerName = context.getHandler().name;
    const key = `${clientIp}:${handlerName}`;
    const now = Date.now();
    const windowMs = options.ttlSeconds * 1000;

    let windowRecord = RateLimiterGuard.store.get(key);

    if (!windowRecord || now >= windowRecord.resetAt) {
      windowRecord = {
        count: 1,
        resetAt: now + windowMs,
      };
      RateLimiterGuard.store.set(key, windowRecord);
    } else {
      windowRecord.count += 1;
    }

    const remaining = Math.max(0, options.limit - windowRecord.count);
    const resetSeconds = Math.max(
      1,
      Math.ceil((windowRecord.resetAt - now) / 1000),
    );

    // Establecer encabezados estándar de rate limit en Fastify si res.header está disponible
    if (typeof res?.header === 'function') {
      res.header('X-RateLimit-Limit', options.limit);
      res.header('X-RateLimit-Remaining', remaining);
      res.header('X-RateLimit-Reset', Math.ceil(windowRecord.resetAt / 1000));
    }

    if (windowRecord.count > options.limit) {
      if (typeof res?.header === 'function') {
        res.header('Retry-After', resetSeconds);
      }

      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Límite de peticiones excedido para esta acción. Por seguridad, intente nuevamente en ${resetSeconds} segundos.`,
          details: {
            retryAfterSeconds: resetSeconds,
            limit: options.limit,
            ttlSeconds: options.ttlSeconds,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
