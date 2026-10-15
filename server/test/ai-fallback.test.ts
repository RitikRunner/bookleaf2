import { describe, expect, it } from 'vitest';
import { accounts, signIn, waitFor } from './helpers.js';

// The test environment runs with AI_ENABLED=false: the portal must stay fully usable without the AI.
describe('when the AI is unavailable', () => {
  it('still creates the ticket and classifies it with keyword rules', async () => {
    const rohit = await signIn(accounts.rohit);
    const created = await rohit
      .post('/api/v1/tickets')
      .send({
        bookId: 'BK003',
        subject: 'Wrong ISBN on Amazon',
        description: 'The ISBN on the Amazon listing does not match the ISBN printed on my book.',
      })
      .expect(201);

    const admin = await signIn(accounts.admin);
    const ticket = await waitFor(
      async () => (await admin.get(`/api/v1/tickets/${created.body.data.id}`)).body.data,
      (data) => data.ai.status === 'FALLBACK',
    );
    expect(ticket.category).toMatchObject({ code: 'ISBN_METADATA', source: 'RULES' });
    expect(ticket.priority).toMatchObject({ code: 'HIGH', source: 'RULES' });
    expect(ticket.ai).toMatchObject({ category: null, lastError: 'disabled', attempts: 0 });
    expect(ticket.ai.reasoning).toMatch(/^Keyword rules/);
  });

  it('returns 503 AI_UNAVAILABLE for a draft, so the UI switches to manual writing', async () => {
    const admin = await signIn(accounts.admin);
    const ticketId = (await admin.get('/api/v1/tickets')).body.data[0].id;
    const res = await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(503);
    expect(res.body.error).toMatchObject({ code: 'AI_UNAVAILABLE', details: { reason: 'disabled' } });
  });

  it('lets admins re-run classification on demand', async () => {
    const admin = await signIn(accounts.admin);
    const ticketId = (await admin.get('/api/v1/tickets')).body.data[0].id;
    const res = await admin.post(`/api/v1/tickets/${ticketId}/classification`).expect(200);
    expect(res.body.data.category).not.toBeNull();
  });

  it('blocks sending a reply that still contains a [CONFIRM: …] placeholder', async () => {
    const admin = await signIn(accounts.admin);
    const ticketId = (await admin.get('/api/v1/tickets')).body.data[0].id;
    const res = await admin
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .send({ body: 'Your reprint ships on [CONFIRM: dispatch date].' })
      .expect(400);
    expect(res.body.error.details[0].field).toBe('body.body');
  });

  it('reports AI status and triage stats to admins only', async () => {
    const admin = await signIn(accounts.admin);
    const res = await admin.get('/api/v1/ai/metrics').expect(200);
    expect(res.body.data.status).toMatchObject({ enabled: false, circuit: 'closed' });
    expect(res.body.data.classification.byRules).toBeGreaterThan(0);

    const priya = await signIn(accounts.priya);
    await priya.get('/api/v1/ai/metrics').expect(403);
    await priya.get(`/api/v1/tickets/${(await priya.get('/api/v1/tickets')).body.data[0].id}/draft`).expect(403);
  });
});
