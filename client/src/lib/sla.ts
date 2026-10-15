import type { AdminTicketSummary, TicketPriority } from '../api/types';
import { hoursSince } from './format';

/**
 * First-response targets by priority. These are a product assumption (BookLeaf's brief gives no SLA), chosen to
 * match its own language: urgent issues within the working day, escalations "within 48 hours".
 */
export const FIRST_RESPONSE_TARGET_HOURS: Record<TicketPriority, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 48,
  LOW: 72,
};

/** True when an unanswered, unresolved ticket has waited longer than its priority allows. */
export function isResponseOverdue(ticket: AdminTicketSummary, now = Date.now()): boolean {
  if (ticket.firstResponseAt || ticket.status.code === 'RESOLVED' || ticket.status.code === 'CLOSED') return false;
  const target = FIRST_RESPONSE_TARGET_HOURS[ticket.priority?.code ?? 'MEDIUM'];
  return hoursSince(ticket.createdAt, now) > target;
}
