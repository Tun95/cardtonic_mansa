import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DepositsModule } from './deposits/deposits.module';
import { FxModule } from './fx/fx.module';
import { HealthController } from './health/health.controller';
import { LedgerModule } from './ledger/ledger.module';
import { PrismaModule } from './prisma/prisma.module';
import { SwapsModule } from './swaps/swaps.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TransfersModule } from './transfers/transfers.module';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    FxModule,
    LedgerModule,
    WalletsModule,
    DepositsModule,
    SwapsModule,
    TransfersModule,
    TransactionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
