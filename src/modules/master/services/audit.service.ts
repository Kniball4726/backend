import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AuthenticatedUser } from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';

@Injectable()
export class AuditService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  async recordAuditLog(params: {
    action: string;
    actor: AuthenticatedUser;
    targetCollection?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.connection.db) return;

    await this.connection.db.collection(COLLECTION_NAMES.AUDIT_LOGS).insertOne({
      _id: new Types.ObjectId(),
      action: params.action,
      actorType: params.actor.isApiKey ? 'API_KEY' : 'USER',
      actorIdentifier: params.actor.isApiKey
        ? params.actor.apiKeyPrefix || params.actor.email
        : params.actor.email,
      targetCollection: params.targetCollection ?? null,
      targetId: params.targetId ?? null,
      metadata: params.metadata ?? null,
      createdAt: new Date(),
      updatedAt: null,
    });
  }

  async listAuditLogs(limit = 100) {
    return this.db
      .collection(COLLECTION_NAMES.AUDIT_LOGS)
      .find()
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 500))
      .toArray();
  }
}
