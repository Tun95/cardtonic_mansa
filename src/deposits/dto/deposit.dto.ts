import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CURRENCIES, CurrencyCode } from '../../common/currencies';
import { IsAmount } from '../../common/decorators/amount.decorator';

export class DepositDto {
  @ApiProperty({ enum: CURRENCIES, example: 'cNGN' })
  @IsIn(CURRENCIES)
  currency!: CurrencyCode;

  @IsAmount('Amount to deposit, as a positive decimal string')
  amount!: string;
}
