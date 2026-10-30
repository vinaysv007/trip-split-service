import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './HttpError.js';

/** Every error response has this shape: { error: { code, message, details?, requestId } } */
function send(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res.status(status).json({
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
      requestId: res.locals.requestId,
    },
  });
}

export function handleError(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    send(res, 400, 'validation_error', 'Invalid input', err.issues);
    return;
  }
  if (err instanceof HttpError) {
    send(res, err.status, err.code, err.message, err.details);
    return;
  }
  // Malformed JSON / oversized bodies from body-parser carry a 4xx status.
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    send(res, status, 'bad_request', 'Bad request');
    return;
  }
  console.error(err);
  send(res, 500, 'internal_error', 'Internal server error');
}
