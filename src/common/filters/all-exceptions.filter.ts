import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { STATUS_CODES } from 'http';
import type { Response } from 'express';

/**
 * Uniform error body: { statusCode, error, message, code? }.
 * `code` is a stable machine-readable string for business errors (e.g. INSUFFICIENT_FUNDS).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body =
        typeof payload === 'string' ? { message: payload } : (payload as Record<string, unknown>);
      res.status(status).json({
        statusCode: status,
        error: STATUS_CODES[status] ?? 'Error',
        ...body,
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Unexpected error',
    });
  }
}
