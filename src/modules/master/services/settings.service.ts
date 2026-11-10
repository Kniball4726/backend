import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AuthenticatedUser, UserRole } from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { UpdateSystemSettingsDto } from '../dto/master.dto';
import { AuditService } from './audit.service';

export interface MercadoPagoSettings {
  isEnabled: boolean;
  isSandbox: boolean;
  publicKey: string | null;
  accessToken: string | null;
  webhookSecret: string | null;
  posId: string | null;
  userId: string | null;
  updatedAt: Date | null;
}

export interface AfipSettings {
  isEnabled: boolean;
  isProduction: boolean;
  cuit: string | null;
  puntoVenta: number | null;
  cert: string | null;
  privateKey: string | null;
  wsaaToken?: string | null;
  wsaaSign?: string | null;
  wsaaExpiresAt?: Date | null;
  defaultConcepto: number; // 1 = Productos, 2 = Servicios, 3 = Productos y Servicios
  defaultCbteTipo: number; // 6 = Factura B, 1 = Factura A, 11 = Factura C
  updatedAt: Date | null;
}

export interface GlobalSystemSettings {
  key: 'GLOBAL_CONFIG';
  businessName: string;
  receiptFooterText: string | null;
  maxCrmDiscountPercentage: number;
  defaultTaxRateBasisPoints: number;
  maintenanceMode: {
    posPaused: boolean;
    crmPaused: boolean;
    reason: string | null;
  };
  mercadoPago?: MercadoPagoSettings | null;
  afip?: AfipSettings | null;
  lastKillSwitchAt?: Date | null;
  updatedAt: Date;
}

const SETTINGS_CACHE_TTL_MS = 30_000;

@Injectable()
export class SettingsService {
  private static cachedSettings: GlobalSystemSettings | null = null;
  private static cacheExpiresAt = 0;
  private static lastKillSwitchTimestampSec = 0;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  static getLastKillSwitchTimestampSec(): number {
    return SettingsService.lastKillSwitchTimestampSec;
  }

  static resetCacheForTesting(): void {
    SettingsService.cachedSettings = null;
    SettingsService.cacheExpiresAt = 0;
    SettingsService.lastKillSwitchTimestampSec = 0;
  }

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  async getSettings(forceRefresh = false): Promise<GlobalSystemSettings> {
    const nowMs = Date.now();
    if (
      !forceRefresh &&
      SettingsService.cachedSettings &&
      nowMs < SettingsService.cacheExpiresAt
    ) {
      return SettingsService.cachedSettings;
    }

    const doc = await this.db
      .collection(COLLECTION_NAMES.SYSTEM_SETTINGS)
      .findOne({ key: 'GLOBAL_CONFIG' });

    const resolved: GlobalSystemSettings = doc
      ? (doc as unknown as GlobalSystemSettings)
      : {
          key: 'GLOBAL_CONFIG',
          businessName: 'JustiMobile POS & CRM',
          receiptFooterText: '¡Gracias por su compra!',
          maxCrmDiscountPercentage: 100,
          defaultTaxRateBasisPoints: 1600,
          maintenanceMode: {
            posPaused: false,
            crmPaused: false,
            reason: null,
          },
          lastKillSwitchAt: null,
          updatedAt: new Date(),
        };

    if (resolved.lastKillSwitchAt) {
      const ksDate =
        resolved.lastKillSwitchAt instanceof Date
          ? resolved.lastKillSwitchAt
          : new Date(String(resolved.lastKillSwitchAt));
      SettingsService.lastKillSwitchTimestampSec = Math.floor(
        ksDate.getTime() / 1000,
      );
    }

    SettingsService.cachedSettings = resolved;
    SettingsService.cacheExpiresAt = nowMs + SETTINGS_CACHE_TTL_MS;
    return resolved;
  }

  async updateSettings(dto: UpdateSystemSettingsDto, actor: AuthenticatedUser) {
    const now = new Date();
    const current = await this.getSettings(true);

    const updatedPayload = {
      businessName: dto.businessName ?? current.businessName,
      receiptFooterText:
        dto.receiptFooterText !== undefined
          ? dto.receiptFooterText
          : current.receiptFooterText,
      maxCrmDiscountPercentage:
        dto.maxCrmDiscountPercentage ?? current.maxCrmDiscountPercentage,
      defaultTaxRateBasisPoints:
        dto.defaultTaxRateBasisPoints ?? current.defaultTaxRateBasisPoints,
      maintenanceMode: dto.maintenanceMode
        ? {
            posPaused: dto.maintenanceMode.posPaused,
            crmPaused: dto.maintenanceMode.crmPaused,
            reason: dto.maintenanceMode.reason ?? null,
          }
        : current.maintenanceMode,
      updatedByUserId: Types.ObjectId.isValid(actor.sub)
        ? new Types.ObjectId(actor.sub)
        : null,
      updatedAt: now,
    };

    await this.db.collection(COLLECTION_NAMES.SYSTEM_SETTINGS).updateOne(
      { key: 'GLOBAL_CONFIG' },
      {
        $set: updatedPayload,
        $setOnInsert: {
          _id: new Types.ObjectId(),
          key: 'GLOBAL_CONFIG',
          createdAt: now,
        },
      },
      { upsert: true },
    );

    const newSettings: GlobalSystemSettings = {
      key: 'GLOBAL_CONFIG',
      ...updatedPayload,
      lastKillSwitchAt: current.lastKillSwitchAt ?? null,
    };

    SettingsService.cachedSettings = newSettings;
    SettingsService.cacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;

    await this.auditService.recordAuditLog({
      action: 'MASTER_SETTINGS_UPDATED',
      actor,
      targetCollection: COLLECTION_NAMES.SYSTEM_SETTINGS,
      targetId: 'GLOBAL_CONFIG',
      metadata: updatedPayload,
    });

    return newSettings;
  }

  async revokeAllMobileSessions(actor: AuthenticatedUser) {
    const now = new Date();
    const res = await this.db.collection(COLLECTION_NAMES.USERS).updateMany(
      { role: { $ne: UserRole.MASTER } },
      {
        $set: {
          refreshTokenHash: null,
          updatedAt: now,
        },
      },
    );

    await this.db.collection(COLLECTION_NAMES.SYSTEM_SETTINGS).updateOne(
      { key: 'GLOBAL_CONFIG' },
      {
        $set: {
          lastKillSwitchAt: now,
          updatedAt: now,
        },
      },
    );

    // Invalidar inmediatamente en memoria todos los AccessTokens emitidos antes o en este segundo
    SettingsService.lastKillSwitchTimestampSec = Math.ceil(
      now.getTime() / 1000,
    );
    if (SettingsService.cachedSettings) {
      SettingsService.cachedSettings = {
        ...SettingsService.cachedSettings,
        lastKillSwitchAt: now,
        updatedAt: now,
      };
    }

    await this.auditService.recordAuditLog({
      action: 'KILL_SWITCH_REVOKE_ALL_SESSIONS',
      actor,
      targetCollection: COLLECTION_NAMES.USERS,
      targetId: 'ALL_NON_MASTER_USERS',
      metadata: { revokedSessionsCount: res.modifiedCount },
    });

    return {
      revokedUsersCount: res.modifiedCount,
      executedAt: now.toISOString(),
    };
  }
}
