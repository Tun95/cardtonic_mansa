export const CURRENCIES = ['cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const TRANSACTION_TYPES = ['DEPOSIT', 'SWAP', 'TRANSFER'] as const;
export type TransactionTypeValue = (typeof TRANSACTION_TYPES)[number];

export type RateSourceValue = 'LIVE' | 'STALE' | 'FIXED';
