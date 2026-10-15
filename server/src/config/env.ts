import 'dotenv/config';
import { z } from 'zod';
import { parseIsoDate } from '../lib/dates.js';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_TTL_HOURS: z.coerce.number().int().positive().default(12),
  // Optional by design: without a key the portal still works and admins reply manually.
  GEMINI_API_KEY: z.string().optional(),
  AI_ENABLED: booleanFlag.default(true),
  // Separate settings so the customer-facing draft can use a stronger model than high-volume classification.
  AI_CLASSIFY_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  AI_DRAFT_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  // The dataset's royalty figures are a snapshot; payout timelines are calculated relative to this date.
  DATA_AS_OF_DATE: z.iso.date().default('2026-01-15'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export const isAiConfigured = env.AI_ENABLED && Boolean(env.GEMINI_API_KEY);
export const dataAsOfDate = parseIsoDate(env.DATA_AS_OF_DATE);
