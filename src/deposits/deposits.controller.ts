import { Body, Controller, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiIdempotent,
  IdempotencyKeyHeader,
  applyReplay,
} from '../common/decorators/idempotency.decorators';
import { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { DepositsService } from './deposits.service';
import { DepositDto } from './dto/deposit.dto';

@ApiTags('Deposits')
@Controller('wallets/:walletId/deposits')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post()
  @ApiOperation({ summary: 'Simulate a deposit - the balance is credited immediately' })
  @ApiIdempotent()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  async create(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Body() dto: DepositDto,
    @IdempotencyKeyHeader() key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionResponseDto> {
    return applyReplay(res, await this.deposits.deposit(walletId, dto, key));
  }
}
