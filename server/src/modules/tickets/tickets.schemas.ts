import { z } from 'zod';
import { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

function text(label: string, min: number, max: number) {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, min === 1 ? `${label} cannot be empty` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);
}

/** Accepts `?status=OPEN,IN_PROGRESS` as well as a single value. */
function commaSeparated<T extends z.ZodType<unknown, string>>(item: T) {
  return z
    .string()
    .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(item).min(1));
}

export const ticketParams = z.object({
  ticketId: z.string().trim().min(1).max(64),
});

export const createTicketSchema = z.object({
  bookId: z.string().trim().min(1).nullable().default(null), // null = "General / Account level"
  subject: text('Subject', 5, 150),
  description: text('Description', 20, 5000),
  // Metadata only: the file itself is not uploaded (see README, "Known limitations").
  attachment: z
    .object({
      fileName: z.string().trim().min(1).max(255),
      fileSize: z.number().int().positive().max(MAX_ATTACHMENT_BYTES, 'Attachments must be 10 MB or smaller'),
      mimeType: z.enum(ATTACHMENT_TYPES, { error: 'Attachments must be JPG, PNG, WebP or PDF' }),
    })
    .optional(),
});

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

/** Authors can only filter by status. Unknown keys are stripped, so they cannot filter on internal fields like priority. */
export const authorTicketListQuery = z.object({
  status: commaSeparated(z.enum(TicketStatus)).optional(),
  ...pagination,
});

export const adminTicketListQuery = z
  .object({
    status: commaSeparated(z.enum(TicketStatus)).optional(),
    category: commaSeparated(z.enum(TicketCategory)).optional(),
    priority: commaSeparated(z.enum(TicketPriority)).optional(),
    assignee: z.string().trim().min(1).optional(), // "me", "unassigned", or an admin user id
    authorId: z.string().trim().min(1).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    // "priority": most urgent first, then oldest first, so long-waiting urgent tickets are on top.
    sort: z.enum(['priority', 'oldest', 'newest', 'updated']).default('priority'),
    ...pagination,
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

export const updateTicketSchema = z
  .object({
    status: z.enum(TicketStatus).optional(),
    category: z.enum(TicketCategory).optional(),
    priority: z.enum(TicketPriority).optional(),
    assigneeId: z.string().trim().min(1).nullable().optional(), // null unassigns
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one of: status, category, priority, assigneeId',
  });

export const authorMessageSchema = z.object({
  body: text('Message', 1, 5000),
});

export const adminMessageSchema = authorMessageSchema.extend({
  // Lets the UI "send and resolve" in one atomic request.
  status: z.enum(TicketStatus).optional(),
  // The AI draft this reply started from, if any, so we can measure how often drafts are used as written.
  draftId: z.string().trim().min(1).optional(),
});

export const noteSchema = z.object({
  body: text('Note', 1, 5000),
});

export type CreateTicketInput = z.output<typeof createTicketSchema>;
export type AuthorTicketListQuery = z.output<typeof authorTicketListQuery>;
export type AdminTicketListQuery = z.output<typeof adminTicketListQuery>;
export type UpdateTicketInput = z.output<typeof updateTicketSchema>;
export type AuthorMessageInput = z.output<typeof authorMessageSchema>;
export type AdminMessageInput = z.output<typeof adminMessageSchema>;
export type NoteInput = z.output<typeof noteSchema>;
