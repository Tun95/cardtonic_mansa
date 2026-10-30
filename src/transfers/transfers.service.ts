import { BadRequestException, Injectable } from '@nestjs/common';
import { parsePositiveAmount } from '../common/amount';
import { convertAmount } from '../common/convert';
import { D, fmtAmount, fmtRate } from '../common/money';
import { FxService } from '../fx/fx.service';
import { hashRequest } from '../idempotency/idempotency.hash';
import { IdempotencyService, IdempotentResult } from '../idempotency/idempotency.service';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { serializeTransaction } from '../transactions/transaction.serializer';
import { TransferDto } from './dto/transfer.dto';

@Injectable()
export class TransfersService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly fx: FxService,
  ) {}

  async transfer(dto: TransferDto, key: string): Promise<IdempotentResult<TransactionResponseDto>> {
    if (dto.fromWalletId === dto.toWalletId) {
      throw new BadRequestException({
        code: 'SAME_WALLET',
        message:
          'Sender and receiver must be different wallets (use a swap to convert inside one wallet)',
      });
    }
    const sourceCurrency = dto.currency;
    const destCurrency = dto.toCurrency ?? dto.currency;
    const amount = parsePositiveAmount(dto.amount);
    const hash = hashRequest({
      op: 'transfer',
      from: dto.fromWalletId,
      to: dto.toWalletId,
      currency: sourceCurrency,
      toCurrency: destCurrency,
      amount: fmtAmount(amount),
    });

    // Same currency: rate is exactly 1 and no provider is involved.
    const crossCurrency = sourceCurrency !== destCurrency;
    const quote = crossCurrency ? await this.fx.getRate(sourceCurrency, destCurrency) : null;
    const rate = quote?.rate ?? new D(1);
    const destAmount = crossCurrency ? convertAmount(amount, rate) : amount;

    return this.idempotency.execute(`transfer:${dto.fromWalletId}`, key, hash, async (tx) => {
      await this.ledger.lock(tx, [
        { walletId: dto.fromWalletId, currency: sourceCurrency },
        { walletId: dto.toWalletId, currency: destCurrency },
      ]);
      await this.ledger.debit(tx, dto.fromWalletId, sourceCurrency, amount);
      await this.ledger.credit(tx, dto.toWalletId, destCurrency, destAmount);
      const entry = await this.ledger.record(tx, {
        type: 'TRANSFER',
        senderWalletId: dto.fromWalletId,
        receiverWalletId: dto.toWalletId,
        sourceCurrency,
        sourceAmount: amount,
        destCurrency,
        destAmount,
        rate: fmtRate(rate),
        rateSource: quote?.source ?? null,
      });
      return serializeTransaction(entry);
    });
  }
}
