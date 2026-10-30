import express from 'express';
import type { Express, Request, Response } from 'express';
import { clerkMiddleware } from '@clerk/express';
import cors from 'cors';
import helmet from 'helmet';
import { db } from './db/index.js';
import { getEnv } from './libs/env.js';
import { HttpError } from './middleware/HttpError.js';
import { handleError } from './middleware/handleError.js';
import { requestId } from './middleware/requestId.js';
import { clerkWebhookHandler } from './routes/webhooks/clerk.js';
import { v1Router } from './routes/v1/index.js';

export function createApp(): Express {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());

  // Webhook must see the raw body for signature verification, so it is mounted before express.json().
  app.post(
    '/webhooks/clerk',
    express.raw({ type: 'application/json', limit: '1mb' }),
    clerkWebhookHandler,
  );

  if (env.CORS_ORIGINS.length > 0) {
    app.use(cors({ origin: env.CORS_ORIGINS }));
  }
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.get('/readyz', async (_req: Request, res: Response) => {
    try {
      await db.execute('select 1');
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'database unavailable' });
    }
  });

  app.use('/v1', clerkMiddleware(), v1Router);

  app.use((_req: Request, _res: Response, next) => {
    next(new HttpError(404, 'Endpoint not found'));
  });
  app.use(handleError);

  return app;
}
