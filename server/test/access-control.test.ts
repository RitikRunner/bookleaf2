import { describe, expect, it } from 'vitest';
import { accounts, signIn } from './helpers.js';

async function firstTicketIdOf(email: string): Promise<string> {
  const author = await signIn(email);
  const res = await author.get('/api/v1/tickets').expect(200);
  return res.body.data[0].id;
}

describe('role-based access control', () => {
  it('authors only see their own books', async () => {
    const priya = await signIn(accounts.priya);
    const res = await priya.get('/api/v1/books').expect(200);
    expect(res.body.data.map((book: { id: string }) => book.id).sort()).toEqual(['BK001', 'BK002']);
  });

  it("ignores an author's attempt to list another author's books", async () => {
    const priya = await signIn(accounts.priya);
    const res = await priya.get('/api/v1/books?authorId=AUTH002').expect(200);
    expect(res.body.data.every((book: { id: string }) => ['BK001', 'BK002'].includes(book.id))).toBe(true);
  });

  it("returns 404 (not 403) for another author's book, profile or ticket, so ids can't be probed", async () => {
    const rohitTicketId = await firstTicketIdOf(accounts.rohit);
    const priya = await signIn(accounts.priya);

    await priya.get('/api/v1/books/BK003').expect(404);
    await priya.get('/api/v1/authors/AUTH002').expect(404);
    await priya.get(`/api/v1/tickets/${rohitTicketId}`).expect(404);
    await priya.post(`/api/v1/tickets/${rohitTicketId}/messages`).send({ body: 'Hello' }).expect(404);
  });

  it('keeps internal fields out of the author view of a ticket', async () => {
    const kavita = await signIn(accounts.kavita);
    const res = await kavita.get('/api/v1/tickets').expect(200);
    for (const ticket of res.body.data) {
      for (const field of ['priority', 'category', 'ai', 'aiStatus', 'assignee', 'internalNotes']) {
        expect(ticket).not.toHaveProperty(field);
      }
    }
  });

  it('blocks authors from admin-only actions', async () => {
    const ticketId = await firstTicketIdOf(accounts.priya);
    const priya = await signIn(accounts.priya);

    await priya.patch(`/api/v1/tickets/${ticketId}`).send({ priority: 'CRITICAL' }).expect(403);
    await priya.get(`/api/v1/tickets/${ticketId}/notes`).expect(403);
    await priya.post(`/api/v1/tickets/${ticketId}/notes`).send({ body: 'Sneaky' }).expect(403);
    await priya.get('/api/v1/authors').expect(403);
  });

  it('blocks admins from raising tickets as an author', async () => {
    const admin = await signIn(accounts.admin);
    await admin
      .post('/api/v1/tickets')
      .send({ subject: 'Admin ticket', description: 'Admins should not be able to create author tickets.' })
      .expect(403);
  });

  it('lets admins see every ticket, author and book', async () => {
    const admin = await signIn(accounts.admin);
    const tickets = await admin.get('/api/v1/tickets?pageSize=100').expect(200);
    const authorIds = new Set(tickets.body.data.map((ticket: { author: { id: string } }) => ticket.author.id));
    expect(authorIds.size).toBeGreaterThan(1);

    const authors = await admin.get('/api/v1/authors').expect(200);
    expect(authors.body.data).toHaveLength(10);

    const books = await admin.get('/api/v1/books').expect(200);
    expect(books.body.data).toHaveLength(18);
  });
});
