import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [LedgerModule, FxModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
