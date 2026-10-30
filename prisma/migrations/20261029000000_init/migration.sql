-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'SWAP', 'TRANSFER');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('LIVE', 'STALE', 'FIXED');

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Balance" (
    "walletId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("walletId","currency")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "senderWalletId" TEXT,
    "receiverWalletId" TEXT,
    "sourceCurrency" "Currency" NOT NULL,
    "sourceAmount" DECIMAL(38,8) NOT NULL,
    "destCurrency" "Currency" NOT NULL,
    "destAmount" DECIMAL(38,8) NOT NULL,
    "rate" DECIMAL(38,18) NOT NULL,
    "rateSource" "RateSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "currency" "Currency" NOT NULL,
    "perUsd" DECIMAL(38,18) NOT NULL,
    "source" "RateSource" NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("currency")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_email_key" ON "Wallet"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_phone_key" ON "Wallet"("phone");

-- CreateIndex
CREATE INDEX "Transaction_senderWalletId_createdAt_idx" ON "Transaction"("senderWalletId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Transaction_receiverWalletId_createdAt_idx" ON "Transaction"("receiverWalletId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_senderWalletId_fkey" FOREIGN KEY ("senderWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_receiverWalletId_fkey" FOREIGN KEY ("receiverWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: invariants Prisma cannot express in schema.prisma
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amounts_positive" CHECK ("sourceAmount" > 0 AND "destAmount" > 0 AND "rate" > 0);
