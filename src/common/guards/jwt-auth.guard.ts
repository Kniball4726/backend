import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { AuthGuard } from '@nestjs/passport';
import { createHash } from 'crypto';
import { Connection } from 'mongoose';
import { COLLECTION_NAMES } from '../../database/json-schemas/collections.json-schema';
import { SettingsService } from '../../modules/master/services/settings.service';
import {
  ApiKeyScope,
  AuthenticatedUser,
  UserRole,
} from '../enums/role.enum';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@InjectConnection() private readonly connection: Connection) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();

    const rawApiKeyHeader = request.headers['x-api-key'];
    const apiKey = Array.isArray(rawApiKeyHeader)
      ? rawApiKeyHeader[0]
      : rawApiKeyHeader;

    // Si la petición viene de una aplicación externa con X-API-Key
    if (apiKey && apiKey.trim().length > 0) {
      const keyHash = createHash('sha256')
        .update(apiKey.trim())
        .digest('hex');

      const db = this.connection.db;
      if (!db) {
        throw new UnauthorizedException('Base de datos no disponible');
      }

      const now = new Date();
      const apiKeyDoc = await db
        .collection(COLLECTION_NAMES.API_KEYS)
        .findOneAndUpdate(
          {
            keyHash,
            isActive: true,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
          },
          { $set: { lastUsedAt: now } },
          { returnDocument: 'after' },
        );

      if (!apiKeyDoc) {
        throw new UnauthorizedException(
          'API Key inválida, revocada o expirada',
        );
      }

      request.user = {
        sub: apiKeyDoc.createdByUserId.toString(),
        email: `apikey+${apiKeyDoc.keyPrefix}@justimobile.external`,
        fullName: `API Key: ${apiKeyDoc.name as string}`,
        role: UserRole.ADMIN,
        isApiKey: true,
        apiKeyPrefix: apiKeyDoc.keyPrefix as string,
        scopes: (apiKeyDoc.scopes as ApiKeyScope[]) || [],
      };

      return true;
    }

    // Autenticación estándar JWT Bearer para clientes móviles/web
    const activated = (await super.canActivate(context)) as boolean;
    if (activated && request.user && request.user.role !== UserRole.MASTER) {
      const killSwitchSec = SettingsService.getLastKillSwitchTimestampSec();
      if (
        killSwitchSec > 0 &&
        request.user.iat &&
        request.user.iat <= killSwitchSec
      ) {
        throw new UnauthorizedException(
          'Sesión revocada inmediatamente por Kill-Switch de seguridad MASTER.',
        );
      }
    }

    return activated;
  }
}
