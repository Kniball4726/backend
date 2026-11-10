import { SetMetadata } from '@nestjs/common';

export const THROTTLE_LIMIT_KEY = 'THROTTLE_LIMIT_KEY';

export interface ThrottleOptions {
  limit: number;
  ttlSeconds: number;
}

/**
 * Decorador para establecer límites de peticiones por IP en controladores o rutas específicas.
 * @example @Throttle({ limit: 10, ttlSeconds: 60 })
 */
export const Throttle = (options: ThrottleOptions) =>
  SetMetadata(THROTTLE_LIMIT_KEY, options);
