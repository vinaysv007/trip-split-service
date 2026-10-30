import { Router } from 'express';
import { idempotency } from '../../middleware/idempotency.js';
import { perUserRateLimit } from '../../middleware/rateLimit.js';
import { attachUser, requireAuthedUser } from '../../middleware/requireAuthedUser.js';
import { meRouter } from './me.js';

export const v1Router = Router();

// Every /v1 route requires Clerk auth.
v1Router.use(requireAuthedUser, perUserRateLimit, attachUser, idempotency);

v1Router.use('/me', meRouter);
