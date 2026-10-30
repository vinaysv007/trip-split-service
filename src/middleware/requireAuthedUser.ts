import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getAuth } from '@clerk/express';
import type { User } from '../db/schema.js';
import { ensureUser } from '../services/users.js';
import { HttpError } from './HttpError.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Clerk user id; set by requireAuthedUser. */
      authedUserId?: string;
      /** Local user row; set by attachUser. */
      user?: User;
    }
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

/** Requires a valid Clerk session. Must be installed AFTER `clerkMiddleware()`. */
export function requireAuthedUser(req: Request, _res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    next(new UnauthorizedError());
    return;
  }
  req.authedUserId = userId;
  next();
}

/** Loads the local user, lazily creating it from Clerk if the webhook is late. */
export const attachUser: RequestHandler = async (req, _res, next) => {
  req.user = await ensureUser(getAuthedUserId(req));
  next();
};

export function getAuthedUserId(req: Request): string {
  if (!req.authedUserId) {
    throw new Error('authedUserId missing — requireAuthedUser middleware not run');
  }
  return req.authedUserId;
}

export function getUser(req: Request): User {
  if (!req.user) {
    throw new Error('user missing — attachUser middleware not run');
  }
  return req.user;
}
