import { BadRequestException, Injectable } from '@nestjs/common';
import { parsePositiveAmount } from '../common/amount';
import { convertAmount } from '../common/convert';
import { fmtAmount, fmtRate } from '../common/money';
import { FxService } from '../fx/fx.service';
import { hashRequest } from '../idempotency/idempotency.hash';
import { IdempotencyService, IdempotentResult } from '../idempotency/idempotency.service';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { serializeTransaction } from '../transactions/transaction.serializer';
import { SwapDto } from './dto/swap.dto';

@Injectable()
export class SwapsService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly fx: FxService,
  ) {}

  async swap(
    walletId: string,
    dto: SwapDto,
    key: string,
  ): Promise<IdempotentResult<TransactionResponseDto>> {
    if (dto.from === dto.to) {
      throw new BadRequestException({
        code: 'SAME_CURRENCY',
        message: '`from` and `to` must be different currencies',
      });
    }
    const amount = parsePositiveAmount(dto.amount);
    const hash = hashRequest({
      op: 'swap',
      walletId,
      from: dto.from,
      to: dto.to,
      amount: fmtAmount(amount),
    });

    // The FX lookup happens before the DB transaction so a slow provider never holds row locks.
    const quote = await this.fx.getRate(dto.from, dto.to);
    const destAmount = convertAmount(amount, quote.rate);

    return this.idempotency.execute(`swap:${walletId}`, key, hash, async (tx) => {
      await this.ledger.lock(tx, [
        { walletId, currency: dto.from },
        { walletId, currency: dto.to },
      ]);
      await this.ledger.debit(tx, walletId, dto.from, amount);
      await this.ledger.credit(tx, walletId, dto.to, destAmount);
      const entry = await this.ledger.record(tx, {
        type: 'SWAP',
        senderWalletId: walletId,
        receiverWalletId: walletId,
        sourceCurrency: dto.from,
        sourceAmount: amount,
        destCurrency: dto.to,
        destAmount,
        rate: fmtRate(quote.rate),
        rateSource: quote.source,
      });
      return serializeTransaction(entry);
    });
  }
}
