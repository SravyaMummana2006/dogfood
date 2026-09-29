import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../errors';
import { logger } from '../logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err instanceof ValidationError && err.details) {
      (body.error as Record<string, unknown>).details = err.details;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // JSON parse errors
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      },
    });
    return;
  }

  // Body-parser payload too large
  if ('type' in err && (err as any).type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
      },
    });
    return;
  }

  // Unexpected errors — never leak internals
  logger.error(err, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
