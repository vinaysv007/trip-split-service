import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  char,
  date,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
  integer,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';

// Money is NUMERIC(14,2) and the FX rate NUMERIC(18,8). Drizzle returns numerics as strings
// (mode 'string'), which keeps them out of floating point.
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'string' });
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const memberRole = pgEnum('member_role', ['admin', 'member']);
export const splitType = pgEnum('split_type', ['equal', 'exact']);
export const pushPlatform = pgEnum('push_platform', ['ios', 'android']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  deletedAt: timestamptz('deleted_at'),
  createdAt: timestamptz('created_at').defaultNow().notNull(),
  updatedAt: timestamptz('updated_at').defaultNow().notNull(),
});

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    baseCurrency: char('base_currency', { length: 3 }).notNull(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    archivedAt: timestamptz('archived_at'),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').defaultNow().notNull(),
    updatedAt: timestamptz('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('trips_admin_user_id_idx').on(t.adminUserId),
    check(
      'trips_dates_check',
      sql`${t.endDate} IS NULL OR ${t.startDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
  ],
);

// user_id is null for a placeholder member who hasn't signed up; they are claimed later via an invite.
export const tripMembers = pgTable(
  'trip_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    role: memberRole('role').notNull().default('member'),
    claimedAt: timestamptz('claimed_at'),
    createdAt: timestamptz('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('trip_members_trip_id_idx').on(t.tripId),
    index('trip_members_user_id_idx').on(t.userId),
    uniqueIndex('trip_members_trip_user_uq')
      .on(t.tripId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
    uniqueIndex('trip_members_one_admin_uq')
      .on(t.tripId)
      .where(sql`${t.role} = 'admin'`),
  ],
);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    code: text('code').notNull().unique(),
    createdByMemberId: uuid('created_by_member_id')
      .notNull()
      .references(() => tripMembers.id, { onDelete: 'restrict' }),
    // Set when the invite is for claiming an existing placeholder member.
    claimMemberId: uuid('claim_member_id').references(() => tripMembers.id, {
      onDelete: 'restrict',
    }),
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('invites_trip_id_idx').on(t.tripId),
    check('invites_max_uses_check', sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`),
    check('invites_use_count_check', sql`${t.useCount} >= 0`),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    payerMemberId: uuid('payer_member_id')
      .notNull()
      .references(() => tripMembers.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    amount: money('amount').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    // Rate from `currency` to the trip's base currency, stored at write time.
    fxRate: numeric('fx_rate', { precision: 18, scale: 8, mode: 'string' }).notNull(),
    baseAmount: money('base_amount').notNull(),
    splitType: splitType('split_type').notNull(),
    expenseDate: date('expense_date', { mode: 'string' }).notNull(),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').defaultNow().notNull(),
    updatedAt: timestamptz('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('expenses_trip_date_idx').on(t.tripId, t.expenseDate),
    index('expenses_payer_member_id_idx').on(t.payerMemberId),
    check('expenses_amount_check', sql`${t.amount} > 0`),
    check('expenses_fx_rate_check', sql`${t.fxRate} > 0`),
  ],
);

export const expenseSplits = pgTable(
  'expense_splits',
  {
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'restrict' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => tripMembers.id, { onDelete: 'restrict' }),
    share: money('share').notNull(),
    baseShare: money('base_share').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.memberId] }),
    index('expense_splits_member_id_idx').on(t.memberId),
    check('expense_splits_share_check', sql`${t.share} >= 0`),
  ],
);

// Always recorded in the trip's base currency.
export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    fromMemberId: uuid('from_member_id')
      .notNull()
      .references(() => tripMembers.id, { onDelete: 'restrict' }),
    toMemberId: uuid('to_member_id')
      .notNull()
      .references(() => tripMembers.id, { onDelete: 'restrict' }),
    amount: money('amount').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    settledAt: timestamptz('settled_at').defaultNow().notNull(),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('settlements_trip_id_idx').on(t.tripId),
    check('settlements_members_check', sql`${t.fromMemberId} <> ${t.toMemberId}`),
    check('settlements_amount_check', sql`${t.amount} > 0`),
  ],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    token: text('token').notNull().unique(),
    platform: pushPlatform('platform').notNull(),
    lastSeenAt: timestamptz('last_seen_at').defaultNow().notNull(),
    createdAt: timestamptz('created_at').defaultNow().notNull(),
  },
  (t) => [index('push_tokens_user_id_idx').on(t.userId)],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    method: text('method').notNull(),
    path: text('path').notNull(),
    requestHash: text('request_hash').notNull(),
    // Null while the first request is still in flight.
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamptz('created_at').defaultNow().notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [
    uniqueIndex('idempotency_keys_user_key_uq').on(t.userId, t.key),
    index('idempotency_keys_expires_at_idx').on(t.expiresAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(tripMembers),
  pushTokens: many(pushTokens),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  admin: one(users, { fields: [trips.adminUserId], references: [users.id] }),
  members: many(tripMembers),
  invites: many(invites),
  expenses: many(expenses),
  settlements: many(settlements),
}));

export const tripMembersRelations = relations(tripMembers, ({ one, many }) => ({
  trip: one(trips, { fields: [tripMembers.tripId], references: [trips.id] }),
  user: one(users, { fields: [tripMembers.userId], references: [users.id] }),
  splits: many(expenseSplits),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  trip: one(trips, { fields: [invites.tripId], references: [trips.id] }),
  createdBy: one(tripMembers, {
    fields: [invites.createdByMemberId],
    references: [tripMembers.id],
    relationName: 'invite_creator',
  }),
  claimMember: one(tripMembers, {
    fields: [invites.claimMemberId],
    references: [tripMembers.id],
    relationName: 'invite_claim',
  }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  trip: one(trips, { fields: [expenses.tripId], references: [trips.id] }),
  createdBy: one(users, { fields: [expenses.createdByUserId], references: [users.id] }),
  payer: one(tripMembers, { fields: [expenses.payerMemberId], references: [tripMembers.id] }),
  splits: many(expenseSplits),
}));

export const expenseSplitsRelations = relations(expenseSplits, ({ one }) => ({
  expense: one(expenses, { fields: [expenseSplits.expenseId], references: [expenses.id] }),
  member: one(tripMembers, { fields: [expenseSplits.memberId], references: [tripMembers.id] }),
}));

export const settlementsRelations = relations(settlements, ({ one }) => ({
  trip: one(trips, { fields: [settlements.tripId], references: [trips.id] }),
  from: one(tripMembers, {
    fields: [settlements.fromMemberId],
    references: [tripMembers.id],
    relationName: 'settlement_from',
  }),
  to: one(tripMembers, {
    fields: [settlements.toMemberId],
    references: [tripMembers.id],
    relationName: 'settlement_to',
  }),
  createdBy: one(users, { fields: [settlements.createdByUserId], references: [users.id] }),
}));

export const pushTokensRelations = relations(pushTokens, ({ one }) => ({
  user: one(users, { fields: [pushTokens.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
export type TripMember = typeof tripMembers.$inferSelect;
export type NewTripMember = typeof tripMembers.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type ExpenseSplit = typeof expenseSplits.$inferSelect;
export type NewExpenseSplit = typeof expenseSplits.$inferInsert;
export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
