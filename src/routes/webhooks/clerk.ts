import type { Request as ExpressRequest, RequestHandler } from 'express';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { getEnv } from '../../libs/env.js';
import { HttpError } from '../../middleware/HttpError.js';
import { anonymizeUser, upsertUserFromClerk } from '../../services/users.js';

// Rebuild a Fetch Request from the raw Express body; the signature covers the exact bytes.
function toFetchRequest(req: ExpressRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else if (value !== undefined) headers.set(name, value);
  }
  return new Request('http://internal/webhooks/clerk', {
    method: 'POST',
    headers,
    body: (req.body as Buffer).toString('utf8'),
  });
}

/** Mount with `express.raw({ type: 'application/json' })` so `req.body` is a Buffer. */
export const clerkWebhookHandler: RequestHandler = async (req, res) => {
  let evt;
  try {
    evt = await verifyWebhook(toFetchRequest(req), {
      signingSecret: getEnv().CLERK_WEBHOOK_SECRET,
    });
  } catch {
    throw new HttpError(400, 'Invalid webhook signature', 'invalid_signature');
  }

  // Errors below propagate (Express 5 catches async rejections) -> 500, so Clerk retries.
  switch (evt.type) {
    case 'user.created':
    case 'user.updated': {
      const u = evt.data;
      const primaryEmail =
        u.email_addresses.find((e) => e.id === u.primary_email_address_id) ?? u.email_addresses[0];
      const displayName =
        [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Unknown';
      await upsertUserFromClerk({
        clerkId: u.id,
        displayName,
        email: primaryEmail?.email_address ?? null,
        avatarUrl: u.image_url || null,
      });
      break;
    }
    case 'user.deleted': {
      if (!evt.data.id) {
        throw new HttpError(400, 'User ID missing');
      }
      await anonymizeUser(evt.data.id);
      break;
    }
    default:
      // Unhandled event types are acknowledged so Clerk doesn't keep retrying.
      break;
  }

  res.status(200).json({ received: true });
};
