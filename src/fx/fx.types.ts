import { CurrencyCode, RateSourceValue } from '../common/currencies';
import { Dec } from '../common/money';

/** Units of each currency per 1 USD, plus provenance. */
export interface FxSnapshot {
  perUsd: Record<CurrencyCode, Dec>;
  source: RateSourceValue;
  refreshedAt: Date;
}

export interface FxQuote {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: Dec;
  source: RateSourceValue;
  refreshedAt: Date;
}
