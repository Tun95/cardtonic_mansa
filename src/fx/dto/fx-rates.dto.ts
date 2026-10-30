import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CURRENCIES, CurrencyCode, RateSourceValue } from '../../common/currencies';

export class FxRatesQueryDto {
  @ApiPropertyOptional({ enum: CURRENCIES, description: 'Only return rates FROM this currency' })
  @IsOptional()
  @IsIn(CURRENCIES)
  base?: CurrencyCode;
}

export class FxRateDto {
  @ApiProperty({ enum: CURRENCIES }) from!: CurrencyCode;
  @ApiProperty({ enum: CURRENCIES }) to!: CurrencyCode;
  @ApiProperty({ example: '0.000666666666666667', description: '1 `from` = `rate` `to`' })
  rate!: string;
  @ApiProperty({ enum: ['LIVE', 'STALE', 'FIXED'] }) source!: RateSourceValue;
  @ApiProperty({ example: '2026-10-29T10:15:00.000Z' }) refreshedAt!: string;
}

export class FxRatesResponseDto {
  @ApiProperty({ enum: ['LIVE', 'STALE', 'FIXED'] }) source!: RateSourceValue;
  @ApiProperty({ example: '2026-10-29T10:15:00.000Z' }) refreshedAt!: string;
  @ApiProperty({ type: [FxRateDto] }) rates!: FxRateDto[];
}
