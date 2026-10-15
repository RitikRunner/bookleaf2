import { prisma } from '../../lib/prisma.js';
import { dataAsOfDate } from '../../config/env.js';
import { NotFoundError } from '../../lib/errors.js';
import { toIsoDate } from '../../lib/dates.js';
import type { SessionUser } from '../../lib/session.js';
import { summarizeRoyalties } from '../../domain/royalty.js';

const authorInclude = {
  user: { select: { name: true, email: true } },
  books: { select: { publicationDate: true, royaltyEarned: true, royaltyPaid: true, royaltyPending: true, lastPayoutDate: true } },
} as const;

type AuthorRecord = NonNullable<Awaited<ReturnType<typeof findAuthor>>>;

function findAuthor(authorId: string) {
  return prisma.author.findUnique({ where: { id: authorId }, include: authorInclude });
}

function toAuthorDto(author: AuthorRecord) {
  return {
    id: author.id,
    name: author.user.name,
    email: author.user.email,
    phone: author.phone,
    city: author.city,
    joinedDate: toIsoDate(author.joinedDate),
    bookCount: author.books.length,
    royalty: summarizeRoyalties(author.books, dataAsOfDate),
  };
}

export async function getAuthor(user: SessionUser, authorId: string) {
  // Authors can only open their own profile; anyone else's is reported as not found.
  if (user.role === 'AUTHOR' && user.authorId !== authorId) throw new NotFoundError('Author');
  const author = await findAuthor(authorId);
  if (!author) throw new NotFoundError('Author');
  return toAuthorDto(author);
}

export async function listAuthors() {
  const authors = await prisma.author.findMany({ include: authorInclude, orderBy: { id: 'asc' } });
  return authors.map(toAuthorDto);
}
