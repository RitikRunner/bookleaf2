import type { TicketCategory, TicketPriority } from '@prisma/client';
import { CATEGORY_LABELS, PRIORITY_LABELS } from '../domain/labels.js';
import type { PayoutState } from '../domain/royalty.js';

/*
 * Deterministic triage used in two ways:
 * 1. classifyByRules: a keyword fallback when the AI is unavailable, so tickets still get a sensible place in
 *    the queue. It is retried with AI once the service is back.
 * 2. applyPolicyFloors: BookLeaf policies that hold whoever classified the ticket (AI or rules).
 */

type Signal = [pattern: RegExp, weight: number];

// Weighted keyword signals. An explicit mention of an ISBN almost always means an ISBN issue, so it outweighs
// the platform names that usually appear alongside it.
const CATEGORY_SIGNALS: Record<TicketCategory, Signal[]> = {
  ISBN_METADATA: [
    [/\bisbn\b/i, 5],
    [/\bmetadata\b|\bimprint\b/i, 2],
    [/(wrong|incorrect|misspel\w*) (title|author name|name|price|cover)/i, 2],
  ],
  ROYALTY_PAYMENTS: [
    [/royalt/i, 2],
    [/payout|payment|\bpaid\b|\bearning/i, 1],
    [/\bbank\b|\bstatement\b|\btax\b/i, 1],
  ],
  PRINTING_QUALITY: [
    [/print(ing)? quality|misprint|reprint/i, 2],
    [/blurr|smudg|faded|misalign|binding|torn|loose pages|colou?r (is|looks|inconsisten)/i, 2],
    [/author copies|printed copies|copies arrived/i, 1],
  ],
  DISTRIBUTION_AVAILABILITY: [
    [/unavailable|not available|out of stock|can'?t (find|order|buy)|couldn'?t (find|order|buy)/i, 2],
    [/\b(listing|listed)\b/i, 1],
    [/amazon|flipkart|bookleaf store/i, 1],
  ],
  BOOK_STATUS_PRODUCTION: [
    [/typesetting|proofread|cover design|cover concept|editing|manuscript/i, 2],
    [/in production|production (status|stage)|\bstuck\b|\bdelay/i, 1],
    [/when will (it|my book) be (done|published|ready|live)/i, 1],
  ],
  GENERAL_INQUIRY: [
    [/\bbio\b|author page|author photo|headshot|profile/i, 2],
    [/update (my|the) (description|bio|photo|email|details)|change my (email|password)/i, 2],
    [/package|bestseller breakthrough|standard free/i, 2],
  ],
};

// When scores tie, prefer the more specific category.
const TIE_BREAK_ORDER: TicketCategory[] = [
  'ISBN_METADATA',
  'PRINTING_QUALITY',
  'ROYALTY_PAYMENTS',
  'BOOK_STATUS_PRODUCTION',
  'DISTRIBUTION_AVAILABILITY',
  'GENERAL_INQUIRY',
];

const DEFAULT_PRIORITY: Record<TicketCategory, TicketPriority> = {
  ISBN_METADATA: 'HIGH',
  PRINTING_QUALITY: 'HIGH',
  ROYALTY_PAYMENTS: 'MEDIUM',
  DISTRIBUTION_AVAILABILITY: 'MEDIUM',
  BOOK_STATUS_PRODUCTION: 'MEDIUM',
  GENERAL_INQUIRY: 'LOW',
};

const PRIORITY_ORDER: TicketPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export interface Triage {
  category: TicketCategory;
  priority: TicketPriority;
  reasoning: string;
}

export function classifyByRules(text: string): Triage {
  const scores = TIE_BREAK_ORDER.map((category) => ({
    category,
    score: CATEGORY_SIGNALS[category].reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0),
  }));
  // Stable sort keeps the tie-break order among equal scores.
  const best = [...scores].sort((a, b) => b.score - a.score)[0];
  const category = best && best.score > 0 ? best.category : 'GENERAL_INQUIRY';

  return {
    category,
    priority: DEFAULT_PRIORITY[category],
    reasoning:
      best && best.score > 0
        ? `Keyword rules (AI unavailable): wording points to ${CATEGORY_LABELS[category]}.`
        : 'Keyword rules (AI unavailable): no specific signals, filed as a general inquiry.',
  };
}

const ISBN_ERROR = /\bisbn\b[\s\S]*\b(wrong|different|incorrect|mismatch|duplicate|error|does ?n[o']t match|not match)|\b(wrong|different|incorrect|duplicate)\b[\s\S]*\bisbn\b/i;

/** Raises priority where BookLeaf policy sets a minimum. Never lowers it. */
export function applyPolicyFloors(
  triage: Triage,
  context: { text: string; payoutState: PayoutState },
): Triage {
  const floors: [applies: boolean, minimum: TicketPriority, reason: string][] = [
    [
      triage.category === 'ISBN_METADATA' && ISBN_ERROR.test(context.text),
      'HIGH',
      'BookLeaf policy treats ISBN errors as high priority',
    ],
    [
      triage.category === 'ROYALTY_PAYMENTS' && context.payoutState === 'NEEDS_REVIEW',
      'HIGH',
      'the balance is above ₹1,000 with no payout for the last closed cycle',
    ],
  ];

  for (const [applies, minimum, reason] of floors) {
    if (applies && PRIORITY_ORDER.indexOf(triage.priority) > PRIORITY_ORDER.indexOf(minimum)) {
      return {
        ...triage,
        priority: minimum,
        reasoning: `${triage.reasoning} Raised to ${PRIORITY_LABELS[minimum]}: ${reason}.`,
      };
    }
  }
  return triage;
}
