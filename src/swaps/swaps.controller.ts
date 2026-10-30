import { Body, Controller, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiIdempotent,
  IdempotencyKeyHeader,
  applyReplay,
} from '../common/decorators/idempotency.decorators';
import { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { SwapDto } from './dto/swap.dto';
import { SwapsService } from './swaps.service';

@ApiTags('Swaps')
@Controller('wallets/:walletId/swaps')
export class SwapsController {
  constructor(private readonly swaps: SwapsService) {}

  @Post()
  @ApiOperation({
    summary: 'Swap one stablecoin for another inside the same wallet at the current FX rate',
  })
  @ApiIdempotent()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  async create(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Body() dto: SwapDto,
    @IdempotencyKeyHeader() key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionResponseDto> {
    return applyReplay(res, await this.swaps.swap(walletId, dto, key));
  }
}
