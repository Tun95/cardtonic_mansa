import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiIdempotent,
  IdempotencyKeyHeader,
  applyReplay,
} from '../common/decorators/idempotency.decorators';
import { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { TransferDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('Transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ApiOperation({
    summary: 'Send funds to another wallet, in the same or a different currency (auto-converted)',
  })
  @ApiIdempotent()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'Sender or receiver wallet not found' })
  async create(
    @Body() dto: TransferDto,
    @IdempotencyKeyHeader() key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionResponseDto> {
    return applyReplay(res, await this.transfers.transfer(dto, key));
  }
}
