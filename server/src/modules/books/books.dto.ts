import type { Book } from '@prisma/client';
import { PLATFORM_LABELS, PRINT_PARTNER_LABELS, STAGE_LABELS, STAGE_ORDER } from '../../domain/labels.js';
import { toIsoDate } from '../../lib/dates.js';

export function toBookDto(book: Book) {
  const isPublished = book.stage === 'PUBLISHED_LIVE';

  return {
    id: book.id,
    title: book.title,
    genre: book.genre,
    isbn: book.isbn,
    // Books still in production already carry an ISBN in the dataset, although assignment is a later stage.
    // We show it as reserved rather than implying it is live on retail platforms.
    isbnStatus: !book.isbn ? 'NOT_ASSIGNED' : isPublished ? 'ASSIGNED' : 'RESERVED',
    status: isPublished ? 'PUBLISHED' : 'IN_PRODUCTION',
    stage: { code: book.stage, label: STAGE_LABELS[book.stage], step: STAGE_ORDER.indexOf(book.stage) + 1, of: STAGE_ORDER.length },
    publicationDate: book.publicationDate ? toIsoDate(book.publicationDate) : null,
    mrp: book.mrp,
    royaltyPerCopy: book.royaltyPerCopy,
    copiesSold: book.copiesSold,
    royalty: {
      earned: book.royaltyEarned,
      paid: book.royaltyPaid,
      pending: book.royaltyPending,
      lastPayoutDate: book.lastPayoutDate ? toIsoDate(book.lastPayoutDate) : null,
      neverPaid: book.royaltyEarned > 0 && book.royaltyPaid === 0,
    },
    printPartner: book.printPartner ? { code: book.printPartner, label: PRINT_PARTNER_LABELS[book.printPartner] } : null,
    availableOn: book.availableOn.map((platform) => ({ code: platform, label: PLATFORM_LABELS[platform] })),
  };
}

export type BookDto = ReturnType<typeof toBookDto>;
