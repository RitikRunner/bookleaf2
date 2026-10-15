import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accounts, ADMIN_PASSWORD, app, AUTHOR_PASSWORD, waitFor } from './helpers.js';

type StreamEvent = { ticketId: string; reason: string };

let server: Server;
let baseUrl: string;
const openStreams: AbortController[] = [];

beforeAll(() => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  openStreams.forEach((controller) => controller.abort());
  await new Promise((resolve) => server.close(resolve));
});

async function sessionCookie(email: string): Promise<string> {
  const password = email.endsWith('@bookleaf.test') ? ADMIN_PASSWORD : AUTHOR_PASSWORD;
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return res.headers['set-cookie']![0]!.split(';')[0]!;
}

/** Opens the SSE stream over real HTTP and collects every event it receives. */
async function openStream(cookie: string) {
  const controller = new AbortController();
  openStreams.push(controller);
  const res = await fetch(`${baseUrl}/api/v1/events`, { headers: { cookie }, signal: controller.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');

  const events: StreamEvent[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const data = buffer.slice(0, boundary).split('\n').find((line) => line.startsWith('data: '));
          buffer = buffer.slice(boundary + 2);
          if (data) events.push(JSON.parse(data.slice('data: '.length)));
        }
      }
    } catch {
      // aborted at the end of the test
    }
  })();
  return events;
}

describe('real-time ticket events', () => {
  it('requires a session', async () => {
    const res = await fetch(`${baseUrl}/api/v1/events`);
    expect(res.status).toBe(401);
  });

  it('tells authors about replies on their own tickets only, and keeps internal changes for admins', async () => {
    const [priyaCookie, rohitCookie, adminCookie] = await Promise.all([
      sessionCookie(accounts.priya),
      sessionCookie(accounts.rohit),
      sessionCookie(accounts.admin),
    ]);
    const [priyaEvents, rohitEvents, adminEvents] = await Promise.all([
      openStream(priyaCookie),
      openStream(rohitCookie),
      openStream(adminCookie),
    ]);

    const created = await request(app)
      .post('/api/v1/tickets')
      .set('Cookie', priyaCookie)
      .send({ bookId: 'BK001', subject: 'Live update test', description: 'Checking that replies arrive without refreshing.' })
      .expect(201);
    const ticketId: string = created.body.data.id;

    await request(app).post(`/api/v1/tickets/${ticketId}/notes`).set('Cookie', adminCookie).send({ body: 'Internal only' }).expect(201);
    await request(app).post(`/api/v1/tickets/${ticketId}/messages`).set('Cookie', adminCookie).send({ body: 'Hi Priya!' }).expect(201);

    const forTicket = (events: StreamEvent[]) => events.filter((event) => event.ticketId === ticketId).map((event) => event.reason);

    await waitFor(async () => forTicket(priyaEvents), (reasons) => reasons.includes('reply'));
    await waitFor(async () => forTicket(adminEvents), (reasons) => reasons.includes('note') && reasons.includes('reply'));

    expect(forTicket(adminEvents)).toContain('created');
    expect(forTicket(priyaEvents)).not.toContain('note'); // internal notes never reach the author
    expect(forTicket(priyaEvents)).not.toContain('triage');
    expect(forTicket(rohitEvents)).toEqual([]); // nothing about another author's ticket
  });
});
