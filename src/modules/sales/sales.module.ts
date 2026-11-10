import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/catalog.module';
import { CrmModule } from '../crm/crm.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { Sale, SaleSchema } from './schemas/sale.schema';
import { MercadoPagoPosService } from './services/mercadopago-pos.service';
import { SalesBiService } from './services/sales-bi.service';
import { SalesPricingService } from './services/sales-pricing.service';
import { SalesQueryService } from './services/sales-query.service';
import { SalesTransactionService } from './services/sales-transaction.service';

@Module({
  imports: [
    CatalogModule,
    InventoryModule,
    CrmModule,
    MongooseModule.forFeature([{ name: Sale.name, schema: SaleSchema }]),
  ],
  controllers: [SalesController, MercadoPagoWebhookController],
  providers: [
    SalesPricingService,
    SalesTransactionService,
    SalesQueryService,
    MercadoPagoPosService,
    SalesBiService,
    SalesService,
  ],
  exports: [
    SalesPricingService,
    SalesTransactionService,
    SalesQueryService,
    MercadoPagoPosService,
    SalesBiService,
    SalesService,
  ],
})
export class SalesModule {}
