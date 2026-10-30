import { CurrencyCode } from '../common/currencies';

/** Each mock stablecoin is pegged 1:1 to a fiat currency. */
export const PEGGED_FIAT: Record<CurrencyCode, string> = {
  cNGN: 'NGN',
  cGHS: 'GHS',
  cXAF: 'XAF',
  USDx: 'USD',
  EURx: 'EUR',
};

/**
 * Fixed fallback table: units of fiat per 1 USD. Approximate and for sandbox use only.
 * Used when FX_PROVIDER=fixed, or when the live provider has failed and nothing was ever stored.
 */
export const FIXED_PER_USD: Record<CurrencyCode, string> = {
  cNGN: '1500',
  cGHS: '12.5',
  cXAF: '600',
  USDx: '1',
  EURx: '0.92',
};

export const FIXED_RATES_AS_OF = new Date('2026-10-01T00:00:00.000Z');
