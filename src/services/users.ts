import { and, eq, isNull } from 'drizzle-orm';
import { clerkClient } from '@clerk/express';
import { db, withTx } from '../db/index.js';
import { pushTokens, users, type User } from '../db/schema.js';
import { HttpError } from '../middleware/HttpError.js';

export const DELETED_USER_NAME = 'Deleted user';

export interface ClerkUserProfile {
  clerkId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

/** Idempotent create-or-update. A deleted (anonymized) user is never resurrected. */
export async function upsertUserFromClerk(profile: ClerkUserProfile): Promise<void> {
  await db
    .insert(users)
    .values(profile)
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        displayName: profile.displayName,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        updatedAt: new Date(),
      },
      setWhere: isNull(users.deletedAt),
    });
}

async function findByClerkId(clerkId: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
  return row;
}

/**
 * Returns the local user for a Clerk id, creating it from Clerk if the webhook has not
 * arrived yet. Rejects anonymized (deleted) accounts.
 */
export async function ensureUser(clerkId: string): Promise<User> {
  let user = await findByClerkId(clerkId);
  if (!user) {
    const c = await clerkClient.users.getUser(clerkId);
    const primary =
      c.emailAddresses.find((e) => e.id === c.primaryEmailAddressId) ?? c.emailAddresses[0];
    await upsertUserFromClerk({
      clerkId,
      displayName: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.username || 'Unknown',
      email: primary?.emailAddress ?? null,
      avatarUrl: c.imageUrl || null,
    });
    user = await findByClerkId(clerkId);
  }
  if (!user) throw new Error(`Failed to create user for Clerk id ${clerkId}`);
  if (user.deletedAt) throw new HttpError(403, 'Account has been deleted', 'account_deleted');
  return user;
}

/**
 * Account deletion: soft-delete and anonymize the user, purge their push tokens.
 * Rows referencing the user (expenses etc.) stay intact. Safe to call repeatedly.
 */
export async function anonymizeUser(clerkId: string): Promise<void> {
  await withTx(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({
        displayName: DELETED_USER_NAME,
        email: null,
        avatarUrl: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(users.clerkId, clerkId), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (user) {
      await tx.delete(pushTokens).where(eq(pushTokens.userId, user.id));
    }
  });
}
