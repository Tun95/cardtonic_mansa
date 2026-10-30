import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CURRENCIES, CurrencyCode } from '../../common/currencies';
import { IsAmount } from '../../common/decorators/amount.decorator';

export class SwapDto {
  @ApiProperty({ enum: CURRENCIES, example: 'cNGN', description: 'Currency debited' })
  @IsIn(CURRENCIES)
  from!: CurrencyCode;

  @ApiProperty({ enum: CURRENCIES, example: 'USDx', description: 'Currency credited' })
  @IsIn(CURRENCIES)
  to!: CurrencyCode;

  @IsAmount('Amount of `from` to swap, as a positive decimal string')
  amount!: string;
}
