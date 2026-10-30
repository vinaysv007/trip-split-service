# TripSplit Backend

REST API for the TripSplit mobile app (Expo React Native, separate repo). Users create trips, add members, log shared expenses, and see who owes whom. Full plan and open risks: [PLAN.md](PLAN.md).

## Stack and commands

TypeScript (strict, ESM), Node 22, Express, Postgres, Drizzle ORM, Clerk (auth), Inngest (background jobs), Sentry, Zod, Vitest, pnpm.

- `pnpm dev` — run with watch (entry: `src/index.ts`)
- `pnpm test` / `pnpm typecheck` / `pnpm lint`
- `pnpm db:generate` — create a migration from `src/db/schema.ts`; `pnpm db:migrate` — apply it

## Folder map

- `src/index.ts` starts the server (import Sentry first); `src/app.ts` builds the Express app.
- `src/routes/` — thin HTTP handlers (`v1/` for the API, `webhooks/` for Clerk). No business rules here.
- `src/services/` — database work and orchestration, using transactions where needed.
- `src/domain/` — pure money, split, balance and settlement logic. No I/O.
- `src/authz/` — permission guards. `src/middleware/` — auth, idempotency, rate limit, errors.
- `src/schemas/` — Zod schemas; they validate requests and generate OpenAPI.
- `src/inngest/` — the only code that sends push notifications.
- `src/db/` — client, schema, migrations runner. `drizzle/` — committed SQL migrations.
- `test/unit/` (domain) and `test/integration/` (real Postgres).

## Rules that must not be broken

- **Money is a decimal number with at most 2 decimal places** (e.g. `12.50`). Round to 2 dp at every boundary (input, FX conversion, split results). Store in Postgres as `NUMERIC(14,2)`, not `float`/`real`. Splits must add up exactly to the expense total; give any leftover cent to a member deterministically (sorted by member id).
- Every `/v1` route requires Clerk auth. Trip-scoped routes must call a guard from `src/authz/`.
- Write endpoints accept an `Idempotency-Key` header; a retry returns the original result.
- Soft-delete only. Balances are always derived from expenses and settlements, never stored.
- Only two roles per trip: **admin** (the creator) and **member**. Members add expenses and edit or delete only their own. The admin invites people and can edit expenses whose author is a deleted user.
- Push notifications go through Inngest events, never directly from a route.

## Decisions already made (v1)

- Trips with members; placeholder members allowed and claimed later via an invite link/code. Existing users can also be invited by identifier (push).
- Expenses have a payer, a currency, and either an equal or exact-amount split. Each expense stores its FX rate to the trip's base currency. The rate comes from Frankfurter on creation (short cache); the client may override it.
- Settlements are recorded manually ("X paid Y"). No in-app payments.
- Clerk webhooks (verified with Svix) sync users. A first request lazily creates the user if the webhook is late. Account deletion anonymizes the user as "Deleted user" and purges push tokens; their expenses stay.
- Online-only clients. No receipts, no leaving or removing members, no percentage or weight splits in v1.
- Limits: per-user rate limiting; caps on members per trip, expenses per trip and note length; invite codes expire and can be revoked.

## Progress tracking

After finishing any implementation work, tick the matching `[ ]` boxes in [PLAN.md](PLAN.md) in the same change. Tick only what is fully done and verified; leave partial work unticked.

## Conventions

- REST under `/v1`, cursor pagination, one error envelope shape, OpenAPI at `/v1/openapi.json`.
- Logging with pino and a request ID; errors to Sentry tagged with user and trip IDs.
- `/healthz` (liveness) and `/readyz` (database reachable).
- Any change touching money math or authorization needs tests.

## Open risks

Unresolved on purpose; see the end of [PLAN.md](PLAN.md). If a task touches one of them, flag it instead of silently choosing an answer.
