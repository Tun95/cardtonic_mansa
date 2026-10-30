import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import { CurrencyCode } from '../common/currencies';
import { Dec, fmtAmount } from '../common/money';

export interface BalanceTarget {
  walletId: string;
  currency: CurrencyCode;
}

export interface LedgerEntryInput {
  type: 'DEPOSIT' | 'SWAP' | 'TRANSFER';
  senderWalletId: string | null;
  receiverWalletId: string | null;
  sourceCurrency: CurrencyCode;
  sourceAmount: Dec;
  destCurrency: CurrencyCode;
  destAmount: Dec;
  rate: string;
  rateSource: 'LIVE' | 'STALE' | 'FIXED' | null;
}

/**
 * Low-level balance primitives. Every method takes the caller's transaction client, so the
 * lock, the balance change, the ledger row and the idempotency key all commit atomically.
 */
@Injectable()
export class LedgerService {
  /**
   * Row-locks the given (wallet, currency) balances in a single global order
   * (walletId, then currency). Because every operation locks in the same order, two opposite
   * transfers (A->B and B->A) can never deadlock. Also proves the wallet exists (404 otherwise).
   */
  async lock(tx: Prisma.TransactionClient, targets: BalanceTarget[]): Promise<void> {
    const unique = new Map(targets.map((t) => [`${t.walletId}:${t.currency}`, t]));
    const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    const ordered = [...unique.values()].sort(
      (a, b) => cmp(a.walletId, b.walletId) || cmp(a.currency, b.currency),
    );

    for (const { walletId, currency } of ordered) {
      const rows = await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM "Balance"
        WHERE "walletId" = ${walletId} AND "currency" = ${currency}::"Currency"
        FOR UPDATE`;
      if (rows.length === 0) {
        throw new NotFoundException({
          code: 'WALLET_NOT_FOUND',
          message: `Wallet ${walletId} not found`,
        });
      }
    }
  }

  /** Guarded debit: the WHERE clause makes an overdraft impossible even without the lock. */
  async debit(
    tx: Prisma.TransactionClient,
    walletId: string,
    currency: CurrencyCode,
    amount: Dec,
  ): Promise<void> {
    const value = fmtAmount(amount);
    const updated = await tx.$executeRaw`
      UPDATE "Balance"
      SET "amount" = "amount" - ${value}::numeric, "updatedAt" = now()
      WHERE "walletId" = ${walletId}
        AND "currency" = ${currency}::"Currency"
        AND "amount" >= ${value}::numeric`;
    if (updated === 0) {
      throw new UnprocessableEntityException({
        code: 'INSUFFICIENT_FUNDS',
        message: `Insufficient ${currency} balance for amount ${value}`,
      });
    }
  }

  async credit(
    tx: Prisma.TransactionClient,
    walletId: string,
    currency: CurrencyCode,
    amount: Dec,
  ): Promise<void> {
    const value = fmtAmount(amount);
    await tx.$executeRaw`
      UPDATE "Balance"
      SET "amount" = "amount" + ${value}::numeric, "updatedAt" = now()
      WHERE "walletId" = ${walletId} AND "currency" = ${currency}::"Currency"`;
  }

  record(tx: Prisma.TransactionClient, entry: LedgerEntryInput): Promise<Transaction> {
    return tx.transaction.create({
      data: {
        type: entry.type,
        senderWalletId: entry.senderWalletId,
        receiverWalletId: entry.receiverWalletId,
        sourceCurrency: entry.sourceCurrency,
        sourceAmount: fmtAmount(entry.sourceAmount),
        destCurrency: entry.destCurrency,
        destAmount: fmtAmount(entry.destAmount),
        rate: entry.rate,
        rateSource: entry.rateSource,
      },
    });
  }
}
