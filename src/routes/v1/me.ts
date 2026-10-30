import { Router } from 'express';
import { getUser } from '../../middleware/requireAuthedUser.js';

export const meRouter = Router();

meRouter.get('/', (req, res) => {
  const { id, displayName, email, avatarUrl, createdAt } = getUser(req);
  res.json({ id, displayName, email, avatarUrl, createdAt });
});
