import { Global, Module } from '@nestjs/common';
import { TreasuryOperationsService } from './services/treasury-operations.service';
import { TreasuryRegistersService } from './services/treasury-registers.service';
import { TreasurySummaryService } from './services/treasury-summary.service';
import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';

@Global()
@Module({
  controllers: [TreasuryController],
  providers: [
    TreasurySummaryService,
    TreasuryRegistersService,
    TreasuryOperationsService,
    TreasuryService,
  ],
  exports: [
    TreasurySummaryService,
    TreasuryRegistersService,
    TreasuryOperationsService,
    TreasuryService,
  ],
})
export class TreasuryModule {}
