import { Router } from 'express';
import { z } from 'zod';
import { authenticate, currentUser } from '../../middleware/authenticate.js';
import { loginLimiter } from '../../middleware/rateLimits.js';
import { SESSION_COOKIE, sessionCookieOptions, sessionMaxAgeMs, signSessionToken } from '../../lib/session.js';
import { parse } from '../../lib/validation.js';
import * as authService from './auth.service.js';

const loginSchema = z.object({
  email: z.email('Enter a valid email address').transform((email) => email.toLowerCase()),
  password: z.string().min(1, 'Password is required').max(200),
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body, 'body');
  const profile = await authService.login(email, password);
  const token = signSessionToken({ id: profile.id, role: profile.role, authorId: profile.authorId });
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge: sessionMaxAgeMs });
  res.json({ data: profile });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({ data: await authService.getProfile(currentUser(req).id) });
});
