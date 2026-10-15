import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { accounts, app, signIn } from './helpers.js';

const validTicket = {
  bookId: 'BK001',
  subject: 'Question about my latest royalty statement',
  description: 'The royalty statement for last quarter looks different from what I expected. Could you explain it?',
};

describe('creating tickets', () => {
  it('creates a ticket about one of the author’s books', async () => {
    const priya = await signIn(accounts.priya);
    const res = await priya.post('/api/v1/tickets').send(validTicket).expect(201);

    expect(res.body.data).toMatchObject({
      reference: expect.stringMatching(/^BL-\d{4,}$/),
      status: { code: 'OPEN', label: 'Open' },
      book: { id: 'BK001', title: 'Whispers of the Ganges' },
      messages: [],
    });
  });

  it('accepts general, account-level tickets with attachment metadata', async () => {
    const priya = await signIn(accounts.priya);
    const res = await priya
      .post('/api/v1/tickets')
      .send({
        bookId: null,
        subject: 'Updating my bank account',
        description: 'I have changed banks and need to update the account my royalties are paid into.',
        attachment: { fileName: 'cancelled-cheque.pdf', fileSize: 120_000, mimeType: 'application/pdf' },
      })
      .expect(201);
    expect(res.body.data.book).toBeNull();
    expect(res.body.data.attachment).toEqual({ fileName: 'cancelled-cheque.pdf', fileSize: 120_000, mimeType: 'application/pdf' });
  });

  it('returns field-level validation errors', async () => {
    const priya = await signIn(accounts.priya);
    const res = await priya
      .post('/api/v1/tickets')
      .send({ subject: 'Hi', description: 'Too short', attachment: { fileName: 'a.exe', fileSize: 10, mimeType: 'application/x-msdownload' } })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((issue: { field: string }) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(['body.subject', 'body.description', 'body.attachment.mimeType']));
  });

  it("rejects a ticket about another author's book", async () => {
    const priya = await signIn(accounts.priya);
    const res = await priya.post('/api/v1/tickets').send({ ...validTicket, bookId: 'BK003' }).expect(400);
    expect(res.body.error.details).toEqual([{ field: 'body.bookId', message: 'This book is not in your catalogue' }]);
  });

  it('rejects malformed JSON with a clear error', async () => {
    const priya = await signIn(accounts.priya);
    const res = await priya.post('/api/v1/tickets').set('Content-Type', 'application/json').send('{"subject": ').expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('ticket lifecycle', () => {
  it('admin reply moves the ticket to In Progress, claims it, and is visible to the author', async () => {
    const priya = await signIn(accounts.priya);
    const created = await priya.post('/api/v1/tickets').send(validTicket).expect(201);
    const ticketId = created.body.data.id;

    const admin = await signIn(accounts.admin);
    await admin.post(`/api/v1/tickets/${ticketId}/messages`).send({ body: 'Hi Priya, happy to explain.' }).expect(201);

    const adminView = await admin.get(`/api/v1/tickets/${ticketId}`).expect(200);
    expect(adminView.body.data).toMatchObject({
      status: { code: 'IN_PROGRESS' },
      assignee: { name: 'Neha Verma' },
      firstResponseAt: expect.any(String),
    });

    const authorView = await priya.get(`/api/v1/tickets/${ticketId}`).expect(200);
    expect(authorView.body.data.messages).toEqual([
      expect.objectContaining({ body: 'Hi Priya, happy to explain.', sender: { name: 'Neha Verma', role: 'ADMIN' } }),
    ]);
  });

  it('send-and-resolve, then an author reply reopens the ticket', async () => {
    const priya = await signIn(accounts.priya);
    const ticketId = (await priya.post('/api/v1/tickets').send(validTicket).expect(201)).body.data.id;

    const admin = await signIn(accounts.admin);
    await admin.post(`/api/v1/tickets/${ticketId}/messages`).send({ body: 'All sorted.', status: 'RESOLVED' }).expect(201);
    expect((await admin.get(`/api/v1/tickets/${ticketId}`)).body.data.resolvedAt).not.toBeNull();

    await priya.post(`/api/v1/tickets/${ticketId}/messages`).send({ body: 'Actually, one more question.' }).expect(201);
    const reopened = await admin.get(`/api/v1/tickets/${ticketId}`).expect(200);
    expect(reopened.body.data).toMatchObject({ status: { code: 'OPEN' }, resolvedAt: null });
  });

  it('authors cannot reply to a closed ticket', async () => {
    const priya = await signIn(accounts.priya);
    const ticketId = (await priya.post('/api/v1/tickets').send(validTicket).expect(201)).body.data.id;

    const admin = await signIn(accounts.admin);
    await admin.patch(`/api/v1/tickets/${ticketId}`).send({ status: 'CLOSED' }).expect(200);

    const res = await priya.post(`/api/v1/tickets/${ticketId}/messages`).send({ body: 'Hello?' }).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('admin overrides are recorded with their source', async () => {
    const priya = await signIn(accounts.priya);
    const ticketId = (await priya.post('/api/v1/tickets').send(validTicket).expect(201)).body.data.id;

    const admin = await signIn(accounts.admin);
    const res = await admin
      .patch(`/api/v1/tickets/${ticketId}`)
      .send({ category: 'ROYALTY_PAYMENTS', priority: 'HIGH', assigneeId: null })
      .expect(200);
    expect(res.body.data.category).toEqual({ code: 'ROYALTY_PAYMENTS', label: 'Royalty & Payments', source: 'ADMIN' });
    expect(res.body.data.priority).toEqual({ code: 'HIGH', label: 'High', source: 'ADMIN' });
  });

  it('rejects an empty update and assignment to a non-admin', async () => {
    const admin = await signIn(accounts.admin);
    const ticketId = (await admin.get('/api/v1/tickets')).body.data[0].id;

    await admin.patch(`/api/v1/tickets/${ticketId}`).send({}).expect(400);

    const priya = await signIn(accounts.priya);
    const priyaUserId = (await priya.get('/api/v1/auth/me')).body.data.id;
    const res = await admin.patch(`/api/v1/tickets/${ticketId}`).send({ assigneeId: priyaUserId }).expect(400);
    expect(res.body.error.details[0].field).toBe('body.assigneeId');
  });
});

describe('internal notes', () => {
  it('are visible to admins and never appear in the author view', async () => {
    const priya = await signIn(accounts.priya);
    const ticketId = (await priya.post('/api/v1/tickets').send(validTicket).expect(201)).body.data.id;

    const admin = await signIn(accounts.admin);
    await admin.post(`/api/v1/tickets/${ticketId}/notes`).send({ body: 'Check with finance before replying.' }).expect(201);

    const notes = await admin.get(`/api/v1/tickets/${ticketId}/notes`).expect(200);
    expect(notes.body.data).toEqual([expect.objectContaining({ body: 'Check with finance before replying.' })]);

    const authorView = await priya.get(`/api/v1/tickets/${ticketId}`).expect(200);
    expect(JSON.stringify(authorView.body)).not.toContain('Check with finance');
  });
});

describe('admin queue', () => {
  it('filters by status and paginates', async () => {
    const admin = await signIn(accounts.admin);
    const res = await admin.get('/api/v1/tickets?status=IN_PROGRESS,RESOLVED&pageSize=1').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(['IN_PROGRESS', 'RESOLVED']).toContain(res.body.data[0].status.code);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 1 });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('filters by assignee', async () => {
    const support = await signIn(accounts.support);
    const res = await support.get('/api/v1/tickets?assignee=me').expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((ticket: { assignee: { name: string } }) => ticket.assignee.name === 'Karan Mehta')).toBe(true);
  });

  it('rejects invalid filters, pointing at the offending value', async () => {
    const admin = await signIn(accounts.admin);
    const badPriority = await admin.get('/api/v1/tickets?priority=HIGH,URGENT').expect(400);
    expect(badPriority.body.error.details[0].field).toBe('query.priority.1');

    const badRange = await admin.get('/api/v1/tickets?from=2026-02-01&to=2026-01-01').expect(400);
    expect(badRange.body.error.details[0]).toEqual({ field: 'query.from', message: '`from` must be on or before `to`' });
  });
});

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const res = await request(app).get('/api/v1/nope').expect(401); // auth runs before routing for API paths
    expect(res.body.error.code).toBe('UNAUTHORIZED');

    const admin = await signIn(accounts.admin);
    const signedIn = await admin.get('/api/v1/nope').expect(404);
    expect(signedIn.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
