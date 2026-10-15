import type { Request, RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from '../lib/session.js';

/** Requires a valid session cookie and attaches the user to the request. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const user = typeof token === 'string' ? verifySessionToken(token) : null;
  if (!user) throw new UnauthorizedError();
  req.user = user;
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(currentUser(req).role)) throw new ForbiddenError();
    next();
  };
}

/** The signed-in user. Only valid on routes mounted behind `authenticate`. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
