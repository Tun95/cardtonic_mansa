import { ApiProperty } from '@nestjs/swagger';
import {
  CURRENCIES,
  CurrencyCode,
  RateSourceValue,
  TRANSACTION_TYPES,
  TransactionTypeValue,
} from '../../common/currencies';

export class TransactionResponseDto {
  @ApiProperty({ example: '0b6f8a52-3b1c-4c52-9a43-0e1c2a8f6d11' }) id!: string;
  @ApiProperty({ enum: TRANSACTION_TYPES }) type!: TransactionTypeValue;
  @ApiProperty({ type: String, nullable: true, description: 'null for deposits' })
  senderWalletId!: string | null;
  @ApiProperty({ type: String, nullable: true }) receiverWalletId!: string | null;
  @ApiProperty({ enum: CURRENCIES }) sourceCurrency!: CurrencyCode;
  @ApiProperty({ example: '1500.00000000' }) sourceAmount!: string;
  @ApiProperty({ enum: CURRENCIES }) destCurrency!: CurrencyCode;
  @ApiProperty({ example: '1.00000000' }) destAmount!: string;
  @ApiProperty({ example: '0.000666666666666667', description: '1 source = rate dest' })
  rate!: string;
  @ApiProperty({ enum: ['LIVE', 'STALE', 'FIXED'], nullable: true, type: String })
  rateSource!: RateSourceValue | null;
  @ApiProperty({ example: '2026-10-29T10:15:00.000Z' }) createdAt!: string;
}

export type Direction = 'credit' | 'swap' | 'sent' | 'received';

export class WalletTransactionDto extends TransactionResponseDto {
  @ApiProperty({
    enum: ['credit', 'swap', 'sent', 'received'],
    description: 'Perspective of the wallet whose history is being read',
  })
  direction!: Direction;
}

export class PageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class PaginatedTransactionsDto {
  @ApiProperty({ type: [WalletTransactionDto] }) data!: WalletTransactionDto[];
  @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;
}
