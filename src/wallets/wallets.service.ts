import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CURRENCIES, CurrencyCode } from '../common/currencies';
import { D, fmtAmount, roundAmount, toDec } from '../common/money';
import { FxService } from '../fx/fx.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { WalletResponseDto } from './dto/wallet-response.dto';

type WalletWithBalances = Prisma.WalletGetPayload<{ include: { balances: true } }>;

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
  ) {}

  async create(dto: CreateWalletDto): Promise<WalletResponseDto> {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException({
        code: 'IDENTIFIER_REQUIRED',
        message: 'Provide an email address or a mobile number',
      });
    }

    let wallet: WalletWithBalances;
    try {
      wallet = await this.prisma.wallet.create({
        data: {
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          balances: { create: CURRENCIES.map((currency) => ({ currency })) },
        },
        include: { balances: true },
      });
    } catch (err) {
      // The unique indexes are the source of truth, so this is race-free.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'WALLET_ALREADY_EXISTS',
          message: 'A wallet already exists for this email or mobile number',
        });
      }
      throw err;
    }
    return this.toResponse(wallet);
  }

  async get(id: string): Promise<WalletResponseDto> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      include: { balances: true },
    });
    if (!wallet)
      throw new NotFoundException({ code: 'WALLET_NOT_FOUND', message: 'Wallet not found' });
    return this.toResponse(wallet);
  }

  private async toResponse(wallet: WalletWithBalances): Promise<WalletResponseDto> {
    const snapshot = await this.fx.getSnapshot();
    const byCurrency = new Map(wallet.balances.map((b) => [b.currency as CurrencyCode, b.amount]));

    let totalUsd = new D(0);
    const balances = CURRENCIES.map((currency) => {
      const amount = toDec(byCurrency.get(currency) ?? 0);
      totalUsd = totalUsd.plus(this.fx.toUsd(snapshot, currency, amount));
      return { currency, amount: fmtAmount(amount) };
    });

    return {
      id: wallet.id,
      email: wallet.email,
      phone: wallet.phone,
      createdAt: wallet.createdAt.toISOString(),
      balances,
      totalUsd: fmtAmount(roundAmount(totalUsd)),
      fx: { source: snapshot.source, refreshedAt: snapshot.refreshedAt.toISOString() },
    };
  }
}
