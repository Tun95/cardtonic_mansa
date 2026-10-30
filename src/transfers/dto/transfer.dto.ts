import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CURRENCIES, CurrencyCode } from '../../common/currencies';
import { IsAmount } from '../../common/decorators/amount.decorator';

export class TransferDto {
  @ApiProperty({ description: 'Sender wallet id' })
  @IsUUID()
  fromWalletId!: string;

  @ApiProperty({ description: 'Receiver wallet id' })
  @IsUUID()
  toWalletId!: string;

  @ApiProperty({
    enum: CURRENCIES,
    example: 'cNGN',
    description: 'Currency debited from the sender',
  })
  @IsIn(CURRENCIES)
  currency!: CurrencyCode;

  @IsAmount('Amount of `currency` to send, as a positive decimal string')
  amount!: string;

  @ApiPropertyOptional({
    enum: CURRENCIES,
    description:
      'Currency credited to the receiver. Defaults to `currency`; when different, the amount is converted at the current FX rate.',
  })
  @IsOptional()
  @IsIn(CURRENCIES)
  toCurrency?: CurrencyCode;
}
