import {
  BadRequestException,
  ExecutionContext,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';

export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_\-:.]{8,128}$/;

/** Extracts and validates the `Idempotency-Key` header. */
export const IdempotencyKeyHeader = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const raw = req.headers['idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key || !IDEMPOTENCY_KEY_REGEX.test(key)) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message:
          'Idempotency-Key header is required: 8-128 chars of letters, digits, "_", "-", ":" or "."',
      });
    }
    return key;
  },
);

/** Swagger docs shared by every money-moving endpoint. */
export function ApiIdempotent(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Unique key per logical request (e.g. a UUID). Replaying the same key and body returns the original response (HTTP 200, header Idempotent-Replayed: true).',
    }),
    ApiResponse({
      status: 422,
      description:
        'Business rule violation (INSUFFICIENT_FUNDS, IDEMPOTENCY_KEY_REUSED with a different body, AMOUNT_TOO_SMALL)',
    }),
  ) as MethodDecorator & ClassDecorator;
}

/** Sets 200 + Idempotent-Replayed header on replays; leaves the default 201 otherwise. */
export function applyReplay<T>(res: Response, result: { body: T; replayed: boolean }): T {
  if (result.replayed) {
    res.status(200);
    res.setHeader('Idempotent-Replayed', 'true');
  }
  return result.body;
}
