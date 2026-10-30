# TripSplit Backend — Implementation Plan

> **Progress tracking:** tick `[x]` against an item as soon as it is implemented and verified. Do not tick an item that is only partly done.

## Context

Greenfield backend for an Expo React Native trip-expense-sharing app (separate mobile repo). Stack: TypeScript, Node/Express, Postgres, Drizzle, Clerk auth, Inngest, Sentry. Decisions come from the product interview. Open risks are intentionally left unresolved and listed at the end.

## Scope (v1)

- Trips, members (including placeholder members who haven't signed up), invites (shareable link/code, plus push to existing users).
- Expenses with equal or exact splits, multi-currency with a stored FX rate.
- Derived balances, suggested transfers, manual settlement records.
- Expo push notifications via Inngest, idempotent writes, rate limits and caps.
- Clerk webhook sync and account-deletion anonymization.

**Out of scope:** receipts, in-app payments, percentage/weight splits, offline sync, leaving/removing members, admin tiers, scheduled FX jobs.

## Roles and rules

- One **admin** per trip (the creator): invites people, archives or soft-deletes the trip, edits orphaned expenses.
- **Members** add expenses and edit or delete only their own.
- Account deletion anonymizes the user as "Deleted user"; their expenses stay and the admin gains edit rights over them.

## Steps

### 0. Planning and project setup

- [x] Product interview and spec summary
- [x] PLAN.md written
- [x] CLAUDE.md written
- [x] Empty folder structure created
- [x] `main` entry set in package.json (`src/index.ts`)

### 1. Scaffold

- [ ] git init
- [ ] package.json with dependencies (pnpm, Node 22, ESM); confirm current versions of express, @clerk/express, drizzle-orm/kit, inngest, @sentry/node, zod, pino against docs before pinning
- [ ] Strict tsconfig (plus build config)
- [ ] eslint and prettier
- [ ] vitest config
- [ ] `.env.example`
- [ ] Dockerfile
- [ ] docker-compose (Postgres)

### 2. Config and app core

- [ ] Zod-validated env (`src/config/env.ts`)
- [ ] pino logger with request IDs
- [ ] Sentry init (imported first in `server.ts`)
- [ ] `app.ts` and `server.ts`
- [x] Error-envelope middleware
- [ ] `/healthz` and `/readyz`
- [ ] Per-user rate limiter

### 3a. Database configuration

- [ ] `DATABASE_URL` in the zod env schema (plus `DATABASE_SSL` and `DB_POOL_MAX`), documented in `.env.example`
- [ ] `src/db/client.ts`: `pg` Pool (max, idle and connection timeouts, SSL for staging/prod) wrapped by Drizzle; one shared instance
- [ ] Pool error handler logs to pino and Sentry; graceful `pool.end()` on shutdown
- [ ] Transaction helper (`withTx`) so services can run multi-table writes atomically
- [ ] `drizzle.config.ts` (schema path, `./drizzle` output dir, Postgres dialect, `DATABASE_URL`)
- [ ] `src/db/migrate.ts` runner and `db:generate` / `db:migrate` scripts; migrations applied on deploy, not on server start
- [ ] `/readyz` runs a lightweight query (`select 1`)
- [ ] Local Postgres via docker-compose (dev database plus a separate test database)
- [ ] Per-environment databases: dev, staging, prod (separate URLs, never shared)
- [ ] Optional seed script for local dev data

### 3b. Schema (v1) in `src/db/schema.ts`

Conventions: `uuid` primary keys (`gen_random_uuid()`), `timestamptz` for all timestamps, `created_at` / `updated_at` on mutable tables, soft delete via `deleted_at`, money as `NUMERIC(14,2)` with a 3-letter currency code, enums as Postgres enums.

- [x] Enums: `member_role` (`admin`, `member`), `split_type` (`equal`, `exact`), `push_platform` (`ios`, `android`)
- [x] `users`: id, clerk_id (unique, not null), display_name, email (nullable), avatar_url, deleted_at, created_at, updated_at
- [x] `trips`: id, name, base_currency, admin_user_id (fk users), start_date / end_date (nullable), archived_at, deleted_at, created_at, updated_at
- [x] `trip_members`: id, trip_id (fk), user_id (fk, nullable for placeholders), display_name, role, claimed_at, created_at. Unique (trip_id, user_id) where user_id is not null; index on trip_id
- [x] `invites`: id, trip_id (fk), code (unique), created_by_member_id (fk), claim_member_id (fk, nullable, set when claiming a placeholder), max_uses, use_count, expires_at, revoked_at, created_at
- [x] `expenses`: id, trip_id (fk), created_by_user_id (fk), payer_member_id (fk), description, amount, currency, fx_rate `NUMERIC(18,8)`, base_amount, split_type, expense_date, deleted_at, created_at, updated_at. Check: amount > 0 and fx_rate > 0. Indexes on (trip_id, expense_date) and payer_member_id
- [x] `expense_splits`: expense_id (fk), member_id (fk), share, base_share. Primary key (expense_id, member_id). Check: share >= 0
- [x] `settlements`: id, trip_id (fk), from_member_id (fk), to_member_id (fk), amount (in trip base currency), created_by_user_id (fk), settled_at, deleted_at, created_at. Check: from_member_id <> to_member_id and amount > 0. Index on trip_id
- [x] `push_tokens`: id, user_id (fk), token (unique), platform, last_seen_at, created_at
- [x] `idempotency_keys`: key, user_id (fk), method, path, request_hash, response_status, response_body (jsonb), created_at, expires_at. Unique (user_id, key). Cleanup of expired rows
- [x] Foreign keys with explicit `on delete` behavior (restrict by default; nothing is hard-deleted in v1)
- [x] Drizzle relations and exported inferred types (`typeof table.$inferSelect` / `$inferInsert`)
- [ ] Initial migration generated, reviewed, and applied to dev and test databases
- [ ] Schema test: migrations apply cleanly to an empty database

### 4. Auth

- [x] Clerk middleware on all `/v1` routes
- [ ] Lazy idempotent user upsert
- [ ] `POST /webhooks/clerk` verified with Svix
- [ ] Inngest hand-off for user.created, user.updated, user.deleted
- [ ] Deletion anonymizes the user and purges push tokens

### 5. Domain logic (pure functions, tested first)

- [ ] 2-decimal rounding helpers
- [ ] Equal split with deterministic remainder
- [ ] Exact-split validation
- [ ] Balance derivation
- [ ] Minimal-transfer suggestion

### 6. FX service

- [ ] Frankfurter client
- [ ] Short cache
- [ ] Client-override rate
- [ ] Fallback to cached rate, or require a manual rate

### 7. Routes under `/v1`

- [ ] `GET /me`
- [ ] Trips (create, list, get, archive, soft-delete)
- [ ] Members (list, add placeholder)
- [ ] Invites (create, revoke, redeem, claim placeholder)
- [ ] Expenses (create, list, get, update, delete)
- [ ] Balances and suggested transfers
- [ ] Settlements (create, list, delete)
- [ ] Push tokens (register, unregister)
- [ ] Zod schemas generating OpenAPI
- [ ] Cursor pagination
- [ ] Idempotency-Key on POSTs
- [ ] Caps enforced (members, expenses, note length)

### 8. Inngest

- [ ] Client and serve handler at `/api/inngest`
- [ ] Notifications: member joined, expense created/updated/deleted, settlement recorded
- [ ] Expo push sender with dead-token cleanup
- [ ] Clerk event processor

### 9. Authorization helpers

- [ ] `assertMember`
- [ ] `assertAdmin`
- [ ] `assertExpenseEditable`
- [ ] Applied to every trip-scoped route

### 10. CI and docs

- [ ] GitHub Actions (lint, typecheck, test with Postgres)
- [ ] README
- [ ] OpenAPI served at `/v1/openapi.json`

## Critical files

`src/db/schema.ts`, `src/domain/*`, `src/middleware/{auth,idempotency,errors}.ts`, `src/routes/v1/*`, `src/inngest/*`, `src/services/{fx,push}.ts`.

## Verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Unit: split rounding sums exactly
- [ ] Unit: balances net to zero
- [ ] Unit: transfers are minimal
- [ ] Unit: multi-currency conversion
- [ ] Integration (real Postgres): authorization matrix
- [ ] Integration: idempotent retry returns the same result
- [ ] Integration: invite expiry, revoke and claim
- [ ] Integration: Clerk webhook signature and deletion anonymization
- [ ] Manual: `docker compose up` and `/healthz` responds
- [ ] Manual: `/v1/me` works with a Clerk dev token
- [ ] Manual: push event triggered through the Inngest dev server

## Assumptions added with the schema

- Primary keys are UUIDs and timestamps are `timestamptz`.
- `base_amount` and `base_share` are stored on each expense at write time (so later FX changes never rewrite history); balances are derived from them.
- Settlements are always recorded in the trip's base currency.
- Idempotency keys expire after a fixed window (default 24 hours, to be confirmed).

## Open risks (unresolved, need decisions)

- Placeholder claim and merge rules (duplicate claims, wrong slot, leaked invites, who approves).
- Author-only edits leave wrong expenses stuck if the author is unresponsive.
- FX accuracy: no historical rates for backdated expenses; override rates can mislead.
- Editing or deleting old expenses shifts balances and may invalidate recorded settlements.
- Account deletion and privacy: display names may remain on expenses; check store and jurisdiction rules.
- Invite link abuse through forwarding.
- Expo push delivery isn't guaranteed; there is no in-app notification inbox.
- Clerk webhook ordering versus the first API call.
- Free-tier quotas for FX, Expo, Sentry, and Inngest are unchecked.
- Rounding rule between expense currency and base currency needs documenting.
