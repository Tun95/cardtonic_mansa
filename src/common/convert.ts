import { UnprocessableEntityException } from '@nestjs/common';
import { Dec, fmtAmount, roundAmount } from './money';

/** source * rate, rounded half-even to 8dp. Rejects conversions that round to zero. */
export function convertAmount(source: Dec, rate: Dec): Dec {
  const dest = roundAmount(source.mul(rate));
  if (!dest.gt(0)) {
    throw new UnprocessableEntityException({
      code: 'AMOUNT_TOO_SMALL',
      message: `${fmtAmount(source)} converts to zero at the current rate`,
    });
  }
  return dest;
}
