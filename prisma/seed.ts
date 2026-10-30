import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedWallet = { email: string; deposits: Record<string, string> };

const WALLETS: SeedWallet[] = [
  { email: 'ada@example.com', deposits: { cNGN: '500000', USDx: '100' } },
  { email: 'kwame@example.com', deposits: { cGHS: '2000', EURx: '50' } },
];

const CURRENCIES = ['cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx'] as const;

async function main(): Promise<void> {
  for (const seed of WALLETS) {
    const existing = await prisma.wallet.findUnique({ where: { email: seed.email } });
    if (existing) {
      console.log(`seed: ${seed.email} already exists (${existing.id})`);
      continue;
    }
    const wallet = await prisma.$transaction(async (tx) => {
      const created = await tx.wallet.create({
        data: {
          email: seed.email,
          balances: { create: CURRENCIES.map((currency) => ({ currency })) },
        },
      });
      for (const [currency, amount] of Object.entries(seed.deposits)) {
        const c = currency as (typeof CURRENCIES)[number];
        await tx.balance.update({
          where: { walletId_currency: { walletId: created.id, currency: c } },
          data: { amount: { increment: amount } },
        });
        await tx.transaction.create({
          data: {
            type: 'DEPOSIT',
            receiverWalletId: created.id,
            sourceCurrency: c,
            sourceAmount: amount,
            destCurrency: c,
            destAmount: amount,
            rate: '1',
          },
        });
      }
      return created;
    });
    console.log(`seed: created ${seed.email} (${wallet.id})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
