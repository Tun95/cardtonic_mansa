import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListTransactionsQueryDto } from './dto/list-transactions.dto';
import { PaginatedTransactionsDto, TransactionResponseDto } from './dto/transaction-response.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@Controller()
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get('wallets/:walletId/transactions')
  @ApiOperation({
    summary:
      "List a wallet's transactions (deposits, swaps, transfers sent and received), newest first",
  })
  @ApiOkResponse({ type: PaginatedTransactionsDto })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  list(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<PaginatedTransactionsDto> {
    return this.transactions.listForWallet(walletId, query);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Fetch a single transaction by id' })
  @ApiOkResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TransactionResponseDto> {
    return this.transactions.getById(id);
  }
}
