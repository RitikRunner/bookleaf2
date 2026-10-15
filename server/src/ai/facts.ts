import type { Book, Platform, TicketCategory } from '@prisma/client';
import { PLATFORM_LABELS, PRINT_PARTNER_LABELS, STAGE_LABELS, STAGE_ORDER } from '../domain/labels.js';
import {
  impliedNetProfitPerCopy,
  lastClosedPayoutQuarter,
  ROYALTY_POLICY,
  type RoyaltySummary,
} from '../domain/royalty.js';
import { parseIsoDate } from '../lib/dates.js';
import type { TicketContext } from './ticketContext.js';

/*
 * Turns database records into short factual statements for the prompt. Everything numeric or date-based is
 * worked out here, so the model reads "paid by 14 February 2026" instead of doing calendar maths itself.
 * Facts are selected by category so a printing question doesn't carry royalty figures (and vice versa).
 */

type FactSection = 'status' | 'royalty' | 'accountRoyalty' | 'isbn' | 'platforms' | 'printing' | 'production' | 'catalogue';

const SECTIONS_BY_CATEGORY: Record<TicketCategory, FactSection[]> = {
  ROYALTY_PAYMENTS: ['status', 'royalty', 'accountRoyalty'],
  ISBN_METADATA: ['status', 'isbn', 'platforms'],
  PRINTING_QUALITY: ['status', 'printing'],
  DISTRIBUTION_AVAILABILITY: ['status', 'platforms'],
  BOOK_STATUS_PRODUCTION: ['status', 'production'],
  GENERAL_INQUIRY: ['status', 'catalogue'],
};

const ALL_SECTIONS: FactSection[] = ['status', 'royalty', 'accountRoyalty', 'isbn', 'platforms', 'printing', 'production', 'catalogue'];

const ALL_PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[];

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatLongDate(date: Date | string): string {
  const value = typeof date === 'string' ? parseIsoDate(date) : date;
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const isPublished = (book: Book) => book.stage === 'PUBLISHED_LIVE';
const bullets = (lines: string[]) => lines.map((line) => `- ${line}`).join('\n');

// ---------------------------------------------------------------------------
// Draft facts (detailed, selected by category)
// ---------------------------------------------------------------------------

export function draftFacts({ ticket, royalty }: TicketContext, category: TicketCategory | null): string {
  const sections = new Set(category ? SECTIONS_BY_CATEGORY[category] : ALL_SECTIONS);
  const { author, book } = ticket;
  const firstName = author.user.name.split(' ')[0];
  const blocks = [`Author: ${author.user.name} (address them as ${firstName}), with BookLeaf since ${formatLongDate(author.joinedDate)}.`];

  if (book) {
    const bookFacts = [
      ...(sections.has('status') ? statusFacts(book) : []),
      ...(sections.has('production') ? productionFacts(book) : []),
      ...(sections.has('isbn') ? isbnFacts(book) : []),
      ...(sections.has('platforms') ? platformFacts(book) : []),
      ...(sections.has('printing') ? printingFacts(book) : []),
      ...(sections.has('royalty') ? bookRoyaltyFacts(book, royalty) : []),
    ];
    blocks.push(`Book this ticket is about: "${book.title}" (${book.genre})\n${bullets(bookFacts)}`);
  } else {
    blocks.push('No specific book: this is a general, account-level ticket.');
  }

  if (sections.has('catalogue') || !book) {
    blocks.push(`The author's books:\n${bullets(author.books.map((item) => `"${item.title}": ${statusLabel(item)}`))}`);
  }
  if (sections.has('accountRoyalty') || (!book && category === 'ROYALTY_PAYMENTS')) {
    blocks.push(accountRoyaltyFacts(royalty, author.books));
  }

  return blocks.join('\n\n');
}

function statusLabel(book: Book): string {
  return isPublished(book) ? 'Published & Live' : `in production (${STAGE_LABELS[book.stage]})`;
}

function statusFacts(book: Book): string[] {
  if (isPublished(book)) {
    return [`Status: Published & Live${book.publicationDate ? ` since ${formatLongDate(book.publicationDate)}` : ''}.`];
  }
  const step = STAGE_ORDER.indexOf(book.stage) + 1;
  return [
    `Status: in production, currently at ${STAGE_LABELS[book.stage]} (stage ${step} of ${STAGE_ORDER.length}). Not yet published, so there are no sales or royalties yet.`,
  ];
}

function productionFacts(book: Book): string[] {
  if (isPublished(book)) return ['Production is complete.'];
  const remaining = STAGE_ORDER.slice(STAGE_ORDER.indexOf(book.stage) + 1).map((stage) => STAGE_LABELS[stage]);
  return [
    `Remaining stages: ${remaining.join(' → ')}.`,
    'The date the book entered its current stage is not recorded in our system.',
  ];
}

function isbnFacts(book: Book): string[] {
  if (!book.isbn) return ['No ISBN has been assigned yet.'];
  return isPublished(book)
    ? [`ISBN on record: ${book.isbn}.`]
    : [`ISBN ${book.isbn} is reserved for this book and becomes active at publication.`];
}

function platformFacts(book: Book): string[] {
  if (book.availableOn.length === 0) return ['Not listed on any retail platform yet.'];
  const notListed = ALL_PLATFORMS.filter((platform) => !book.availableOn.includes(platform));
  return [
    `Listed on: ${book.availableOn.map((platform) => PLATFORM_LABELS[platform]).join(', ')}.`,
    ...(notListed.length
      ? [`Not part of this book's distribution (never listed there, so not a sync issue): ${notListed.map((platform) => PLATFORM_LABELS[platform]).join(', ')}.`]
      : []),
  ];
}

function printingFacts(book: Book): string[] {
  if (!book.printPartner) return ['Not printed yet.'];
  const partner = book.printPartner === 'IN_HOUSE' ? 'BookLeaf in-house facility (Delhi)' : PRINT_PARTNER_LABELS[book.printPartner];
  return [`Printed by: ${partner}.`];
}

function bookRoyaltyFacts(book: Book, royalty: RoyaltySummary): string[] {
  if (!isPublished(book) || book.royaltyPerCopy === null || book.mrp === null) {
    return ['No royalties yet: royalties start once the book is published and selling.'];
  }
  const lines = [
    `Pricing: MRP ${formatInr(book.mrp)}; author royalty ${formatInr(book.royaltyPerCopy)} per copy, which is 80% of ${formatInr(impliedNetProfitPerCopy(book.royaltyPerCopy))} net profit per copy.`,
    `Sales: ${book.copiesSold.toLocaleString('en-IN')} copies sold; royalty earned ${formatInr(book.royaltyEarned)}, paid ${formatInr(book.royaltyPaid)}, pending ${formatInr(book.royaltyPending)}.`,
    book.lastPayoutDate
      ? `Last payout for this book: ${formatLongDate(book.lastPayoutDate)}.`
      : 'No payout has been made for this book yet.',
  ];
  if (book.royaltyEarned > 0 && book.royaltyPaid === 0 && royalty.lastPayoutDate) {
    lines.push(
      `This book has never been paid although other books on the account have (last payout ${formatLongDate(royalty.lastPayoutDate)}). This looks inconsistent and should be checked with finance.`,
    );
  }
  return lines;
}

function accountRoyaltyFacts(royalty: RoyaltySummary, books: Book[]): string {
  const header = `Royalty account across all ${books.length} book(s), figures as of ${formatLongDate(royalty.asOf)}:`;
  return `${header}\n${bullets([
    `Earned ${formatInr(royalty.totalEarned)}, paid ${formatInr(royalty.totalPaid)}, pending ${formatInr(royalty.totalPending)}.`,
    royalty.lastPayoutDate ? `Last payout: ${formatLongDate(royalty.lastPayoutDate)}.` : 'No payout has ever been made to this author.',
    payoutStateExplanation(royalty, books),
    `Next payout cycle: royalties for the quarter ending ${formatLongDate(royalty.nextPayout.quarterEnding)} are paid by ${formatLongDate(royalty.nextPayout.payBy)}.`,
    'Bank details are not visible to support. If a payment may have failed, ask the author to confirm the bank account linked in their dashboard.',
  ])}`;
}

function payoutStateExplanation(royalty: RoyaltySummary, books: Book[]): string {
  const minimum = formatInr(ROYALTY_POLICY.minimumPayoutInr);
  switch (royalty.payoutState) {
    case 'NOTHING_PENDING':
      return 'Everything earned so far has been paid; nothing is pending.';
    case 'BELOW_MINIMUM':
      return `The pending balance of ${formatInr(royalty.totalPending)} is below the ${minimum} minimum payout, so it rolls over to the next quarter and is paid once the total reaches ${minimum}. Nothing is overdue.`;
    case 'SCHEDULED':
      return `The pending balance is above the ${minimum} minimum and is due in the next payout cycle. Nothing is overdue.`;
    case 'NEEDS_REVIEW': {
      const closedQuarter = lastClosedPayoutQuarter(parseIsoDate(royalty.asOf));
      const earliest = books
        .map((book) => book.publicationDate)
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const history = royalty.lastPayoutDate
        ? `the last payout was on ${formatLongDate(royalty.lastPayoutDate)}`
        : `no payout has ever been made${earliest ? ` although the account has been earning since ${formatLongDate(earliest)}` : ''}`;
      return `The pending balance is above the ${minimum} minimum, but ${history}, so the payout for the quarter ending ${formatLongDate(closedQuarter)} appears to have been missed. This looks like BookLeaf's error: own it and escalate to finance.`;
    }
  }
}

// ---------------------------------------------------------------------------
// Classification facts (brief: just enough to judge urgency)
// ---------------------------------------------------------------------------

const PAYOUT_STATE_SUMMARY: Record<RoyaltySummary['payoutState'], string> = {
  NOTHING_PENDING: 'fully paid, nothing pending',
  BELOW_MINIMUM: 'below the ₹1,000 minimum payout, so it rolls over (expected, not overdue)',
  SCHEDULED: 'due in the next payout cycle (not overdue)',
  NEEDS_REVIEW: 'above the ₹1,000 minimum with no payout for the last closed cycle (possible missed payout)',
};

export function classificationFacts({ ticket, royalty }: TicketContext): string {
  const { book } = ticket;
  const bookLine = book
    ? `Book in question: "${book.title}": ${statusLabel(book)}; listed on ${book.availableOn.map((platform) => PLATFORM_LABELS[platform]).join(', ') || 'no platforms yet'}.`
    : 'No specific book selected (general / account-level ticket).';
  const neverPaid = book && book.royaltyEarned > 0 && book.royaltyPaid === 0 && royalty.lastPayoutDate;
  return bullets([
    `Author's royalty account: ${formatInr(royalty.totalPending)} pending; ${PAYOUT_STATE_SUMMARY[royalty.payoutState]}.`,
    bookLine,
    ...(neverPaid
      ? [`This book has earned ${formatInr(book.royaltyEarned)} but has never been paid, although other books on the account have.`]
      : []),
  ]);
}
