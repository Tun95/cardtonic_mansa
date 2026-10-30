# Mansa — a stablecoin FX & remittance sandbox

> Named after Mansa Musa, the king who moved gold across borders. Mansa is a REST API that simulates
> a cross-border payment platform: multi-currency wallets holding African and international
> stablecoins (**cNGN, cGHS, cXAF, USDx, EURx**), instant deposits, FX swaps, and cross-currency
> transfers — with the money handling done properly.

Built for the Cardtonic Backend Assessment, *Operation Borderless*. There is no frontend: the API,
the data model and the tests are the product.

## Contents

1. [Stack and why](#stack-and-why)
2. [Run it](#run-it)
3. [Run the tests](#run-the-tests)
4. [API walkthrough](#api-walkthrough)
5. [Data model](#data-model)
6. [How the hard parts are handled](#how-the-hard-parts-are-handled) — money precision, idempotency, concurrency, FX failures
7. [Assumptions](#assumptions)
8. [Known limitations and what I left out](#known-limitations-and-what-i-left-out)
9. [What I would do with more time](#what-i-would-do-with-more-time)

## Stack and why

| Area | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 LTS, TypeScript (`strict: true`) | Required. `noImplicitOverride` is also on. |
| Framework | **NestJS 10** | Explicitly allowed by the brief. Modules, DI and DTO validation keep each capability (wallets, deposits, swaps, transfers, history, FX) isolated and unit-testable. |
| Database | **PostgreSQL 16** | See below. |
| ORM | Prisma 5 | Typed queries and versioned SQL migrations; raw SQL is used only where row locks and guarded updates matter. |
| Money maths | `decimal.js` (string amounts over the wire) | No floating point anywhere. |
| Cache / queue | **None** (deliberate) | In-process TTL cache for FX rates is enough. Redis/BullMQ would add moving parts without solving a problem this API has. |
| Tests | Jest + Supertest | Unit tests plus real-database e2e tests. |
| Docs | Swagger UI at `/docs`, committed `openapi.json` | |
| Tooling | Yarn, ESLint, Prettier, GitHub Actions CI, Docker + Compose | |

### Why PostgreSQL

A wallet ledger is the textbook case for a relational, transactional store:

* **ACID multi-row transactions** — a transfer debits one row, credits another and writes a ledger
  entry; all of it commits or none of it does.
* **Row-level locks** (`SELECT … FOR UPDATE`) give us a simple, provable concurrency story.
* **`NUMERIC(38,8)`** stores exact decimals, and a `CHECK (amount >= 0)` constraint makes a negative
  balance impossible even if application code had a bug.
* **Unique indexes** are race-free enforcement for "one wallet per email/phone" and for idempotency keys.

MongoDB could do this with multi-document transactions, but it would mean enforcing in code what
Postgres enforces in the schema.

## Run it

Requirements: Docker with Compose.

```bash
docker compose up --build
```

That starts Postgres and the API, applies migrations automatically, and seeds two demo wallets
(`ada@example.com`, `kwame@example.com`).

* API: http://localhost:3000
* Swagger UI: http://localhost:3000/docs
* Postgres (for local tooling): `localhost:5433`

Without Docker for the API (Node 20+ and a running Postgres, e.g. `docker compose up -d db`):

```bash
cp .env.example .env
yarn install          # also runs `prisma generate`
yarn prisma:deploy    # apply migrations
yarn seed             # optional demo data
yarn start:dev
```

Useful scripts: `yarn lint`, `yarn typecheck`, `yarn build`, `yarn openapi` (regenerates `openapi.json`
without needing a database).

The live FX provider is on by default. To run entirely offline with the built-in table, set
`FX_PROVIDER=fixed`.

## Run the tests

```bash
docker compose up -d db     # Postgres on localhost:5433
yarn install
yarn test                   # unit tests, then e2e tests
```

or entirely inside Docker:

```bash
docker compose run --rm api yarn test
```

* `yarn test:unit` — no database needed (money maths, hashing, FX service incl. every fallback path).
* `yarn test:e2e` — Supertest against a real Postgres, in an isolated schema named `test` inside the
  same database (`TEST_DATABASE_URL`), so dev data is never touched. Migrations are applied automatically.
  The e2e suite pins `FX_PROVIDER=fixed` so results are deterministic:
  1 USD = 1500 cNGN = 12.5 cGHS = 600 cXAF = 0.92 EURx.

What the suite proves (beyond happy paths): replayed idempotency keys credit exactly once, even when
fired concurrently; 10 parallel transfers against a balance that covers 3 yield exactly 3 successes
and a correct final balance; opposite-direction transfers don't deadlock; failed operations leave no
partial state; duplicate email/phone signups race to exactly one wallet.

## API walkthrough

All amounts are **decimal strings**. Errors share one shape:
`{ "statusCode": 422, "error": "Unprocessable Entity", "code": "INSUFFICIENT_FUNDS", "message": "…" }`.
Full schemas: `openapi.json` or `/docs`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/wallets` | Create a wallet from `email` and/or `phone` |
| `GET` | `/wallets/:walletId` | All balances + total USD equivalent |
| `POST` | `/wallets/:walletId/deposits` | Simulated deposit |
| `POST` | `/wallets/:walletId/swaps` | Swap one stablecoin for another inside the wallet |
| `POST` | `/transfers` | Send to another wallet, same or different currency |
| `GET` | `/wallets/:walletId/transactions` | History: newest first, `?type=&currency=&page=&limit=` |
| `GET` | `/transactions/:id` | One transaction |
| `GET` | `/fx/rates` | All pair rates (`?base=cNGN` to narrow) with refresh time |
| `GET` | `/health` | Liveness + DB check |

`POST` deposit/swap/transfer **require an `Idempotency-Key` header** (8–128 chars, e.g. a UUID).

### 1. Create a wallet

```bash
curl -s -X POST localhost:3000/wallets -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com"}'
```
```json
{
  "id": "7d0c6c1e-6f4a-4b8e-9a53-2f1d0a9c5b10",
  "email": "ada@example.com",
  "phone": null,
  "createdAt": "2026-10-29T10:15:00.000Z",
  "balances": [
    { "currency": "cNGN", "amount": "0.00000000" },
    { "currency": "cGHS", "amount": "0.00000000" },
    { "currency": "cXAF", "amount": "0.00000000" },
    { "currency": "USDx", "amount": "0.00000000" },
    { "currency": "EURx", "amount": "0.00000000" }
  ],
  "totalUsd": "0.00000000",
  "fx": { "source": "LIVE", "refreshedAt": "2026-10-29T10:15:00.000Z" }
}
```
A second wallet for the same email or number → `409 WALLET_ALREADY_EXISTS`. Emails are
lower-cased; phones are normalised to E.164 (`+234 801-234-5678` → `+2348012345678`).

### 2. Deposit

```bash
curl -s -X POST localhost:3000/wallets/$WALLET/deposits \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"currency":"cNGN","amount":"150000"}'
```
```json
{
  "id": "0b6f8a52-3b1c-4c52-9a43-0e1c2a8f6d11",
  "type": "DEPOSIT",
  "senderWalletId": null,
  "receiverWalletId": "7d0c6c1e-6f4a-4b8e-9a53-2f1d0a9c5b10",
  "sourceCurrency": "cNGN",
  "sourceAmount": "150000.00000000",
  "destCurrency": "cNGN",
  "destAmount": "150000.00000000",
  "rate": "1",
  "rateSource": null,
  "createdAt": "2026-10-29T10:15:30.000Z"
}
```

### 3. Swap (cNGN → USDx, inside one wallet)

```bash
curl -s -X POST localhost:3000/wallets/$WALLET/swaps \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"from":"cNGN","to":"USDx","amount":"1500"}'
```
```json
{
  "id": "5e1b…",
  "type": "SWAP",
  "senderWalletId": "7d0c…",
  "receiverWalletId": "7d0c…",
  "sourceCurrency": "cNGN",
  "sourceAmount": "1500.00000000",
  "destCurrency": "USDx",
  "destAmount": "1.00000000",
  "rate": "0.000666666666666667",
  "rateSource": "LIVE",
  "createdAt": "2026-10-29T10:16:00.000Z"
}
```
(Numbers shown at the fixed table's 1 USD = 1500 cNGN; with live rates you will see the market rate.)
Not enough balance → `422 INSUFFICIENT_FUNDS`, nothing changes.

### 4. Transfer (USDx → another wallet's EURx, converted automatically)

```bash
curl -s -X POST localhost:3000/transfers \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"fromWalletId":"7d0c…","toWalletId":"a91f…","currency":"USDx","toCurrency":"EURx","amount":"50"}'
```
```json
{
  "id": "c2d4…",
  "type": "TRANSFER",
  "senderWalletId": "7d0c…",
  "receiverWalletId": "a91f…",
  "sourceCurrency": "USDx",
  "sourceAmount": "50.00000000",
  "destCurrency": "EURx",
  "destAmount": "46.00000000",
  "rate": "0.92",
  "rateSource": "LIVE",
  "createdAt": "2026-10-29T10:17:00.000Z"
}
```
Omit `toCurrency` for a same-currency transfer (`rate` is exactly `1`).

### 5. History, single transaction, rates

```bash
curl -s "localhost:3000/wallets/$WALLET/transactions?type=TRANSFER&currency=USDx&page=1&limit=20"
```
```json
{
  "data": [
    { "id": "c2d4…", "type": "TRANSFER", "direction": "sent", "sourceCurrency": "USDx", "…": "…" }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```
`direction` is from the requested wallet's perspective: `credit` (deposit), `swap`, `sent`, `received`.
`currency` matches a transaction when it is either the source or the destination currency.

```bash
curl -s "localhost:3000/transactions/c2d4…"
curl -s "localhost:3000/fx/rates?base=cNGN"
```
```json
{
  "source": "LIVE",
  "refreshedAt": "2026-10-29T10:15:00.000Z",
  "rates": [
    { "from": "cNGN", "to": "USDx", "rate": "0.000666666666666667", "source": "LIVE", "refreshedAt": "2026-10-29T10:15:00.000Z" }
  ]
}
```

### Idempotent replay

Send the same request with the same `Idempotency-Key` again:

* identical body → **`200`**, the original response, header `Idempotent-Replayed: true`, no second effect;
* different body → **`422 IDEMPOTENCY_KEY_REUSED`**.

## Data model

```
Wallet ──< Balance            (PK walletId+currency; amount NUMERIC(38,8) CHECK >= 0)
Wallet ──< Transaction        (as sender and/or receiver)
IdempotencyKey                (UNIQUE scope+key; stores request hash + response)
FxRate                        (per currency: units per 1 USD, source, refreshedAt)
```

* **Wallet** — `email` and `phone` are both nullable and independently `UNIQUE` (at least one is required by the API).
* **Balance** — one row per (wallet, currency), **all five created with the wallet**. Pre-created rows mean
  there is always something to lock, and "does this wallet exist?" is answered by the lock itself.
* **Transaction** — an immutable ledger row per deposit, swap or transfer: `type`, `senderWalletId`,
  `receiverWalletId`, `sourceCurrency/Amount`, `destCurrency/Amount`, `rate`, `rateSource`, `createdAt`.
  A deposit has no sender; a swap has the same wallet as sender and receiver. Indexed on
  `(senderWalletId, createdAt DESC)` and `(receiverWalletId, createdAt DESC)` for history queries.
  `CHECK` constraints require positive amounts and rate.
* **IdempotencyKey** — see below.
* **FxRate** — the last live rates, used as the "stale" fallback across restarts.

Balances are the source of truth for "how much is in the wallet right now" and the ledger is the audit
trail. Both change in the same DB transaction, so they cannot drift.

## How the hard parts are handled

### Money precision

* Amounts enter and leave the API as **strings**; JSON numbers are never trusted for money. Accepted
  format: up to 15 integer digits and 8 decimals (`/^\d{1,15}(\.\d{1,8})?$/`), strictly greater than zero.
* Maths uses `decimal.js` (an isolated clone: 60 digits of precision, **round-half-even**), never JS floats.
* Storage is `NUMERIC(38,8)` for amounts and `NUMERIC(38,18)` for rates.
* Conversions: `dest = round8(source × rate)`. A conversion that rounds to zero is rejected
  (`422 AMOUNT_TOO_SMALL`) rather than silently burning the sender's funds.
* Balance updates are done in SQL (`amount = amount ± $n`), not read-modify-write in application code.

### Idempotency

Every deposit, swap and transfer needs an `Idempotency-Key`. The key is a row in `IdempotencyKey`
(unique on `scope + key`, where scope = operation + the acting wallet) **inserted inside the same
database transaction as the money movement**:

1. `INSERT … ON CONFLICT DO NOTHING` the key with a SHA-256 hash of the canonicalised request.
2. Inserted → do the work, store the response on the key row, commit. Key and effects are atomic —
   there is no window where money moved but the key was lost, or vice versa.
3. Not inserted → someone already used this key. A unique-index conflict makes the second request
   **wait for the first to finish**, so concurrent duplicates are safe: after the first commits, the
   second reads the stored response and replays it (or `422`s if the body hash differs).
4. If the operation fails (e.g. insufficient funds), the transaction rolls back **including the key**, so
   the client can retry the same key after fixing the cause.

The hash normalises amounts (`"100"` and `"100.00"` are the same request) and ignores JSON key order.

### Concurrency

* All mutations run in one `prisma.$transaction`.
* Balance rows are locked with `SELECT … FOR UPDATE`, **always in the same global order**
  (`walletId`, then `currency`). Because every code path takes locks in the same order, A→B and B→A
  transfers at the same moment cannot deadlock.
* The debit is also a guarded update — `… WHERE amount >= $n` — and the table has `CHECK (amount >= 0)`.
  Three independent layers keep balances non-negative: the lock, the guarded `UPDATE`, the constraint.
* The FX lookup happens **before** the transaction starts, so a slow rate provider never holds locks.
* Uniqueness of email/phone is enforced by unique indexes (a Prisma `P2002` becomes `409`), not by a
  check-then-insert, so signups racing each other produce exactly one wallet.
* The e2e suite asserts all of this under real parallel load.

### FX rates and provider failure

* **Source:** `open.er-api.com` (free, no API key), USD-based. Each stablecoin is pegged 1:1 to its fiat
  (cNGN=NGN, cGHS=GHS, cXAF=XAF, USDx=USD, EURx=EUR).
* **Triangulation:** the provider's USD-based rates are stored per currency and every pair is derived
  through USD (`rate(a→b) = perUsd[b] / perUsd[a]`). Any pair is therefore consistent with every other,
  and `a→b` × `b→a` = 1.
* **Caching:** rates are cached in memory for 5 minutes (`FX_CACHE_TTL_SECONDS`), with a single
  in-flight request shared between concurrent callers. Each refresh is persisted to `FxRate`.
* **Failure handling:** a request has a 4 s timeout. If the provider fails, returns non-2xx, or returns
  an incomplete/invalid payload, the service degrades in order:
  1. **`STALE`** — last known live rates (memory, or the `FxRate` table after a restart), with their original timestamp;
  2. **`FIXED`** — the built-in table, if nothing was ever fetched.

  After a failure, the degraded snapshot is served for 30 s (`FX_FAILURE_BACKOFF_SECONDS`) before
  retrying, so an outage doesn't add a 4 s timeout to every request.
* **Transparency:** every rate and every transaction carries its `source` (`LIVE`/`STALE`/`FIXED`), and
  `/fx/rates` reports `refreshedAt`, so clients and auditors can see exactly what was applied.
  Set `FX_PROVIDER=fixed` to disable the network entirely.

## Assumptions

* Stablecoins are mock tokens pegged 1:1 to a fiat currency; the FX rate between them is the fiat rate.
* Rates are mid-market: **no spread and no fees**. The rate at the time of the request is applied
  (no quote/lock-in window).
* A wallet can be created with an email, a mobile number, or both. Phones must be E.164.
* A wallet always has all five currency balances (starting at zero).
* Deposits are unlimited — it's a sandbox. Withdrawals are out of scope (not in the brief).
* A transfer to the same wallet is rejected (use a swap).
* No authentication: knowing a wallet id is enough to act on it, as the brief allows.
* Transaction timestamps are server time in UTC (ISO-8601).

## Known limitations and what I left out

* **No authentication/authorisation or rate limiting** (explicitly out of scope).
* **Idempotency keys never expire.** In production I'd add a TTL and a cleanup job.
* **A stale-rate age limit isn't enforced:** `STALE` rates are served however old they are (they are
  clearly labelled and timestamped). A production system might refuse to trade past a threshold.
* **No quote/lock-in:** the rate is applied at processing time, not at a rate the client previously saw.
* **Single FX provider.** A second provider would remove the single point of failure before falling back.
* **FX cache is per process.** With multiple API instances each would refresh independently
  (correctness is unaffected, since the applied rate is stored on every transaction).
* **History uses page/limit pagination**, not a cursor. Fine at this scale; cursor pagination avoids
  page drift and deep-offset cost on large ledgers.
* **Ordering tie-break:** transactions created in the same millisecond are ordered by id.
* **Not load tested**, and the DB pool size is a config knob (`connection_limit`).
* **No double-entry ledger / system accounts.** Deposits "create" money from nowhere; a real ledger
  would balance every entry against a counter-account.
* **No webhooks, events or background jobs** — nothing here needs a queue yet.

## What I would do with more time

* Double-entry ledger with per-currency system accounts and a reconciliation job that asserts
  `sum(balances) == sum(ledger)` per currency.
* Quotes with a short TTL (`POST /quotes` → `quoteId`) so swaps and transfers execute at a rate the user saw.
* Configurable spread/fees, per-currency decimal precision, and withdrawals.
* Cursor pagination and a `direction=sent|received` filter for transfers.
* Idempotency-key TTL + cleanup; a Redis-backed shared FX cache once there is more than one instance.
* Property-based tests for conversion round-trips and a load test of the lock strategy.
* Structured request logging with correlation ids, metrics (swap latency, FX source), and health that
  reports FX provider status.
* Auth (API keys or JWT), per-wallet ownership checks, and rate limiting.

## Project layout

```
src/
  common/        money maths, amount validation, error filter, idempotency decorators
  prisma/        PrismaService (global)
  fx/            rates, provider, cache, fallbacks, GET /fx/rates
  ledger/        row locks, guarded debit/credit, ledger writes
  idempotency/   transactional exactly-once execution
  wallets/ deposits/ swaps/ transfers/ transactions/   one module per capability
  health/        GET /health
prisma/          schema, migration, seed
test/            e2e (Supertest) + Jest config
```
