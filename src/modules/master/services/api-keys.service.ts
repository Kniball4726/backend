import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Connection, Types } from 'mongoose';
import { AuthenticatedUser } from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { CreateApiKeyDto } from '../dto/master.dto';
import { AuditService } from './audit.service';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  async createApiKey(dto: CreateApiKeyDto, actor: AuthenticatedUser) {
    const now = new Date();
    const randomToken = randomBytes(24).toString('hex');
    const rawApiKey = `jmk_live_${randomToken}`;
    const keyPrefix = rawApiKey.slice(0, 17);
    const keyHash = createHash('sha256').update(rawApiKey).digest('hex');

    const expiresAt = dto.expiresInDays
      ? new Date(now.getTime() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      name: dto.name,
      keyPrefix,
      keyHash,
      scopes: dto.scopes,
      isActive: true,
      expiresAt,
      lastUsedAt: null,
      createdByUserId: new Types.ObjectId(actor.sub),
      createdAt: now,
      updatedAt: now,
    };

    await this.db.collection(COLLECTION_NAMES.API_KEYS).insertOne(doc);

    await this.auditService.recordAuditLog({
      action: 'API_KEY_CREATED',
      actor,
      targetCollection: COLLECTION_NAMES.API_KEYS,
      targetId: id.toString(),
      metadata: {
        name: dto.name,
        keyPrefix,
        scopes: dto.scopes,
        expiresAt,
      },
    });

    return {
      id: id.toString(),
      name: dto.name,
      apiKey: rawApiKey,
      keyPrefix,
      scopes: dto.scopes,
      expiresAt,
      createdAt: now,
      warning:
        'Guarda esta clave API en un lugar seguro. Por seguridad solo almacenamos su hash SHA-256 y no volverá a mostrarse completa.',
    };
  }

  async listApiKeys() {
    return this.db
      .collection(COLLECTION_NAMES.API_KEYS)
      .find({}, { projection: { keyHash: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async revokeApiKey(id: string, actor: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de API Key inválido');
    }

    const now = new Date();
    const res = await this.db
      .collection(COLLECTION_NAMES.API_KEYS)
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $set: { isActive: false, updatedAt: now } },
        { projection: { keyHash: 0 }, returnDocument: 'after' },
      );

    if (!res) {
      throw new NotFoundException('API Key no encontrada');
    }

    await this.auditService.recordAuditLog({
      action: 'API_KEY_REVOKED',
      actor,
      targetCollection: COLLECTION_NAMES.API_KEYS,
      targetId: id,
      metadata: { keyPrefix: res.keyPrefix, name: res.name },
    });

    return res;
  }
}
