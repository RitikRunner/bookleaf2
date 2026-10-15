import { ClassificationSource, TicketStatus, type Prisma } from '@prisma/client';
import { findPlaceholders } from '../../ai/prompts/draft.js';
import { enqueueClassification } from '../../jobs/classificationWorker.js';
import { prisma } from '../../lib/prisma.js';
import { realtimeHub } from '../../realtime/hub.js';
import { requireAuthorId } from '../../lib/access.js';
import { addDays, parseIsoDate } from '../../lib/dates.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import type { SessionUser } from '../../lib/session.js';
import * as dto from './tickets.dto.js';
import type {
  AdminMessageInput,
  AdminTicketListQuery,
  AuthorMessageInput,
  AuthorTicketListQuery,
  CreateTicketInput,
  NoteInput,
  UpdateTicketInput,
} from './tickets.schemas.js';

const ADMIN_SORTS = {
  // Unclassified tickets surface first (they need triage), then most urgent, then oldest.
  priority: [{ priority: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
  oldest: [{ createdAt: 'asc' }],
  newest: [{ createdAt: 'desc' }],
  updated: [{ updatedAt: 'desc' }],
} satisfies Record<AdminTicketListQuery['sort'], Prisma.TicketOrderByWithRelationInput[]>;

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

export async function createTicket(user: SessionUser, input: CreateTicketInput) {
  const authorId = requireAuthorId(user);

  if (input.bookId) {
    const ownsBook = await prisma.book.count({ where: { id: input.bookId, authorId } });
    if (!ownsBook) throw new ValidationError([{ field: 'body.bookId', message: 'This book is not in your catalogue' }]);
  }

  const ticket = await prisma.ticket.create({
    data: {
      authorId,
      bookId: input.bookId,
      subject: input.subject,
      description: input.description,
      attachmentName: input.attachment?.fileName,
      attachmentSize: input.attachment?.fileSize,
      attachmentType: input.attachment?.mimeType,
    },
    include: dto.authorTicketInclude,
  });

  // The ticket is saved before any AI work starts, so an AI outage can never stop an author raising a ticket.
  enqueueClassification(ticket.id);
  realtimeHub.publish({ ticketId: ticket.id, authorId, reason: 'created' }, 'author-and-admins');
  return dto.toAuthorTicketDto(ticket);
}

export async function listAuthorTickets(user: SessionUser, query: AuthorTicketListQuery) {
  const where: Prisma.TicketWhereInput = {
    authorId: requireAuthorId(user),
    ...(query.status && { status: { in: query.status } }),
  };
  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      include: dto.authorTicketInclude,
      orderBy: { createdAt: 'desc' },
      ...paginate(query),
    }),
    prisma.ticket.count({ where }),
  ]);
  return { data: tickets.map(dto.toAuthorTicketDto), meta: pageMeta(query, total) };
}

export async function addAuthorMessage(user: SessionUser, ticketId: string, input: AuthorMessageInput) {
  const authorId = requireAuthorId(user);
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, authorId },
    select: { status: true },
  });
  if (!ticket) throw new NotFoundError('Ticket');
  if (ticket.status === TicketStatus.CLOSED) {
    throw new ConflictError('This ticket is closed. Please raise a new ticket if you need more help.');
  }

  // A reply on a resolved ticket means the issue isn't settled, so it goes back into the open queue.
  const reopen = ticket.status === TicketStatus.RESOLVED;
  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId, senderId: user.id, body: input.body },
      include: dto.messageInclude,
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: reopen ? { status: TicketStatus.OPEN, resolvedAt: null } : { updatedAt: new Date() },
    }),
  ]);
  realtimeHub.publish({ ticketId, authorId, reason: 'author_message' }, 'author-and-admins');
  return dto.toMessageDto(message);
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export async function getTicket(user: SessionUser, ticketId: string) {
  if (user.role === 'ADMIN') {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: dto.adminTicketInclude });
    if (!ticket) throw new NotFoundError('Ticket');
    return dto.toAdminTicketDto(ticket);
  }

  // Another author's ticket is reported as "not found", so ticket ids cannot be probed.
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, authorId: requireAuthorId(user) },
    include: dto.authorTicketInclude,
  });
  if (!ticket) throw new NotFoundError('Ticket');
  return dto.toAuthorTicketDto(ticket);
}

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

export async function listAdminTickets(admin: SessionUser, query: AdminTicketListQuery) {
  const where: Prisma.TicketWhereInput = {
    ...(query.status && { status: { in: query.status } }),
    ...(query.category && { category: { in: query.category } }),
    ...(query.priority && { priority: { in: query.priority } }),
    ...(query.authorId && { authorId: query.authorId }),
    ...(query.assignee && { assigneeId: resolveAssigneeFilter(query.assignee, admin) }),
    ...createdAtRange(query.from, query.to),
  };
  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      include: dto.adminTicketListInclude,
      orderBy: ADMIN_SORTS[query.sort],
      ...paginate(query),
    }),
    prisma.ticket.count({ where }),
  ]);
  return { data: tickets.map(dto.toAdminTicketSummaryDto), meta: pageMeta(query, total) };
}

export async function updateTicket(ticketId: string, input: UpdateTicketInput) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { resolvedAt: true } });
  if (!ticket) throw new NotFoundError('Ticket');
  if (input.assigneeId) await assertAdminUser(input.assigneeId);

  const data: Prisma.TicketUncheckedUpdateInput = {
    ...(input.status && statusChange(input.status, ticket.resolvedAt)),
    // Overrides record their source so the AI's original suggestion stays comparable (see aiCategory/aiPriority).
    ...(input.category && { category: input.category, categorySource: ClassificationSource.ADMIN }),
    ...(input.priority && { priority: input.priority, prioritySource: ClassificationSource.ADMIN }),
    ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
  };

  const updated = await prisma.ticket.update({ where: { id: ticketId }, data, include: dto.adminTicketInclude });
  // Authors see status changes; category, priority and assignment are internal.
  realtimeHub.publish(
    { ticketId, authorId: updated.authorId, reason: input.status ? 'status' : 'triage' },
    input.status ? 'author-and-admins' : 'admins',
  );
  return dto.toAdminTicketDto(updated);
}

export async function addAdminMessage(admin: SessionUser, ticketId: string, input: AdminMessageInput) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { authorId: true, status: true, resolvedAt: true, assigneeId: true, firstResponseAt: true },
  });
  if (!ticket) throw new NotFoundError('Ticket');

  // AI drafts mark facts they don't know as [CONFIRM: ...]. Never let one reach an author.
  if (findPlaceholders(input.body).length > 0) {
    throw new ValidationError([{ field: 'body.body', message: 'Replace the [CONFIRM: …] placeholders before sending' }]);
  }

  const draft = input.draftId
    ? await prisma.aiDraft.findFirst({ where: { id: input.draftId, ticketId }, select: { id: true, reply: true } })
    : null;
  if (input.draftId && !draft) {
    throw new ValidationError([{ field: 'body.draftId', message: 'This draft does not belong to the ticket' }]);
  }

  // Replying to a new ticket means someone is on it. An explicit status (e.g. "send & resolve") takes precedence.
  const nextStatus = input.status ?? (ticket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : ticket.status);

  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId: admin.id,
        body: input.body,
        aiDraftId: draft?.id,
        draftEdited: draft ? normalizeWhitespace(draft.reply) !== normalizeWhitespace(input.body) : null,
      },
      include: dto.messageInclude,
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...statusChange(nextStatus, ticket.resolvedAt),
        firstResponseAt: ticket.firstResponseAt ?? new Date(),
        // Replying claims an unassigned ticket, so two admins don't answer the same author.
        assigneeId: ticket.assigneeId ?? admin.id,
      },
    }),
  ]);
  realtimeHub.publish({ ticketId, authorId: ticket.authorId, reason: 'reply' }, 'author-and-admins');
  return dto.toMessageDto(message);
}

export async function listNotes(ticketId: string) {
  await assertTicketExists(ticketId);
  const notes = await prisma.internalNote.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    include: dto.noteInclude,
  });
  return notes.map(dto.toNoteDto);
}

export async function addNote(admin: SessionUser, ticketId: string, input: NoteInput) {
  const { authorId } = await findTicketOwner(ticketId);
  // Deliberately does not touch the ticket, so internal activity never shows up on the author's side.
  const note = await prisma.internalNote.create({
    data: { ticketId, adminId: admin.id, body: input.body },
    include: dto.noteInclude,
  });
  realtimeHub.publish({ ticketId, authorId, reason: 'note' }, 'admins');
  return dto.toNoteDto(note);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Keeps `resolvedAt` consistent with status: stamped when first resolved/closed, cleared on reopen. */
function statusChange(status: TicketStatus, currentResolvedAt: Date | null) {
  const isDone = status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED;
  return { status, resolvedAt: isDone ? (currentResolvedAt ?? new Date()) : null };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function resolveAssigneeFilter(assignee: string, admin: SessionUser): string | null {
  if (assignee === 'unassigned') return null;
  if (assignee === 'me') return admin.id;
  return assignee;
}

function createdAtRange(from?: string, to?: string): Prisma.TicketWhereInput {
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from && { gte: parseIsoDate(from) }),
      ...(to && { lt: addDays(parseIsoDate(to), 1) }), // `to` is inclusive of the whole day
    },
  };
}

async function assertTicketExists(ticketId: string) {
  const exists = await prisma.ticket.count({ where: { id: ticketId } });
  if (!exists) throw new NotFoundError('Ticket');
}

async function findTicketOwner(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { authorId: true } });
  if (!ticket) throw new NotFoundError('Ticket');
  return ticket;
}

async function assertAdminUser(userId: string) {
  const isAdmin = await prisma.user.count({ where: { id: userId, role: 'ADMIN' } });
  if (!isAdmin) throw new ValidationError([{ field: 'body.assigneeId', message: 'Tickets can only be assigned to admins' }]);
}

function paginate(query: { page: number; pageSize: number }) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

function pageMeta(query: { page: number; pageSize: number }, total: number) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
