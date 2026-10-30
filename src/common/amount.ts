import { BadRequestException } from '@nestjs/common';
import { Dec, toDec } from './money';

/** Parses an already-regex-validated amount string and rejects zero. */
export function parsePositiveAmount(value: string): Dec {
  const amount = toDec(value);
  if (!amount.gt(0)) {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: 'amount must be greater than zero',
    });
  }
  return amount;
}
