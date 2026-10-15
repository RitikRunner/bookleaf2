import type { Prisma } from '@prisma/client';
import { dataAsOfDate } from '../config/env.js';
import { summarizeRoyalties, type RoyaltySummary } from '../domain/royalty.js';
import { prisma } from '../lib/prisma.js';

/** How much conversation history goes into a prompt. Older messages rarely change the right reply. */
export const RECENT_MESSAGE_LIMIT = 4;
export const RECENT_NOTE_LIMIT = 3;

const aiTicketInclude = {
  book: true,
  author: { include: { user: { select: { name: true } }, books: true } },
  // Newest first, limited; reversed into chronological order when loaded.
  messages: {
    orderBy: { createdAt: 'desc' },
    take: RECENT_MESSAGE_LIMIT,
    include: { sender: { select: { name: true, role: true } } },
  },
  notes: { orderBy: { createdAt: 'desc' }, take: RECENT_NOTE_LIMIT, include: { admin: { select: { name: true } } } },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;

export type AiTicket = Prisma.TicketGetPayload<{ include: typeof aiTicketInclude }>;

/** Everything the AI features know about a ticket, including royalty facts calculated in code. */
export interface TicketContext {
  ticket: AiTicket;
  royalty: RoyaltySummary;
}

export async function loadTicketContext(ticketId: string): Promise<TicketContext | null> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: aiTicketInclude });
  if (!ticket) return null;
  ticket.messages.reverse();
  ticket.notes.reverse();
  return { ticket, royalty: summarizeRoyalties(ticket.author.books, dataAsOfDate) };
}
