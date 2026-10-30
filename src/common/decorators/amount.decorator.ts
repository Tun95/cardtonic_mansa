import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/** Positive decimal string, max 15 integer digits and 8 decimals (fits NUMERIC(38,8) comfortably). */
export const AMOUNT_REGEX = /^\d{1,15}(\.\d{1,8})?$/;

export function IsAmount(
  description = 'Positive decimal amount, sent as a string',
): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ type: String, example: '100.50', description }),
    Transform(({ value }) => (typeof value === 'number' ? String(value) : value)),
    Matches(AMOUNT_REGEX, {
      message:
        'amount must be a decimal string with at most 8 decimal places and 15 integer digits',
    }),
  );
}
