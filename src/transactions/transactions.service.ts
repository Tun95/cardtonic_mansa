import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListTransactionsQueryDto } from './dto/list-transactions.dto';
import { PaginatedTransactionsDto, TransactionResponseDto } from './dto/transaction-response.dto';
import { serializeForWallet, serializeTransaction } from './transaction.serializer';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForWallet(
    walletId: string,
    query: ListTransactionsQueryDto,
  ): Promise<PaginatedTransactionsDto> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true },
    });
    if (!wallet)
      throw new NotFoundException({ code: 'WALLET_NOT_FOUND', message: 'Wallet not found' });

    const { type, currency, page, limit } = query;
    const and: Prisma.TransactionWhereInput[] = [
      { OR: [{ senderWalletId: walletId }, { receiverWalletId: walletId }] },
    ];
    if (type) and.push({ type });
    if (currency) and.push({ OR: [{ sourceCurrency: currency }, { destCurrency: currency }] });
    const where: Prisma.TransactionWhereInput = { AND: and };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((t) => serializeForWallet(t, walletId)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string): Promise<TransactionResponseDto> {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      throw new NotFoundException({
        code: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found',
      });
    }
    return serializeTransaction(tx);
  }
}
