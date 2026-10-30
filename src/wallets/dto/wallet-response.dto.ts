import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, CurrencyCode, RateSourceValue } from '../../common/currencies';

export class BalanceDto {
  @ApiProperty({ enum: CURRENCIES }) currency!: CurrencyCode;
  @ApiProperty({ example: '500000.00000000' }) amount!: string;
}

export class WalletFxInfoDto {
  @ApiProperty({ enum: ['LIVE', 'STALE', 'FIXED'] }) source!: RateSourceValue;
  @ApiProperty({ example: '2026-10-29T10:15:00.000Z' }) refreshedAt!: string;
}

export class WalletResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [BalanceDto] }) balances!: BalanceDto[];
  @ApiProperty({
    example: '433.33333333',
    description: 'Total value of all balances in USD at the current FX snapshot',
  })
  totalUsd!: string;
  @ApiProperty({ type: WalletFxInfoDto, description: 'FX snapshot used for totalUsd' })
  fx!: WalletFxInfoDto;
}
