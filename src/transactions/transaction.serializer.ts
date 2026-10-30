import { Transaction } from '@prisma/client';
import { CurrencyCode } from '../common/currencies';
import { fmtAmount, fmtRate } from '../common/money';
import {
  Direction,
  TransactionResponseDto,
  WalletTransactionDto,
} from './dto/transaction-response.dto';

/** Decimals leave the API as strings, dates as ISO-8601 - the same shape is stored for idempotent replays. */
export function serializeTransaction(t: Transaction): TransactionResponseDto {
  return {
    id: t.id,
    type: t.type,
    senderWalletId: t.senderWalletId,
    receiverWalletId: t.receiverWalletId,
    sourceCurrency: t.sourceCurrency as CurrencyCode,
    sourceAmount: fmtAmount(t.sourceAmount),
    destCurrency: t.destCurrency as CurrencyCode,
    destAmount: fmtAmount(t.destAmount),
    rate: fmtRate(t.rate),
    rateSource: t.rateSource,
    createdAt: t.createdAt.toISOString(),
  };
}

export function directionFor(t: Transaction, walletId: string): Direction {
  if (t.type === 'DEPOSIT') return 'credit';
  if (t.type === 'SWAP') return 'swap';
  return t.senderWalletId === walletId ? 'sent' : 'received';
}

export function serializeForWallet(t: Transaction, walletId: string): WalletTransactionDto {
  return { ...serializeTransaction(t), direction: directionFor(t, walletId) };
}
