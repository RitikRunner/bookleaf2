import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();

export const AUTHOR_PASSWORD = process.env.SEED_AUTHOR_PASSWORD ?? 'Author@123';
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

export const accounts = {
  priya: 'priya.sharma@email.com', // AUTH001
  rohit: 'rohit.kapoor@email.com', // AUTH002
  kavita: 'kavita.deshmukh@email.com', // AUTH009: book in production + balance below ₹1,000
  admin: 'admin@bookleaf.test',
  support: 'support@bookleaf.test',
} as const;

/** Polls until `predicate` holds, for work that finishes in the background (e.g. ticket classification). */
export async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (predicate(value)) return value;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** A supertest agent that keeps the session cookie between requests. */
export async function signIn(email: string) {
  const password = email.endsWith('@bookleaf.test') ? ADMIN_PASSWORD : AUTHOR_PASSWORD;
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  return agent;
}
