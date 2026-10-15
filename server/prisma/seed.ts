/**
 * Seeds the database from data/bookleaf_sample_data.json.
 *
 * - Validates the file's shape and its royalty arithmetic before writing anything.
 * - Idempotent for reference data (users, authors, books are upserted).
 * - Resets demo tickets on every run, so re-seeding gives a clean demo.
 * - With --if-empty it does nothing when the database already has users (used on deployment start-up).
 */
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Platform, type PrintPartner, type ProductionStage } from '@prisma/client';
import { z } from 'zod';
import { codeForLabel, PLATFORM_LABELS, PRINT_PARTNER_LABELS, stageFromDatasetStatus } from '../src/domain/labels.js';
import { parseIsoDate } from '../src/lib/dates.js';
import { DEMO_ADMINS, DEMO_TICKETS, type AdminKey } from './demo-tickets.js';

const DATASET_URL = new URL('../../data/bookleaf_sample_data.json', import.meta.url);
const AUTHOR_PASSWORD = process.env.SEED_AUTHOR_PASSWORD ?? 'Author@123';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
const HOUR_MS = 60 * 60 * 1000;

const isoDate = z.iso.date();
const amount = z.number().int().min(0);

const datasetSchema = z.object({
  authors: z.array(
    z.object({
      author_id: z.string().min(1),
      name: z.string().min(1),
      email: z.email(),
      phone: z.string().nullable(),
      city: z.string().nullable(),
      joined_date: isoDate,
      books: z.array(
        z.object({
          book_id: z.string().min(1),
          title: z.string().min(1),
          isbn: z.string().nullable(),
          genre: z.string().min(1),
          publication_date: isoDate.nullable(),
          status: z.string(),
          mrp: amount.nullable(),
          author_royalty_per_copy: amount.nullable(),
          total_copies_sold: amount,
          total_royalty_earned: amount,
          royalty_paid: amount,
          royalty_pending: amount,
          last_royalty_payout_date: isoDate.nullable(),
          print_partner: z.string().nullable(),
          available_on: z.array(z.string()),
        }),
      ),
    }),
  ),
});

type DatasetBook = z.output<typeof datasetSchema>['authors'][number]['books'][number];

const prisma = new PrismaClient();

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Unrecognised ${description}`);
  return value;
}

/** Rejects data whose royalty figures don't add up, rather than showing authors inconsistent numbers. */
function assertRoyaltyArithmetic(book: DatasetBook) {
  if (book.royalty_paid + book.royalty_pending !== book.total_royalty_earned) {
    throw new Error(`${book.book_id}: paid + pending does not equal total earned`);
  }
  if (book.author_royalty_per_copy !== null && book.author_royalty_per_copy * book.total_copies_sold !== book.total_royalty_earned) {
    throw new Error(`${book.book_id}: royalty per copy × copies sold does not equal total earned`);
  }
}

function toBookRecord(book: DatasetBook, authorId: string) {
  assertRoyaltyArithmetic(book);
  const stage: ProductionStage = required(stageFromDatasetStatus(book.status), `status "${book.status}" on ${book.book_id}`);
  const printPartner: PrintPartner | null = book.print_partner
    ? required(codeForLabel(PRINT_PARTNER_LABELS, book.print_partner), `print partner "${book.print_partner}"`)
    : null;
  const availableOn: Platform[] = book.available_on.map((label) =>
    required(codeForLabel(PLATFORM_LABELS, label), `platform "${label}" on ${book.book_id}`),
  );

  return {
    id: book.book_id,
    authorId,
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    publicationDate: book.publication_date ? parseIsoDate(book.publication_date) : null,
    stage,
    mrp: book.mrp,
    royaltyPerCopy: book.author_royalty_per_copy,
    copiesSold: book.total_copies_sold,
    royaltyEarned: book.total_royalty_earned,
    royaltyPaid: book.royalty_paid,
    royaltyPending: book.royalty_pending,
    lastPayoutDate: book.last_royalty_payout_date ? parseIsoDate(book.last_royalty_payout_date) : null,
    printPartner,
    availableOn,
  };
}

async function seedAuthorsAndBooks() {
  const dataset = datasetSchema.parse(JSON.parse(await readFile(DATASET_URL, 'utf8')));
  const passwordHash = await bcrypt.hash(AUTHOR_PASSWORD, 10);
  const userIdByAuthorId = new Map<string, string>();

  for (const author of dataset.authors) {
    const email = author.email.toLowerCase();
    const books = author.books.map((book) => toBookRecord(book, author.author_id));

    const user = await prisma.user.upsert({
      where: { email },
      update: { name: author.name, passwordHash, role: 'AUTHOR' },
      create: { email, name: author.name, passwordHash, role: 'AUTHOR' },
    });
    const profile = { phone: author.phone, city: author.city, joinedDate: parseIsoDate(author.joined_date) };
    await prisma.author.upsert({
      where: { id: author.author_id },
      update: { userId: user.id, ...profile },
      create: { id: author.author_id, userId: user.id, ...profile },
    });
    for (const book of books) {
      await prisma.book.upsert({ where: { id: book.id }, update: book, create: book });
    }
    userIdByAuthorId.set(author.author_id, user.id);
  }

  const bookCount = dataset.authors.reduce((count, author) => count + author.books.length, 0);
  console.log(`✓ ${dataset.authors.length} authors and ${bookCount} books imported`);
  return userIdByAuthorId;
}

async function seedAdmins() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminIds = {} as Record<AdminKey, string>;

  for (const key of Object.keys(DEMO_ADMINS) as AdminKey[]) {
    const admin = DEMO_ADMINS[key];
    const user = await prisma.user.upsert({
      where: { email: admin.email },
      update: { name: admin.name, passwordHash, role: 'ADMIN' },
      create: { email: admin.email, name: admin.name, passwordHash, role: 'ADMIN' },
    });
    adminIds[key] = user.id;
  }

  console.log(`✓ ${Object.keys(DEMO_ADMINS).length} admin accounts ready`);
  return adminIds;
}

async function seedDemoTickets(userIdByAuthorId: Map<string, string>, adminIds: Record<AdminKey, string>) {
  await prisma.ticket.deleteMany(); // messages and notes cascade
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR_MS);

  for (const ticket of DEMO_TICKETS) {
    const authorUserId = required(userIdByAuthorId.get(ticket.authorId), `author ${ticket.authorId}`);
    const replies = ticket.replies ?? [];
    const firstAdminReply = replies.find((reply) => reply.from !== 'author');
    const lastActivity = Math.min(ticket.hoursAgo, ...replies.map((reply) => reply.hoursAgo));

    await prisma.ticket.create({
      data: {
        authorId: ticket.authorId,
        bookId: ticket.bookId,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status ?? 'OPEN',
        assigneeId: ticket.assignee ? adminIds[ticket.assignee] : null,
        createdAt: at(ticket.hoursAgo),
        updatedAt: at(lastActivity),
        firstResponseAt: firstAdminReply ? at(firstAdminReply.hoursAgo) : null,
        resolvedAt: ticket.status === 'RESOLVED' ? at(lastActivity) : null,
        messages: {
          create: replies.map((reply) => ({
            senderId: reply.from === 'author' ? authorUserId : adminIds[reply.from],
            body: reply.body,
            createdAt: at(reply.hoursAgo),
          })),
        },
        notes: {
          create: (ticket.notes ?? []).map((note) => ({
            adminId: adminIds[note.by],
            body: note.body,
            createdAt: at(note.hoursAgo),
          })),
        },
      },
    });
  }

  console.log(`✓ ${DEMO_TICKETS.length} demo tickets created`);
}

async function main() {
  // Deployments run the seed on every start with --if-empty, so a restart never wipes tickets created since.
  if (process.argv.includes('--if-empty') && (await prisma.user.count()) > 0) {
    console.log('Database already seeded; skipping.');
    return;
  }
  const userIdByAuthorId = await seedAuthorsAndBooks();
  const adminIds = await seedAdmins();
  await seedDemoTickets(userIdByAuthorId, adminIds);
  console.log(`\nDemo logins: any author email from the dataset / ${AUTHOR_PASSWORD}`);
  console.log(`             ${DEMO_ADMINS.lead.email} or ${DEMO_ADMINS.agent.email} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
