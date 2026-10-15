import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { currentUser } from './authenticate.js';

const isTest = env.NODE_ENV === 'test';

function rejectWith(message: string): RequestHandler {
  return (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', message));
}

/** Slows down password guessing: 10 attempts per IP every 15 minutes. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rejectWith('Too many sign-in attempts. Please wait a few minutes and try again.'),
});

/** Every new ticket triggers AI calls, so creation is capped per author to bound cost and abuse. */
export const ticketCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 1000 : 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => currentUser(req).id,
  handler: rejectWith('You have raised a lot of tickets in the last hour. Please wait before raising another.'),
});
