import { createHash } from 'node:crypto';
import type { AiDraft } from '@prisma/client';
import { env } from '../config/env.js';
import { NotFoundError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { AiUnavailableError } from './errors.js';
import { generateStructured, type StructuredRequest } from './gateway.js';
import { buildDraftPrompt, DRAFT_PROMPT_VERSION, draftSchema, findPlaceholders } from './prompts/draft.js';
import { loadTicketContext, type TicketContext } from './ticketContext.js';

/**
 * - GENERATED: written just now.
 * - CACHED: nothing the draft depends on has changed since it was written, so no new model call was needed.
 * - STALE: the AI is unavailable and the ticket has moved on since this draft was written. Shown with a warning.
 */
export type DraftFreshness = 'GENERATED' | 'CACHED' | 'STALE';

export function toDraftDto(draft: AiDraft, freshness: DraftFreshness) {
  return {
    id: draft.id,
    reply: draft.reply,
    adminNotes: draft.adminNotes,
    suggestedStatus: draft.suggestedStatus,
    escalateTo: draft.escalateTo,
    placeholders: findPlaceholders(draft.reply),
    model: draft.model,
    promptVersion: draft.promptVersion,
    createdAt: draft.createdAt.toISOString(),
    freshness,
  };
}

/**
 * Returns an AI-drafted reply for an admin.
 *
 * Drafts are cached under a hash of the exact prompt (model + prompt version + system + ticket context). Opening
 * a ticket twice costs one model call, and a new author message, a category change or a new internal note changes
 * the prompt and so produces a fresh draft. `regenerate` forces a new call.
 */
const SIGN_OFF = 'Warm regards,\nBookLeaf Author Support';

/** The sign-off is fixed text, so code guarantees its layout rather than relying on the model's spacing. */
export function normalizeSignOff(reply: string): string {
  return reply.replace(/\s*Warm regards,\s*BookLeaf Author Support\s*$/, `\n\n${SIGN_OFF}`);
}

/** The exact request production sends. The offline eval reuses it, so it measures what actually runs. */
export function draftRequest(context: TicketContext): StructuredRequest<typeof draftSchema> {
  const { system, prompt } = buildDraftPrompt(context);
  return {
    operation: 'DRAFT',
    model: env.AI_DRAFT_MODEL,
    promptVersion: DRAFT_PROMPT_VERSION,
    system,
    prompt,
    schema: draftSchema,
    // Low thinking matched medium on the draft eval (9/10 each) at about a quarter of the cost and 30% less latency.
    // The output limit leaves room for thinking plus a ~200-word reply; it is a ceiling, not a cost.
    maxOutputTokens: 8000,
    thinking: 'low',
    // An admin is waiting on this, so fail faster than background classification does.
    timeoutMs: 30_000,
    maxRetries: 1,
    ticketId: context.ticket.id,
  };
}

export async function getDraft(ticketId: string, options: { regenerate: boolean }) {
  const context = await loadTicketContext(ticketId);
  if (!context) throw new NotFoundError('Ticket');

  const request = draftRequest(context);
  const contextHash = createHash('sha256')
    .update(JSON.stringify({ model: request.model, version: request.promptVersion, system: request.system, prompt: request.prompt }))
    .digest('hex');

  if (!options.regenerate) {
    const cached = await prisma.aiDraft.findFirst({ where: { ticketId, contextHash }, orderBy: { createdAt: 'desc' } });
    if (cached) return toDraftDto(cached, 'CACHED');
  }

  try {
    const { output } = await generateStructured(request);
    const draft = await prisma.aiDraft.create({
      data: {
        ticketId,
        contextHash,
        ...output,
        reply: normalizeSignOff(output.reply),
        model: request.model,
        promptVersion: request.promptVersion,
      },
    });
    return toDraftDto(draft, 'GENERATED');
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) throw error;
    // Degrade gracefully: an older draft (clearly marked) is more useful than none. Without one, the 503 tells
    // the admin UI to switch to manual writing.
    const previous = await prisma.aiDraft.findFirst({ where: { ticketId }, orderBy: { createdAt: 'desc' } });
    if (!previous) throw error;
    return toDraftDto(previous, previous.contextHash === contextHash ? 'CACHED' : 'STALE');
  }
}
