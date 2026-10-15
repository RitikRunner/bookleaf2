import { prisma } from '../../lib/prisma.js';
import { authorScope } from '../../lib/access.js';
import { NotFoundError } from '../../lib/errors.js';
import type { SessionUser } from '../../lib/session.js';
import { toBookDto } from './books.dto.js';

export async function listBooks(user: SessionUser, filter: { authorId?: string }) {
  const books = await prisma.book.findMany({
    where: { ...(filter.authorId && { authorId: filter.authorId }), ...authorScope(user) },
    // Books still in production have no publication date and are listed first.
    orderBy: [{ publicationDate: { sort: 'desc', nulls: 'first' } }, { title: 'asc' }],
  });
  return books.map(toBookDto);
}

export async function getBook(user: SessionUser, bookId: string) {
  const book = await prisma.book.findFirst({ where: { id: bookId, ...authorScope(user) } });
  // Another author's book is reported as "not found", not "forbidden", so ids cannot be probed.
  if (!book) throw new NotFoundError('Book');
  return toBookDto(book);
}
