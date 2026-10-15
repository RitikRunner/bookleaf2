import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, 'ROUTE_NOT_FOUND', `No route matches ${req.method} ${req.originalUrl.split('?')[0]}`);
};

/** Single place where errors become HTTP responses. Unexpected errors are logged and never leak internals. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const error = toAppError(err);
  if (error.status >= 500) logger.error({ err, method: req.method, path: req.originalUrl }, 'Unhandled error');

  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined && { details: error.details }),
    },
  });
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isClientHttpError(err)) {
    // Raised by express.json() for bodies it cannot accept.
    if (err.type === 'entity.parse.failed') return new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    if (err.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    return new AppError(err.status, 'BAD_REQUEST', 'The request could not be processed');
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return new AppError(404, 'NOT_FOUND', 'Resource not found');
    if (err.code === 'P2002') return new AppError(409, 'CONFLICT', 'A record with these details already exists');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again shortly.');
}

function isClientHttpError(err: unknown): err is { status: number; type?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}
