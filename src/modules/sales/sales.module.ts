import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/catalog.module';
import { CrmModule } from '../crm/crm.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { Sale, SaleSchema } from './schemas/sale.schema';
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
  controllers: [SalesController],
  providers: [
    SalesPricingService,
    SalesTransactionService,
    SalesQueryService,
    SalesService,
  ],
  exports: [
    SalesPricingService,
    SalesTransactionService,
    SalesQueryService,
    SalesService,
  ],
})
export class SalesModule {}
