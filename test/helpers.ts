import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class TestApi {
  constructor(
    readonly app: INestApplication,
    readonly prisma: PrismaService,
  ) {}

  static async create(): Promise<TestApi> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    return new TestApi(app, app.get(PrismaService));
  }

  async reset(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'TRUNCATE "IdempotencyKey", "Transaction", "Balance", "Wallet" CASCADE',
    );
  }

  async close(): Promise<void> {
    await this.app.close();
  }

  get http(): ReturnType<typeof request> {
    return request(this.app.getHttpServer());
  }

  async createWallet(email = `${randomUUID()}@example.com`): Promise<string> {
    const res = await this.http.post('/wallets').send({ email }).expect(201);
    return res.body.id as string;
  }

  deposit(walletId: string, currency: string, amount: string, key: string = randomUUID()) {
    return this.http
      .post(`/wallets/${walletId}/deposits`)
      .set('Idempotency-Key', key)
      .send({ currency, amount });
  }

  swap(walletId: string, from: string, to: string, amount: string, key: string = randomUUID()) {
    return this.http
      .post(`/wallets/${walletId}/swaps`)
      .set('Idempotency-Key', key)
      .send({ from, to, amount });
  }

  transfer(
    body: {
      fromWalletId: string;
      toWalletId: string;
      currency: string;
      amount: string;
      toCurrency?: string;
    },
    key: string = randomUUID(),
  ) {
    return this.http.post('/transfers').set('Idempotency-Key', key).send(body);
  }

  async balances(walletId: string): Promise<Record<string, string>> {
    const res = await this.http.get(`/wallets/${walletId}`).expect(200);
    return Object.fromEntries(
      (res.body.balances as { currency: string; amount: string }[]).map((b) => [
        b.currency,
        b.amount,
      ]),
    );
  }
}
