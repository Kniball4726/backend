import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/enums/role.enum';
import {
  CreateApiKeyDto,
  CreateWebhookDto,
  TestAfipConnectionDto,
  UpdateAfipSettingsDto,
  UpdateMercadoPagoSettingsDto,
  UpdateSystemSettingsDto,
} from './dto/master.dto';
import { AfipMasterService } from './services/afip-master.service';
import { ApiKeysService } from './services/api-keys.service';
import { AuditService } from './services/audit.service';
import { MercadoPagoMasterService } from './services/mercadopago-master.service';
import {
  GlobalSystemSettings,
  SettingsService,
} from './services/settings.service';
import { WebhooksService } from './services/webhooks.service';

export { GlobalSystemSettings };

/**
 * Facade ligera del módulo MASTER que coordina los sub-servicios especializados:
 * - SettingsService (Parámetros globales y Kill-Switch de sesiones)
 * - ApiKeysService (Claves API externas con hash SHA-256 y scopes)
 * - WebhooksService (Notificaciones salientes firmadas con HMAC-SHA256)
 * - AuditService (Bitácora inmutable de auditoría)
 * - MercadoPagoMasterService (Administración y pruebas de credenciales Mercado Pago)
 * - AfipMasterService (Facturación Electrónica AFIP / ARCA y pruebas de conexión WSFE)
 */
@Injectable()
export class MasterService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly apiKeysService: ApiKeysService,
    private readonly webhooksService: WebhooksService,
    private readonly auditService: AuditService,
    private readonly mpMasterService: MercadoPagoMasterService,
    private readonly afipMasterService: AfipMasterService,
  ) {}

  getSettings(): Promise<GlobalSystemSettings> {
    return this.settingsService.getSettings();
  }

  updateSettings(dto: UpdateSystemSettingsDto, actor: AuthenticatedUser) {
    return this.settingsService.updateSettings(dto, actor);
  }

  getMercadoPagoSettings(maskSecrets = true, companyId?: string) {
    return this.mpMasterService.getSettings(maskSecrets, companyId);
  }

  updateMercadoPagoSettings(
    dto: UpdateMercadoPagoSettingsDto,
    actor: AuthenticatedUser,
    companyId?: string,
  ) {
    return this.mpMasterService.updateSettings(dto, actor, companyId);
  }

  testMercadoPagoConnection(
    actor: AuthenticatedUser,
    tokenOverride?: string,
    companyId?: string,
  ) {
    return this.mpMasterService.testConnection(actor, tokenOverride, companyId);
  }

  getAfipSettings(maskSecrets = true, companyId?: string) {
    return this.afipMasterService.getSettings(maskSecrets, companyId);
  }

  updateAfipSettings(
    dto: UpdateAfipSettingsDto,
    actor: AuthenticatedUser,
    companyId?: string,
  ) {
    return this.afipMasterService.updateSettings(dto, actor, companyId);
  }

  testAfipConnection(
    actor: AuthenticatedUser,
    dto?: TestAfipConnectionDto,
    companyId?: string,
  ) {
    return this.afipMasterService.testConnection(
      actor,
      {
        cuitOverride: dto?.cuitOverride ?? undefined,
        isProductionOverride: dto?.isProductionOverride,
      },
      companyId,
    );
  }

  revokeAllMobileSessions(actor: AuthenticatedUser) {
    return this.settingsService.revokeAllMobileSessions(actor);
  }

  createApiKey(dto: CreateApiKeyDto, actor: AuthenticatedUser) {
    return this.apiKeysService.createApiKey(dto, actor);
  }

  listApiKeys() {
    return this.apiKeysService.listApiKeys();
  }

  revokeApiKey(id: string, actor: AuthenticatedUser) {
    return this.apiKeysService.revokeApiKey(id, actor);
  }

  createWebhook(dto: CreateWebhookDto, actor: AuthenticatedUser) {
    return this.webhooksService.createWebhook(dto, actor);
  }

  listWebhooks() {
    return this.webhooksService.listWebhooks();
  }

  deleteWebhook(id: string, actor: AuthenticatedUser) {
    return this.webhooksService.deleteWebhook(id, actor);
  }

  dispatchWebhookEvent(
    event: 'sale.completed' | 'sale.cancelled' | 'customer.discount_assigned',
    data: Record<string, unknown>,
  ): Promise<void> {
    return this.webhooksService.dispatchWebhookEvent(event, data);
  }

  recordAuditLog(params: {
    action: string;
    actor: AuthenticatedUser;
    targetCollection?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    return this.auditService.recordAuditLog(params);
  }

  listAuditLogs(limit = 100) {
    return this.auditService.listAuditLogs(limit);
  }
}
