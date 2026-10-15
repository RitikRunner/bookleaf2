import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'bl_session';

export interface SessionUser {
  id: string;
  role: Role;
  authorId: string | null;
}

const claimsSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(Role),
  authorId: z.string().nullable(),
});

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true, // unreadable from JavaScript, so an XSS bug cannot steal the session
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

export const sessionMaxAgeMs = env.JWT_TTL_HOURS * 60 * 60 * 1000;

export function signSessionToken(user: SessionUser): string {
  return jwt.sign({ role: user.role, authorId: user.authorId }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_TTL_HOURS * 60 * 60,
    algorithm: 'HS256',
  });
}

/** Returns the session for a valid, unexpired token, or null for anything else. */
export function verifySessionToken(token: string): SessionUser | null {
  try {
    const claims = claimsSchema.safeParse(jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }));
    return claims.success ? { id: claims.data.sub, role: claims.data.role, authorId: claims.data.authorId } : null;
  } catch {
    return null;
  }
}
