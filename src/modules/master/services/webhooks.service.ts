import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { createHmac, randomBytes } from 'crypto';
import { Connection, Types } from 'mongoose';
import { AuthenticatedUser } from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { CreateWebhookDto } from '../dto/master.dto';
import { AuditService } from './audit.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

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

  async createWebhook(dto: CreateWebhookDto, actor: AuthenticatedUser) {
    const now = new Date();
    const signingSecret = `whsec_${randomBytes(20).toString('hex')}`;
    const id = new Types.ObjectId();

    const doc = {
      _id: id,
      name: dto.name,
      targetUrl: dto.targetUrl,
      signingSecret,
      events: dto.events,
      isActive: true,
      lastTriggeredAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.collection(COLLECTION_NAMES.WEBHOOKS).insertOne(doc);

    await this.auditService.recordAuditLog({
      action: 'WEBHOOK_CREATED',
      actor,
      targetCollection: COLLECTION_NAMES.WEBHOOKS,
      targetId: id.toString(),
      metadata: {
        name: dto.name,
        targetUrl: dto.targetUrl,
        events: dto.events,
      },
    });

    return doc;
  }

  async listWebhooks() {
    return this.db
      .collection(COLLECTION_NAMES.WEBHOOKS)
      .find()
      .sort({ createdAt: -1 })
      .toArray();
  }

  async deleteWebhook(id: string, actor: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de webhook inválido');
    }

    const res = await this.db
      .collection(COLLECTION_NAMES.WEBHOOKS)
      .findOneAndDelete({ _id: new Types.ObjectId(id) });

    if (!res) {
      throw new NotFoundException('Webhook no encontrado');
    }

    await this.auditService.recordAuditLog({
      action: 'WEBHOOK_DELETED',
      actor,
      targetCollection: COLLECTION_NAMES.WEBHOOKS,
      targetId: id,
      metadata: { name: res.name, targetUrl: res.targetUrl },
    });

    return { deleted: true, id };
  }

  async dispatchWebhookEvent(
    event: 'sale.completed' | 'sale.cancelled' | 'customer.discount_assigned',
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.connection.db) return;

    try {
      const hooks = await this.connection.db
        .collection(COLLECTION_NAMES.WEBHOOKS)
        .find({ isActive: true, events: event })
        .toArray();

      if (hooks.length === 0) return;

      const bodyString = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data,
      });

      for (const hook of hooks) {
        const signature = createHmac('sha256', hook.signingSecret as string)
          .update(bodyString)
          .digest('hex');

        fetch(hook.targetUrl as string, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-JustiMobile-Event': event,
            'X-JustiMobile-Signature': `sha256=${signature}`,
          },
          body: bodyString,
          signal: AbortSignal.timeout(5000),
        })
          .then(() => {
            this.connection.db
              ?.collection(COLLECTION_NAMES.WEBHOOKS)
              .updateOne(
                { _id: hook._id },
                { $set: { lastTriggeredAt: new Date() } },
              )
              .catch(() => undefined);
          })
          .catch((err) => {
            this.logger.warn(
              `Fallo al enviar webhook "${hook.name as string}" (${hook.targetUrl as string}): ${String(err)}`,
            );
          });
      }
    } catch (err) {
      this.logger.warn(`Error buscando webhooks para ${event}: ${String(err)}`);
    }
  }
}
