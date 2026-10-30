import 'dotenv/config';
import { z } from 'zod';

const boolFromString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.url('DATABASE_URL must be a valid URL'),
  // TLS to Postgres is on (with certificate verification) unless explicitly disabled, e.g. local docker.
  DATABASE_SSL: boolFromString,
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  // Comma-separated allowed browser origins. Empty disables CORS (native mobile clients don't need it).
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().positive().default(24),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return parsed.data;
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  cachedEnv ??= loadEnv();
  return cachedEnv;
}
