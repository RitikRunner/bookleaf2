import { ApiError } from '@google/genai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiCircuitBreaker } from '../src/ai/circuitBreaker.js';
import { estimateCostMicroUsd } from '../src/ai/pricing.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { accounts, signIn, waitFor } from './helpers.js';

/*
 * The full AI flow against a fake Gemini client: no network, no cost, and every failure mode reproducible.
 * The fake replaces `getAiClient`, the only place the real SDK client is created.
 */

type Params = {
  contents: string;
  config: { systemInstruction: string; responseJsonSchema: { properties: object } };
};
type Handler = (params: Params) => unknown;

const fake = vi.hoisted(() => ({ calls: [] as Params[], handler: null as Handler | null }));

vi.mock('../src/ai/client.js', () => ({
  getAiClient: () => ({
    models: {
      generateContent: async (params: Params) => {
        fake.calls.push(params);
        return fake.handler!(params);
      },
    },
  }),
}));

const isDraftCall = (params: Params) => 'reply' in params.config.responseJsonSchema.properties;
const draftCalls = () => fake.calls.filter(isDraftCall);

// Gemini reports cached tokens inside promptTokenCount, and thinking separately from the answer.
const usageMetadata = { promptTokenCount: 1400, cachedContentTokenCount: 600, candidatesTokenCount: 80, thoughtsTokenCount: 40 };

function geminiResponse(output: object | null, finishReason = 'STOP') {
  return { text: output ? JSON.stringify(output) : undefined, candidates: [{ finishReason }], usageMetadata };
}

function respondWith(classification: object, draft?: object): Handler {
  return (params) =>
    geminiResponse(
      isDraftCall(params)
        ? (draft ?? {
            reply: 'Hi Rohit,\n\nThank you for flagging this.\n\nWarm regards,\nBookLeaf Author Support',
            adminNotes: ['Escalate to production'],
            suggestedStatus: 'IN_PROGRESS',
            escalateTo: 'PRODUCTION',
          })
        : classification,
    );
}

const isbnClassification = {
  reasoning: 'ISBN on the listing differs from the printed copy.',
  category: 'ISBN_METADATA',
  priority: 'MEDIUM', // deliberately below policy, to show the floor is applied
  confidence: 'HIGH',
};

async function raiseIsbnTicket() {
  const rohit = await signIn(accounts.rohit);
  const res = await rohit
    .post('/api/v1/tickets')
    .send({
      bookId: 'BK004',
      subject: 'ISBN mismatch on Amazon',
      description: 'The ISBN shown on Amazon is different from the one printed on Startup Sutra.',
    })
    .expect(201);
  return { rohit, ticketId: res.body.data.id as string };
}

async function adminView(ticketId: string) {
  const admin = await signIn(accounts.admin);
  return (await admin.get(`/api/v1/tickets/${ticketId}`)).body.data;
}

beforeEach(() => {
  fake.calls = [];
  fake.handler = respondWith(isbnClassification);
});

afterEach(() => aiCircuitBreaker.recordSuccess());

describe('AI classification', () => {
  it('stores the AI result, applies policy floors, and keeps the original AI output', async () => {
    const { ticketId } = await raiseIsbnTicket();
    const ticket = await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'COMPLETED');

    expect(ticket.category).toMatchObject({ code: 'ISBN_METADATA', source: 'AI' });
    expect(ticket.priority).toMatchObject({ code: 'HIGH', source: 'AI' }); // raised from MEDIUM by policy
    expect(ticket.ai).toMatchObject({ category: 'ISBN_METADATA', priority: 'MEDIUM', confidence: 'HIGH', attempts: 1 });
    expect(ticket.ai.reasoning).toContain('Raised to High');
  });

  it('constrains the response with a JSON schema and keeps author text out of the system instructions', async () => {
    const { ticketId } = await raiseIsbnTicket();
    await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'COMPLETED');

    const call = fake.calls[0]!;
    expect(call.config.responseJsonSchema.properties).toHaveProperty('category');
    expect(call.config.systemInstruction).not.toContain('Startup Sutra');
    expect(call.contents).toContain('Startup Sutra');
  });

  it('logs tokens and estimated cost for every call', async () => {
    const { ticketId } = await raiseIsbnTicket();
    await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'COMPLETED');

    const log = await prisma.aiUsageLog.findFirstOrThrow({ where: { ticketId, operation: 'CLASSIFY' } });
    const tokens = { inputTokens: 800, outputTokens: 120, cacheReadTokens: 600 };
    expect(log).toMatchObject({ success: true, ...tokens, costMicroUsd: estimateCostMicroUsd(env.AI_CLASSIFY_MODEL, tokens) });
    expect(log.costMicroUsd).toBeGreaterThan(0);
  });

  it('never overwrites an admin override when classification is re-run', async () => {
    const { ticketId } = await raiseIsbnTicket();
    await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'COMPLETED');

    const admin = await signIn(accounts.admin);
    await admin.patch(`/api/v1/tickets/${ticketId}`).send({ category: 'DISTRIBUTION_AVAILABILITY' }).expect(200);
    const rerun = await admin.post(`/api/v1/tickets/${ticketId}/classification`).expect(200);

    expect(rerun.body.data.category).toMatchObject({ code: 'DISTRIBUTION_AVAILABILITY', source: 'ADMIN' });
    expect(rerun.body.data.ai.category).toBe('ISBN_METADATA');
  });
});

describe('AI drafts', () => {
  it('generates once, then serves from cache until the ticket changes', async () => {
    const { ticketId } = await raiseIsbnTicket();
    await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'COMPLETED');
    const admin = await signIn(accounts.admin);

    const first = await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(200);
    expect(first.body.data).toMatchObject({ freshness: 'GENERATED', escalateTo: 'PRODUCTION', placeholders: [] });

    const second = await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(200);
    expect(second.body.data).toMatchObject({ id: first.body.data.id, freshness: 'CACHED' });
    expect(draftCalls()).toHaveLength(1);

    // New context (an internal note) → a new draft.
    await admin.post(`/api/v1/tickets/${ticketId}/notes`).send({ body: 'Production confirmed the Amazon feed is wrong.' });
    const third = await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(200);
    expect(third.body.data.freshness).toBe('GENERATED');
    expect(draftCalls()).toHaveLength(2);

    // Explicit regenerate always calls the model.
    await admin.post(`/api/v1/tickets/${ticketId}/draft`).expect(201);
    expect(draftCalls()).toHaveLength(3);
  });

  it('sends only the knowledge base for the ticket category, after the shared instructions', async () => {
    const { ticketId } = await raiseIsbnTicket();
    await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'COMPLETED');
    const admin = await signIn(accounts.admin);
    await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(200);

    const system = draftCalls()[0]!.config.systemInstruction;
    expect(system.startsWith('You are a member of BookLeaf')).toBe(true);
    expect(system).toContain('## ISBN policy');
    expect(system).not.toContain('## Printing and quality');
  });

  it('records whether a draft was sent as written or edited', async () => {
    const { ticketId } = await raiseIsbnTicket();
    await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'COMPLETED');
    const admin = await signIn(accounts.admin);
    const draft = (await admin.get(`/api/v1/tickets/${ticketId}/draft`)).body.data;

    await admin.post(`/api/v1/tickets/${ticketId}/messages`).send({ body: draft.reply, draftId: draft.id }).expect(201);
    await admin
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .send({ body: `${draft.reply}\nP.S. One more thing.`, draftId: draft.id })
      .expect(201);

    const messages = await prisma.ticketMessage.findMany({ where: { ticketId, aiDraftId: draft.id }, orderBy: { createdAt: 'asc' } });
    expect(messages.map((message) => message.draftEdited)).toEqual([false, true]);
  });
});

describe('AI failures', () => {
  it('falls back to rules when the API is unreachable, and records why', async () => {
    fake.handler = () => {
      throw new TypeError('fetch failed');
    };
    const { ticketId } = await raiseIsbnTicket();
    const ticket = await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'FALLBACK');

    expect(ticket.category).toMatchObject({ code: 'ISBN_METADATA', source: 'RULES' });
    expect(ticket.ai).toMatchObject({ lastError: 'connection', attempts: 1 });
    const log = await prisma.aiUsageLog.findFirstOrThrow({ where: { ticketId } });
    expect(log).toMatchObject({ success: false, errorType: 'connection' });
  });

  it('maps rate limiting to a clear reason', async () => {
    fake.handler = () => {
      throw new ApiError({ message: 'Resource has been exhausted', status: 429 });
    };
    const { ticketId } = await raiseIsbnTicket();
    const ticket = await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'FALLBACK');
    expect(ticket.ai.lastError).toBe('rate_limited');
  });

  it('treats a safety block as unusable output but still records the tokens it cost', async () => {
    fake.handler = () => geminiResponse(null, 'SAFETY');
    const { ticketId } = await raiseIsbnTicket();
    await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'FALLBACK');

    const log = await prisma.aiUsageLog.findFirstOrThrow({ where: { ticketId } });
    expect(log).toMatchObject({ success: false, errorType: 'refusal', inputTokens: 800 });
  });

  it('rejects output that does not match the schema', async () => {
    fake.handler = () => geminiResponse({ category: 'NOT_A_CATEGORY', priority: 'HIGH' });
    const { ticketId } = await raiseIsbnTicket();
    const ticket = await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'FALLBACK');
    expect(ticket.ai.lastError).toBe('invalid_output');
  });

  it('shows the previous draft, marked stale, if the AI fails after the conversation moved on', async () => {
    const { rohit, ticketId } = await raiseIsbnTicket();
    await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'COMPLETED');
    const admin = await signIn(accounts.admin);
    const original = (await admin.get(`/api/v1/tickets/${ticketId}/draft`)).body.data;

    await rohit.post(`/api/v1/tickets/${ticketId}/messages`).send({ body: 'Any update on this?' }).expect(201);
    fake.handler = () => {
      throw new ApiError({ message: 'The model is overloaded', status: 503 });
    };

    const res = await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(200);
    expect(res.body.data).toMatchObject({ id: original.id, freshness: 'STALE' });
  });

  it('stops calling the API after repeated outages (circuit breaker)', async () => {
    fake.handler = () => {
      throw new DOMException('This operation was aborted', 'AbortError'); // how the SDK surfaces a timeout
    };
    const { ticketId } = await raiseIsbnTicket();
    const ticket = await waitFor(() => adminView(ticketId), (data) => data.ai.status === 'FALLBACK');
    expect(ticket.ai.lastError).toBe('timeout');

    const admin = await signIn(accounts.admin);
    await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(503);
    await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(503);
    const callsBeforeOpen = fake.calls.length;

    const res = await admin.get(`/api/v1/tickets/${ticketId}/draft`).expect(503);
    expect(res.body.error.details.reason).toBe('circuit_open');
    expect(fake.calls.length).toBe(callsBeforeOpen); // no call made while open

    const metrics = await admin.get('/api/v1/ai/metrics').expect(200);
    expect(metrics.body.data.status.circuit).toBe('open');
  });
});

describe('AI metrics', () => {
  it('summarises spend, corrections and draft usage', async () => {
    const admin = await signIn(accounts.admin);
    const res = await admin.get('/api/v1/ai/metrics').expect(200);
    const { usage: rows, classification, drafts } = res.body.data;

    const classify = rows.find((row: { operation: string }) => row.operation === 'CLASSIFY');
    expect(classify.calls).toBeGreaterThan(0);
    expect(classify.costUsd).toBeGreaterThan(0);
    expect(classification.categoryCorrections).toBeGreaterThanOrEqual(1); // the override test above
    expect(drafts.sentAsWritten).toBeGreaterThanOrEqual(1);
  });
});
