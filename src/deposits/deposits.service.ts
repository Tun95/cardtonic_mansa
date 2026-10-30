import { Injectable } from '@nestjs/common';
import { parsePositiveAmount } from '../common/amount';
import { fmtAmount } from '../common/money';
import { hashRequest } from '../idempotency/idempotency.hash';
import { IdempotencyService, IdempotentResult } from '../idempotency/idempotency.service';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { serializeTransaction } from '../transactions/transaction.serializer';
import { DepositDto } from './dto/deposit.dto';

@Injectable()
export class DepositsService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  deposit(
    walletId: string,
    dto: DepositDto,
    key: string,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    const amount = parsePositiveAmount(dto.amount);
    const hash = hashRequest({
      op: 'deposit',
      walletId,
      currency: dto.currency,
      amount: fmtAmount(amount),
    });

    return this.idempotency.execute(`deposit:${walletId}`, key, hash, async (tx) => {
      await this.ledger.lock(tx, [{ walletId, currency: dto.currency }]);
      await this.ledger.credit(tx, walletId, dto.currency, amount);
      const entry = await this.ledger.record(tx, {
        type: 'DEPOSIT',
        senderWalletId: null,
        receiverWalletId: walletId,
        sourceCurrency: dto.currency,
        sourceAmount: amount,
        destCurrency: dto.currency,
        destAmount: amount,
        rate: '1',
        rateSource: null,
      });
      return serializeTransaction(entry);
    });
  }
}
