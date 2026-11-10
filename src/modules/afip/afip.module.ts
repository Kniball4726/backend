import { Global, Module } from '@nestjs/common';
import { AfipInvoiceService } from './services/afip-invoice.service';
import { AfipWsfeService } from './services/afip-wsfe.service';

@Global()
@Module({
  providers: [AfipWsfeService, AfipInvoiceService],
  exports: [AfipWsfeService, AfipInvoiceService],
})
export class AfipModule {}
