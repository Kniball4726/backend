import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AuthenticatedUser } from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { UpdateMercadoPagoSettingsDto } from '../dto/master.dto';
import { AuditService } from './audit.service';
import { MercadoPagoSettings, SettingsService } from './settings.service';

export interface MaskedMercadoPagoResponse {
  isEnabled: boolean;
  isSandbox: boolean;
  publicKey: string | null;
  accessTokenMasked: string | null;
  hasAccessToken: boolean;
  hasWebhookSecret: boolean;
  posId: string | null;
  userId: string | null;
  updatedAt: string | null;
}

@Injectable()
export class MercadoPagoMasterService {
  private readonly logger = new Logger(MercadoPagoMasterService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  private maskToken(token: string | null | undefined): string | null {
    if (!token || token.trim().length === 0) return null;
    const clean = token.trim();
    if (clean.length <= 12) return '****';
    const prefix = clean.slice(0, 8);
    const suffix = clean.slice(-4);
    return `${prefix}-****-****-${suffix}`;
  }

  async getSettings(maskSecrets = true): Promise<MaskedMercadoPagoResponse> {
    const globalSettings = await this.settingsService.getSettings();
    const mp = globalSettings.mercadoPago;

    if (!mp) {
      return {
        isEnabled: false,
        isSandbox: true,
        publicKey: null,
        accessTokenMasked: null,
        hasAccessToken: false,
        hasWebhookSecret: false,
        posId: null,
        userId: null,
        updatedAt: null,
      };
    }

    return {
      isEnabled: Boolean(mp.isEnabled),
      isSandbox: mp.isSandbox ?? true,
      publicKey: mp.publicKey || null,
      accessTokenMasked: maskSecrets
        ? this.maskToken(mp.accessToken)
        : mp.accessToken,
      hasAccessToken: Boolean(mp.accessToken && mp.accessToken.trim().length > 0),
      hasWebhookSecret: Boolean(
        mp.webhookSecret && mp.webhookSecret.trim().length > 0,
      ),
      posId: mp.posId || null,
      userId: mp.userId || null,
      updatedAt: mp.updatedAt ? new Date(mp.updatedAt).toISOString() : null,
    };
  }

  async getRawSettings(): Promise<MercadoPagoSettings | null> {
    const globalSettings = await this.settingsService.getSettings();
    return globalSettings.mercadoPago || null;
  }

  async updateSettings(
    dto: UpdateMercadoPagoSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<MaskedMercadoPagoResponse> {
    const now = new Date();
    const currentSettings = await this.settingsService.getSettings(true);
    const existingMp = currentSettings.mercadoPago;

    let resolvedAccessToken = existingMp?.accessToken || null;
    if (dto.accessToken !== undefined) {
      if (dto.accessToken === null || dto.accessToken.trim() === '') {
        resolvedAccessToken = null;
      } else if (!dto.accessToken.includes('****')) {
        resolvedAccessToken = dto.accessToken.trim();
      }
    }

    let resolvedWebhookSecret = existingMp?.webhookSecret || null;
    if (dto.webhookSecret !== undefined) {
      if (dto.webhookSecret === null || dto.webhookSecret.trim() === '') {
        resolvedWebhookSecret = null;
      } else if (!dto.webhookSecret.includes('****')) {
        resolvedWebhookSecret = dto.webhookSecret.trim();
      }
    }

    const newMp: MercadoPagoSettings = {
      isEnabled: dto.isEnabled ?? existingMp?.isEnabled ?? false,
      isSandbox: dto.isSandbox ?? existingMp?.isSandbox ?? true,
      publicKey:
        dto.publicKey !== undefined
          ? dto.publicKey?.trim() || null
          : existingMp?.publicKey || null,
      accessToken: resolvedAccessToken,
      webhookSecret: resolvedWebhookSecret,
      posId:
        dto.posId !== undefined
          ? dto.posId?.trim() || null
          : existingMp?.posId || null,
      userId:
        dto.userId !== undefined
          ? dto.userId?.trim() || null
          : existingMp?.userId || null,
      updatedAt: now,
    };

    await this.db.collection(COLLECTION_NAMES.SYSTEM_SETTINGS).updateOne(
      { key: 'GLOBAL_CONFIG' },
      {
        $set: {
          mercadoPago: newMp,
          updatedAt: now,
        },
      },
      { upsert: true },
    );

    // Invalida la caché de SettingsService para forzar refresco inmediato
    await this.settingsService.getSettings(true);

    await this.auditService.recordAuditLog({
      action: 'MASTER_MERCADOPAGO_SETTINGS_UPDATED',
      actor,
      targetCollection: COLLECTION_NAMES.SYSTEM_SETTINGS,
      targetId: 'GLOBAL_CONFIG:mercadoPago',
      metadata: {
        isEnabled: newMp.isEnabled,
        isSandbox: newMp.isSandbox,
        hasAccessToken: Boolean(newMp.accessToken),
        posId: newMp.posId,
        userId: newMp.userId,
      },
    });

    return this.getSettings(true);
  }

  async testConnection(actor: AuthenticatedUser, tokenOverride?: string) {
    let token = tokenOverride?.trim();
    if (!token || token.includes('****')) {
      const raw = await this.getRawSettings();
      token = raw?.accessToken || undefined;
    }

    if (!token) {
      throw new BadRequestException(
        'No se ha configurado un Access Token de Mercado Pago para realizar la prueba.',
      );
    }

    try {
      const res = await fetch('https://api.mercadopago.com/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'JustiMobile-POS-Master/1.0',
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        const errorMsg =
          data?.message || data?.error || `Error HTTP ${res.status}`;
        throw new BadRequestException(
          `Mercado Pago rechazó la conexión: ${errorMsg}`,
        );
      }

      await this.auditService.recordAuditLog({
        action: 'MASTER_MERCADOPAGO_CONNECTION_TEST',
        actor,
        targetCollection: COLLECTION_NAMES.SYSTEM_SETTINGS,
        targetId: 'MERCADOPAGO_API',
        metadata: {
          siteId: data.site_id,
          nickname: data.nickname,
          collectorId: data.id,
        },
      });

      return {
        success: true,
        status: 'ACTIVE',
        collectorId: data.id,
        nickname: data.nickname,
        email: data.email,
        siteId: data.site_id,
        message: `¡Conexión exitosa con Mercado Pago! Cuenta activa: ${data.nickname} (${data.site_id}).`,
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const msg =
        err instanceof Error ? err.message : 'Fallo de conexión de red';
      throw new BadRequestException(
        `No fue posible comunicarse con la API de Mercado Pago: ${msg}`,
      );
    }
  }
}
