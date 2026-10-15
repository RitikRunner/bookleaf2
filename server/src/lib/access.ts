import { ForbiddenError } from './errors.js';
import type { SessionUser } from './session.js';

/** The caller's author id. Rejects admins and any account without an author profile. */
export function requireAuthorId(user: SessionUser): string {
  if (user.role !== 'AUTHOR' || !user.authorId) throw new ForbiddenError('Only authors can perform this action');
  return user.authorId;
}

/**
 * Row-level access rule for author-owned records (books, tickets): authors see only their own rows,
 * admins see everything. Every query on those tables goes through this so the rule lives in one place.
 */
export function authorScope(user: SessionUser): { authorId?: string } {
  return user.role === 'ADMIN' ? {} : { authorId: requireAuthorId(user) };
}
