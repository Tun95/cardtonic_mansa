import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  CURRENCIES,
  CurrencyCode,
  TRANSACTION_TYPES,
  TransactionTypeValue,
} from '../../common/currencies';

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({ enum: TRANSACTION_TYPES })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(TRANSACTION_TYPES)
  type?: TransactionTypeValue;

  @ApiPropertyOptional({
    enum: CURRENCIES,
    description: 'Matches transactions where this currency is the source OR the destination',
  })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: CurrencyCode;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
