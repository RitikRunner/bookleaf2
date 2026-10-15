import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { accounts, app, AUTHOR_PASSWORD, signIn } from './helpers.js';

describe('authentication', () => {
  it('rejects API calls without a session', async () => {
    const res = await request(app).get('/api/v1/tickets').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a tampered session cookie', async () => {
    await request(app).get('/api/v1/books').set('Cookie', 'bl_session=not-a-real-token').expect(401);
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@email.com', password: AUTHOR_PASSWORD })
      .expect(401);
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: accounts.priya, password: 'wrong-password' })
      .expect(401);
    expect(unknown.body).toEqual(wrongPassword.body);
  });

  it('validates the login payload', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((issue: { field: string }) => issue.field)).toEqual(['body.email', 'body.password']);
  });

  it('sets an httpOnly session cookie and returns the profile', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'Priya.Sharma@email.com', password: AUTHOR_PASSWORD }) // email is case-insensitive
      .expect(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/bl_session=.+HttpOnly/);
    expect(res.body.data).toMatchObject({ email: accounts.priya, role: 'AUTHOR', authorId: 'AUTH001' });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('returns the current user from /auth/me', async () => {
    const admin = await signIn(accounts.admin);
    const res = await admin.get('/api/v1/auth/me').expect(200);
    expect(res.body.data).toMatchObject({ role: 'ADMIN', authorId: null, name: 'Neha Verma' });
  });

  it('logs out by clearing the cookie', async () => {
    const author = await signIn(accounts.priya);
    await author.post('/api/v1/auth/logout').expect(204);
    await author.get('/api/v1/auth/me').expect(401);
  });
});
