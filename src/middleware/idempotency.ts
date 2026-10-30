import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { idempotencyKeys } from '../db/schema.js';
import { getEnv } from '../libs/env.js';
import { HttpError } from './HttpError.js';
import { getUser } from './requireAuthedUser.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_KEY_LENGTH = 255;

/**
 * Write endpoints accept an `Idempotency-Key` header. A retry with the same key and the same
 * request returns the original response; the same key with a different request is rejected.
 * Requires attachUser. Only JSON responses (res.json) are recorded.
 */
export const idempotency: RequestHandler = async (req, res, next) => {
  const key = req.header('idempotency-key');
  if (!key || !WRITE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new HttpError(400, 'Idempotency-Key is too long', 'invalid_idempotency_key');
  }

  const userId = getUser(req).id;
  const path = req.baseUrl + req.path;
  const requestHash = createHash('sha256')
    .update(JSON.stringify([req.method, path, req.body ?? null]))
    .digest('hex');
  const now = new Date();

  // Drop this key if it has expired, then try to claim it.
  await db
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.key, key),
        lt(idempotencyKeys.expiresAt, now),
      ),
    );

  const expiresAt = new Date(now.getTime() + getEnv().IDEMPOTENCY_TTL_HOURS * 3_600_000);
  const [claimed] = await db
    .insert(idempotencyKeys)
    .values({ key, userId, method: req.method, path, requestHash, expiresAt })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (!claimed) {
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)))
      .limit(1);

    if (!existing) {
      // Row vanished between the insert and the select; ask the client to retry.
      throw new HttpError(409, 'Please retry the request', 'idempotency_retry');
    }
    if (existing.requestHash !== requestHash) {
      throw new HttpError(
        422,
        'Idempotency-Key was already used with a different request',
        'idempotency_key_reuse',
      );
    }
    if (existing.responseStatus === null) {
      throw new HttpError(
        409,
        'A request with this Idempotency-Key is still in progress',
        'idempotency_in_progress',
      );
    }
    res.setHeader('Idempotent-Replayed', 'true');
    res.status(existing.responseStatus).json(existing.responseBody);
    return;
  }

  // First request: capture the JSON response and store it. Server errors are not stored so the
  // client can retry; the claim is released if the request never completed.
  let responseBody: unknown;
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('close', () => {
    const release = res.statusCode >= 500 || !res.writableFinished || responseBody === undefined;
    const op = release
      ? db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, claimed.id))
      : db
          .update(idempotencyKeys)
          .set({ responseStatus: res.statusCode, responseBody })
          .where(eq(idempotencyKeys.id, claimed.id));
    op.catch((err: unknown) => console.error('Failed to finalize idempotency key:', err));
  });

  next();
};
