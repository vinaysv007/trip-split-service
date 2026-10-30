import { rateLimit } from 'express-rate-limit';
import { getEnv } from '../libs/env.js';
import { HttpError } from './HttpError.js';

/** Per-user limit; install after requireAuthedUser so the key is the user id. */
export const perUserRateLimit = rateLimit({
  windowMs: 60_000,
  limit: () => getEnv().RATE_LIMIT_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.authedUserId ?? 'anonymous',
  handler: (_req, _res, next) => next(new HttpError(429, 'Too many requests')),
});
