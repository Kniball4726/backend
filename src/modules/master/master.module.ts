import { Global, Module } from '@nestjs/common';
import { MasterController } from './master.controller';
import { MasterService } from './master.service';
import { AfipMasterService } from './services/afip-master.service';
import { ApiKeysService } from './services/api-keys.service';
import { AuditService } from './services/audit.service';
import { MercadoPagoMasterService } from './services/mercadopago-master.service';
import { SettingsService } from './services/settings.service';
import { WebhooksService } from './services/webhooks.service';

@Global()
@Module({
  controllers: [MasterController],
  providers: [
    AuditService,
    SettingsService,
    ApiKeysService,
    WebhooksService,
    MercadoPagoMasterService,
    AfipMasterService,
    MasterService,
  ],
  exports: [
    AuditService,
    SettingsService,
    ApiKeysService,
    WebhooksService,
    MercadoPagoMasterService,
    AfipMasterService,
    MasterService,
  ],
})
export class MasterModule {}
