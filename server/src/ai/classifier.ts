import { AiStatus, ClassificationSource, type AiConfidence, type Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { realtimeHub } from '../realtime/hub.js';
import { AiUnavailableError, type AiFailureReason } from './errors.js';
import { generateStructured, type StructuredRequest } from './gateway.js';
import { buildClassificationPrompt, CLASSIFICATION_PROMPT_VERSION, classificationSchema } from './prompts/classification.js';
import { applyPolicyFloors, classifyByRules, type Triage } from './rules.js';
import { loadTicketContext, type TicketContext } from './ticketContext.js';

interface Decision extends Triage {
  source: 'AI' | 'RULES';
  confidence: AiConfidence | null;
  /** Why the AI wasn't used, when it wasn't. */
  aiFailure: AiFailureReason | null;
}

/**
 * Classifies a ticket's category and priority. Uses the AI model when it is available and keyword rules when it
 * isn't, then applies BookLeaf's policy floors. Never overwrites a value an admin has set by hand.
 */
export async function classifyTicket(ticketId: string): Promise<void> {
  const context = await loadTicketContext(ticketId);
  if (!context) return;

  const { ticket, royalty } = context;
  const decision = await decide(context);
  const final = applyPolicyFloors(decision, { text: `${ticket.subject}\n${ticket.description}`, payoutState: royalty.payoutState });

  // A failed re-run must not erase an earlier successful AI classification.
  if (decision.source === 'RULES' && ticket.aiStatus === AiStatus.COMPLETED) {
    await prisma.ticket.update({ where: { id: ticketId }, data: { aiLastError: decision.aiFailure } });
    return;
  }

  const aiAttempted = decision.aiFailure !== 'disabled' && decision.aiFailure !== 'circuit_open';
  const source = decision.source === 'AI' ? ClassificationSource.AI : ClassificationSource.RULES;
  const categoryNotOverridden: Prisma.TicketWhereInput = {
    id: ticketId,
    OR: [{ categorySource: null }, { categorySource: { not: ClassificationSource.ADMIN } }],
  };
  const priorityNotOverridden: Prisma.TicketWhereInput = {
    id: ticketId,
    OR: [{ prioritySource: null }, { prioritySource: { not: ClassificationSource.ADMIN } }],
  };

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        aiStatus: decision.source === 'AI' ? AiStatus.COMPLETED : AiStatus.FALLBACK,
        aiCategory: decision.source === 'AI' ? decision.category : null,
        aiPriority: decision.source === 'AI' ? decision.priority : null,
        aiConfidence: decision.confidence,
        aiReasoning: final.reasoning,
        aiLastError: decision.aiFailure,
        ...(aiAttempted && { aiAttempts: { increment: 1 } }),
      },
    }),
    // Conditional updates, so an admin override made while this ran is never overwritten.
    prisma.ticket.updateMany({
      where: categoryNotOverridden,
      data: { category: final.category, categorySource: source },
    }),
    prisma.ticket.updateMany({
      where: priorityNotOverridden,
      data: { priority: final.priority, prioritySource: source },
    }),
  ]);
  realtimeHub.publish({ ticketId, authorId: ticket.authorId, reason: 'triage' }, 'admins');
}

/** The exact request production sends. The offline eval reuses it, so it measures what actually runs. */
export function classificationRequest(context: TicketContext): StructuredRequest<typeof classificationSchema> {
  const { system, prompt } = buildClassificationPrompt(context);
  return {
    operation: 'CLASSIFY',
    model: env.AI_CLASSIFY_MODEL,
    promptVersion: CLASSIFICATION_PROMPT_VERSION,
    system,
    prompt,
    schema: classificationSchema,
    // Short structured answer. Low thinking keeps it fast; thinking tokens count toward the output limit.
    maxOutputTokens: 2048,
    thinking: 'low',
    timeoutMs: 15_000,
    maxRetries: 2,
    ticketId: context.ticket.id,
  };
}

async function decide(context: TicketContext): Promise<Decision> {
  const { ticket } = context;
  try {
    const { output } = await generateStructured(classificationRequest(context));
    return { ...output, source: 'AI', aiFailure: null };
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) throw error;
    const rules = classifyByRules(`${ticket.subject}\n${ticket.description}`);
    return { ...rules, source: 'RULES', confidence: null, aiFailure: error.reason };
  }
}
