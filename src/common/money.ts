import Decimal from 'decimal.js';

/**
 * Money maths never touches JS floats. We use an isolated decimal.js clone with
 * high precision and banker's rounding so we don't mutate Prisma's shared Decimal config.
 */
export const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_EVEN });
export type Dec = Decimal;

export const AMOUNT_DP = 8;
export const RATE_DP = 18;

type DecimalLike = string | number | { toString(): string };

export const toDec = (v: DecimalLike): Dec => new D(typeof v === 'object' ? v.toString() : v);

export const roundAmount = (d: Dec): Dec => d.toDecimalPlaces(AMOUNT_DP, Decimal.ROUND_HALF_EVEN);
export const roundRate = (d: Dec): Dec => d.toDecimalPlaces(RATE_DP, Decimal.ROUND_HALF_EVEN);

/** Fixed 8dp string for amounts (what we store and return). */
export const fmtAmount = (v: DecimalLike): string => toDec(v).toFixed(AMOUNT_DP);
/** Plain (non-exponential) string for rates, without trailing zeros. */
export const fmtRate = (v: DecimalLike): string => toDec(v).toFixed();
