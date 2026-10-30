import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface IdempotentResult<T> {
  body: T;
  replayed: boolean;
}

/**
 * Exactly-once execution for money-moving requests.
 *
 * The idempotency row is inserted INSIDE the same DB transaction as the money movement:
 *   - key + effects commit together, or neither does (no "charged but key lost" window);
 *   - two concurrent requests with the same key collide on the unique (scope, key) index:
 *     the second INSERT blocks until the first commits (then sees the row and replays its stored
 *     response) or rolls back (then it proceeds and performs the work itself);
 *   - a request that fails (e.g. INSUFFICIENT_FUNDS) rolls the key back too, so the client may
 *     safely retry the same key after fixing the cause.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    scope: string,
    key: string,
    requestHash: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    return this.prisma.$transaction(
      async (tx) => {
        const inserted = await tx.$executeRaw`
          INSERT INTO "IdempotencyKey" ("id", "scope", "key", "requestHash")
          VALUES (${randomUUID()}, ${scope}, ${key}, ${requestHash})
          ON CONFLICT ("scope", "key") DO NOTHING`;

        if (inserted === 0) {
          const existing = await tx.idempotencyKey.findUnique({
            where: { scope_key: { scope, key } },
          });
          if (!existing || existing.response === null) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
              message:
                'A request with this Idempotency-Key is still being processed. Retry shortly.',
            });
          }
          if (existing.requestHash !== requestHash) {
            throw new UnprocessableEntityException({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'This Idempotency-Key was already used with a different request body.',
            });
          }
          return { body: existing.response as unknown as T, replayed: true };
        }

        const body = await work(tx);
        await tx.idempotencyKey.update({
          where: { scope_key: { scope, key } },
          data: { response: body as unknown as Prisma.InputJsonValue },
        });
        return { body, replayed: false };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }
}
