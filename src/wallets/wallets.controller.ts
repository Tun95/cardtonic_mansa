import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { WalletResponseDto } from './dto/wallet-response.dto';
import { WalletsService } from './wallets.service';

@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a wallet from an email address and/or mobile number' })
  @ApiCreatedResponse({ type: WalletResponseDto })
  @ApiConflictResponse({ description: 'A wallet already exists for this email or phone' })
  create(@Body() dto: CreateWalletDto): Promise<WalletResponseDto> {
    return this.wallets.create(dto);
  }

  @Get(':walletId')
  @ApiOperation({ summary: 'Get all balances plus the total USD equivalent' })
  @ApiOkResponse({ type: WalletResponseDto })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  get(@Param('walletId', ParseUUIDPipe) walletId: string): Promise<WalletResponseDto> {
    return this.wallets.get(walletId);
  }
}
