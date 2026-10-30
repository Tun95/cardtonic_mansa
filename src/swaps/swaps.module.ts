import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SwapsController } from './swaps.controller';
import { SwapsService } from './swaps.service';

@Module({
  imports: [LedgerModule, FxModule],
  controllers: [SwapsController],
  providers: [SwapsService],
})
export class SwapsModule {}
