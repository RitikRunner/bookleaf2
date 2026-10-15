import type { Prisma, Ticket } from '@prisma/client';
import { CATEGORY_LABELS, PRIORITY_LABELS, TICKET_STATUS_LABELS } from '../../domain/labels.js';

/*
 * Two views of a ticket. The author view is built from a query that never selects internal fields
 * (category, priority, AI output, assignee, notes), so nothing internal can reach an author by mistake.
 */

export const messageInclude = {
  sender: { select: { name: true, role: true } },
} satisfies Prisma.TicketMessageInclude;

export const noteInclude = {
  admin: { select: { id: true, name: true } },
} satisfies Prisma.InternalNoteInclude;

export const authorTicketInclude = {
  book: { select: { id: true, title: true } },
  messages: { orderBy: { createdAt: 'asc' }, include: messageInclude },
} satisfies Prisma.TicketInclude;

export const adminTicketListInclude = {
  book: { select: { id: true, title: true } },
  author: { select: { id: true, user: { select: { name: true } } } },
  assignee: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;

export const adminTicketInclude = {
  book: { select: { id: true, title: true } },
  author: { select: { id: true, user: { select: { name: true, email: true } } } },
  assignee: { select: { id: true, name: true } },
  messages: { orderBy: { createdAt: 'asc' }, include: messageInclude },
  notes: { orderBy: { createdAt: 'asc' }, include: noteInclude },
} satisfies Prisma.TicketInclude;

type MessageRecord = Prisma.TicketMessageGetPayload<{ include: typeof messageInclude }>;
type NoteRecord = Prisma.InternalNoteGetPayload<{ include: typeof noteInclude }>;
type AuthorTicketRecord = Prisma.TicketGetPayload<{ include: typeof authorTicketInclude }>;
type AdminTicketListRecord = Prisma.TicketGetPayload<{ include: typeof adminTicketListInclude }>;
type AdminTicketRecord = Prisma.TicketGetPayload<{ include: typeof adminTicketInclude }>;

/** Human-friendly ticket number shown to authors and admins, e.g. BL-0042. */
export function ticketReference(number: number): string {
  return `BL-${String(number).padStart(4, '0')}`;
}

const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

function attachmentDto(ticket: Ticket) {
  return ticket.attachmentName
    ? { fileName: ticket.attachmentName, fileSize: ticket.attachmentSize, mimeType: ticket.attachmentType }
    : null;
}

export function toMessageDto(message: MessageRecord) {
  return {
    id: message.id,
    body: message.body,
    sender: { name: message.sender.name, role: message.sender.role },
    createdAt: message.createdAt.toISOString(),
  };
}

export function toNoteDto(note: NoteRecord) {
  return { id: note.id, body: note.body, admin: note.admin, createdAt: note.createdAt.toISOString() };
}

export function toAuthorTicketDto(ticket: AuthorTicketRecord) {
  const lastMessage = ticket.messages.at(-1);
  return {
    id: ticket.id,
    reference: ticketReference(ticket.number),
    subject: ticket.subject,
    description: ticket.description,
    status: { code: ticket.status, label: TICKET_STATUS_LABELS[ticket.status] },
    book: ticket.book,
    attachment: attachmentDto(ticket),
    messages: ticket.messages.map(toMessageDto),
    createdAt: ticket.createdAt.toISOString(),
    // Based on visible activity only. `updatedAt` also moves on internal changes (priority, notes), which authors shouldn't see.
    lastActivityAt: (lastMessage?.createdAt ?? ticket.createdAt).toISOString(),
  };
}

function adminFields(ticket: AdminTicketListRecord | AdminTicketRecord) {
  return {
    id: ticket.id,
    reference: ticketReference(ticket.number),
    subject: ticket.subject,
    status: { code: ticket.status, label: TICKET_STATUS_LABELS[ticket.status] },
    category: ticket.category && {
      code: ticket.category,
      label: CATEGORY_LABELS[ticket.category],
      source: ticket.categorySource,
    },
    priority: ticket.priority && {
      code: ticket.priority,
      label: PRIORITY_LABELS[ticket.priority],
      source: ticket.prioritySource,
    },
    aiStatus: ticket.aiStatus,
    book: ticket.book,
    assignee: ticket.assignee,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    firstResponseAt: isoOrNull(ticket.firstResponseAt),
    resolvedAt: isoOrNull(ticket.resolvedAt),
  };
}

export function toAdminTicketSummaryDto(ticket: AdminTicketListRecord) {
  return {
    ...adminFields(ticket),
    author: { id: ticket.author.id, name: ticket.author.user.name },
    messageCount: ticket._count.messages,
  };
}

export function toAdminTicketDto(ticket: AdminTicketRecord) {
  return {
    ...adminFields(ticket),
    description: ticket.description,
    attachment: attachmentDto(ticket),
    author: { id: ticket.author.id, name: ticket.author.user.name, email: ticket.author.user.email },
    ai: {
      status: ticket.aiStatus,
      category: ticket.aiCategory,
      priority: ticket.aiPriority,
      confidence: ticket.aiConfidence,
      reasoning: ticket.aiReasoning,
      attempts: ticket.aiAttempts,
      lastError: ticket.aiLastError,
    },
    messages: ticket.messages.map(toMessageDto),
    internalNotes: ticket.notes.map(toNoteDto),
  };
}
